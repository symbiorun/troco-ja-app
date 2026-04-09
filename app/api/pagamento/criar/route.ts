import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";

const CreatePaymentSchema = z.object({
  applicationId: z.string().uuid(),
  customerName: z.string().min(3),
  customerEmail: z.string().email(),
  customerCpf: z.string().length(11),
  amount: z.number().positive(),
  installments: z.number().int().min(1).max(12),
});

const ASAAS_BASE = process.env.ASAAS_BASE_URL ?? "https://sandbox.asaas.com/api/v3";
const ASAAS_KEY = process.env.ASAAS_API_KEY ?? "";

async function asaasPost(path: string, body: object) {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "access_token": ASAAS_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Asaas error ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * POST /api/pagamento/criar
 * Creates an Asaas customer + credit card charge, returns checkoutUrl.
 * Saves payment record to Supabase payments table.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const admin = createAdminClient();

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = CreatePaymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { applicationId, customerName, customerEmail, customerCpf, amount, installments } = parsed.data;

    // Verify application
    const { data: app } = await admin
      .from("applications")
      .select("id, status, user_id")
      .eq("id", applicationId)
      .single();

    if (!app || app.user_id !== user.id) {
      return NextResponse.json({ error: "Operação não encontrada" }, { status: 404 });
    }

    if (app.status !== "payment_pending") {
      return NextResponse.json(
        { error: `Status inválido para criar pagamento: ${app.status}` },
        { status: 422 }
      );
    }

    // Create or retrieve Asaas customer
    const nameParts = customerName.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ") || firstName;

    let customerId: string;
    try {
      // Search existing customer
      const searchRes = await fetch(
        `${ASAAS_BASE}/customers?cpfCnpj=${customerCpf}`,
        { headers: { "access_token": ASAAS_KEY } }
      );
      const searchData = await searchRes.json();

      if (searchData.data?.length > 0) {
        customerId = searchData.data[0].id;
      } else {
        // Create new customer
        const customer = await asaasPost("/customers", {
          name: `${firstName} ${lastName}`,
          email: customerEmail,
          cpfCnpj: customerCpf,
        });
        customerId = customer.id;
      }
    } catch (err) {
      console.error("[criar pagamento] customer error:", err);
      return NextResponse.json({ error: "Erro ao criar cliente no Asaas" }, { status: 502 });
    }

    // Create charge
    let charge: { id: string; invoiceUrl: string; status: string };
    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 1);
      const dueDateStr = dueDate.toISOString().split("T")[0];

      charge = await asaasPost("/payments", {
        customer: customerId,
        billingType: "CREDIT_CARD",
        value: amount,
        dueDate: dueDateStr,
        description: `TrocoJá — Operação ${applicationId.slice(0, 8).toUpperCase()}`,
        installmentCount: installments > 1 ? installments : undefined,
        installmentValue: installments > 1 ? Math.round((amount / installments) * 100) / 100 : undefined,
        externalReference: applicationId,
      });
    } catch (err) {
      console.error("[criar pagamento] charge error:", err);
      return NextResponse.json({ error: "Erro ao criar cobrança no Asaas" }, { status: 502 });
    }

    // Save to Supabase payments table
    await admin.from("payments").insert({
      application_id: applicationId,
      provider: "asaas",
      external_id: charge.id,
      amount,
      installments,
      status: "pending",
      checkout_url: charge.invoiceUrl,
      metadata: { asaas_customer_id: customerId },
    });

    // Log event
    await admin.from("application_logs").insert({
      application_id: applicationId,
      event_type: "payment_charge_created",
      previous_status: "payment_pending",
      new_status: "payment_pending",
      changed_by: user.id,
      metadata: { chargeId: charge.id, amount },
    });

    return NextResponse.json({
      paymentId: charge.id,
      checkoutUrl: charge.invoiceUrl,
      status: charge.status,
    });
  } catch (err) {
    console.error("[POST /api/pagamento/criar]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
