import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import {
  generateContract,
  formatPaymentType,
  formatPixKeyType,
  formatContractDateTime,
} from "@/lib/contract";

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
  if (!rateLimit(getClientIp(req), 'contrato_aceitar', 5, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
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

    // Fetch full application data for contract generation
    const { data: app, error: fetchErr } = await admin
      .from("applications")
      .select("id, status, user_id, pix_amount, card_total, payment_type, installments, fee_pct, pix_key, pix_key_type, customer_name, customer_cpf")
      .eq("id", applicationId)
      .single();

    if (fetchErr || !app) {
      return NextResponse.json({ error: "Operação não encontrada" }, { status: 404 });
    }

    const application = app as {
      id: string;
      status: string;
      user_id: string;
      pix_amount: number;
      card_total: number;
      payment_type: 'debit' | 'credit' | 'credit_installments';
      installments?: number;
      fee_pct: number;
      pix_key: string;
      pix_key_type: string;
      customer_name: string;
      customer_cpf: string;
    };

    if (application.user_id !== user.id) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    if (application.status !== "contract_pending") {
      return NextResponse.json(
        { error: `Status inválido para aceitar contrato: ${application.status}` },
        { status: 422 }
      );
    }

    // Collect IP and user agent for legal audit trail
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    // Generate contract content
    let contractHash: string | undefined;
    try {
      const contractResult = await generateContract({
        idOperacao: applicationId,
        dataHora: formatContractDateTime(new Date(acceptedAt)),
        nomeCompleto: application.customer_name ?? "",
        cpf: application.customer_cpf ?? "",
        valorPix: application.pix_amount,
        valorTotalCartao: application.card_total,
        tipoPagamento: formatPaymentType(application.payment_type, application.installments),
        taxaEfetiva: `${Number(application.fee_pct).toFixed(2).replace(".", ",")}%`,
        chavePix: application.pix_key ?? "",
        tipoChavePix: formatPixKeyType(application.pix_key_type ?? ""),
        nomeOperadora: process.env.OPERADORA_NOME ?? "",
        cnpjOperadora: process.env.OPERADORA_CNPJ ?? "",
        cidadeOperadora: process.env.OPERADORA_CIDADE ?? "",
        estadoOperadora: process.env.OPERADORA_ESTADO ?? "",
      });

      contractHash = contractResult.hash;

      // Save generated contract
      await admin.from("contracts").insert({
        application_id: applicationId,
        content: contractResult.content,
        hash: contractResult.hash,
        version: contractResult.templateVersion,
        created_at: new Date().toISOString(),
      });
    } catch (contractErr) {
      // Non-blocking: log error but continue with acceptance
      console.error("[POST /api/contrato/aceitar] generateContract error:", contractErr);
    }

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
        contract_hash: contractHash,
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
        contractHash,
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
