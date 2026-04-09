import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";

const AcceptSchema = z.object({
  applicationId: z.string().uuid(),
  contractId: z.string().uuid(),
  contractVersion: z.string(),
  userId: z.string().uuid(),
  acceptedAt: z.string().datetime(),
  checks: z.object({
    read: z.boolean(),
    lgpd: z.boolean(),
    antifraud: z.boolean(),
    signature: z.boolean(),
  }),
});

/**
 * POST /api/contrato/aceitar
 * Records an immutable contract acceptance with IP, user agent, and all checkbox states.
 * contract_acceptances table has NO UPDATE/DELETE RLS policies — fully immutable.
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
    const parsed = AcceptSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { applicationId, contractId, contractVersion, acceptedAt, checks } = parsed.data;

    // Verify application belongs to user
    const { data: app, error: fetchErr } = await admin
      .from("applications")
      .select("id, status, user_id")
      .eq("id", applicationId)
      .single();

    if (fetchErr || !app) {
      return NextResponse.json({ error: "Operação não encontrada" }, { status: 404 });
    }

    if (app.user_id !== user.id) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    if (app.status !== "contract_pending") {
      return NextResponse.json(
        { error: `Status inválido para aceitar contrato: ${app.status}` },
        { status: 422 }
      );
    }

    // Collect IP and user agent for legal audit trail
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    // Record immutable acceptance
    const { data: acceptance, error: acceptErr } = await admin
      .from("contract_acceptances")
      .insert({
        application_id: applicationId,
        contract_id: contractId,
        contract_version: contractVersion,
        user_id: user.id,
        accepted_at: acceptedAt,
        ip_address: ipAddress,
        user_agent: userAgent,
        metadata: {
          checks,
          acceptedAt,
          browser: userAgent.substring(0, 200),
        },
      })
      .select("id")
      .single();

    if (acceptErr) {
      console.error("[POST /api/contrato/aceitar] insert error:", acceptErr);
      return NextResponse.json({ error: "Erro ao registrar aceite" }, { status: 500 });
    }

    // Advance application status to payment_pending
    await admin
      .from("applications")
      .update({ status: "payment_pending", updated_at: new Date().toISOString() })
      .eq("id", applicationId);

    // Log event
    await admin.from("application_logs").insert({
      application_id: applicationId,
      event_type: "contract_accepted",
      previous_status: "contract_pending",
      new_status: "payment_pending",
      changed_by: user.id,
      metadata: {
        contractId,
        contractVersion,
        acceptanceId: acceptance?.id,
        ipAddress,
      },
    });

    return NextResponse.json({
      success: true,
      acceptanceId: acceptance?.id,
      nextStatus: "payment_pending",
    });
  } catch (err) {
    console.error("[POST /api/contrato/aceitar]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
