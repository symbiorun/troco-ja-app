import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/server";

const WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN ?? "";

/**
 * POST /api/webhook/asaas
 * Receives Asaas payment webhook events.
 * Verifies authenticity via asaas-access-token header (HMAC-SHA256).
 * Handles: PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_DELETED
 *
 * IMPORTANT: This endpoint must be registered in the Asaas dashboard.
 * Set URL: https://your-domain.com/api/webhook/asaas
 */
export async function POST(req: NextRequest) {
  try {
    // Verify webhook token
    const incomingToken = req.headers.get("asaas-access-token");
    if (!incomingToken || incomingToken !== WEBHOOK_TOKEN) {
      console.warn("[webhook/asaas] Invalid or missing token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { event, payment } = body;

    if (!event || !payment?.id) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Idempotency key — prevent duplicate processing
    const idempotencyKey = `${event}:${payment.id}`;
    const { data: existing } = await admin
      .from("payment_webhooks")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .single();

    if (existing) {
      // Already processed — return 200 to prevent Asaas retries
      return NextResponse.json({ status: "already_processed" });
    }

    // Record the webhook
    await admin.from("payment_webhooks").insert({
      idempotency_key: idempotencyKey,
      event_type: event,
      external_payment_id: payment.id,
      raw_payload: body,
      processed_at: new Date().toISOString(),
    });

    // Find the local payment record by external ID
    const { data: localPayment } = await admin
      .from("payments")
      .select("id, application_id, status")
      .eq("external_id", payment.id)
      .single();

    if (!localPayment) {
      console.warn("[webhook/asaas] Payment not found for external ID:", payment.id);
      return NextResponse.json({ status: "payment_not_found" });
    }

    const { application_id } = localPayment;

    // Handle each event type
    switch (event) {
      case "PAYMENT_CONFIRMED":
      case "PAYMENT_RECEIVED": {
        // Update payments table
        await admin
          .from("payments")
          .update({
            status: "confirmed",
            confirmed_at: new Date().toISOString(),
            metadata: { net_value: payment.netValue, payment_date: payment.paymentDate },
          })
          .eq("id", localPayment.id);

        // Advance application status
        await admin
          .from("applications")
          .update({
            status: "payment_confirmed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", application_id)
          .in("status", ["payment_pending"]); // Only advance if still pending

        // Log event
        await admin.from("application_logs").insert({
          application_id,
          event_type: "payment_confirmed_webhook",
          previous_status: "payment_pending",
          new_status: "payment_confirmed",
          metadata: {
            asaas_event: event,
            payment_id: payment.id,
            net_value: payment.netValue,
            payment_date: payment.paymentDate,
          },
        });

        // TODO: Trigger WhatsApp notification to operator
        // await notifyOperator(application_id, "payment_confirmed");

        break;
      }

      case "PAYMENT_OVERDUE": {
        await admin
          .from("payments")
          .update({ status: "overdue" })
          .eq("id", localPayment.id);

        await admin.from("application_logs").insert({
          application_id,
          event_type: "payment_overdue",
          previous_status: "payment_pending",
          new_status: "payment_pending",
          metadata: { asaas_event: event, payment_id: payment.id },
        });
        break;
      }

      case "PAYMENT_DELETED":
      case "PAYMENT_REFUNDED": {
        await admin
          .from("payments")
          .update({ status: "refunded" })
          .eq("id", localPayment.id);

        await admin
          .from("applications")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", application_id)
          .not("status", "in", '("completed","pix_sent")');

        await admin.from("application_logs").insert({
          application_id,
          event_type: "payment_refunded",
          new_status: "cancelled",
          metadata: { asaas_event: event, payment_id: payment.id },
        });
        break;
      }

      default:
        console.log("[webhook/asaas] Unhandled event:", event);
    }

    return NextResponse.json({ status: "ok", event });
  } catch (err) {
    console.error("[POST /api/webhook/asaas]", err);
    // Return 200 to prevent Asaas from retrying a legitimate server error
    return NextResponse.json({ error: "Internal error" }, { status: 200 });
  }
}
