import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const ASAAS_BASE = process.env.ASAAS_BASE_URL ?? "https://sandbox.asaas.com/api/v3";
const ASAAS_KEY = process.env.ASAAS_API_KEY ?? "";

/**
 * GET /api/pagamento/status/[id]
 * Polls Asaas for the current payment status.
 * Also checks Supabase payments table for webhook-confirmed status.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const paymentId = params.id;

    // First check our own DB (webhook may have already confirmed)
    const { data: payment } = await supabase
      .from("payments")
      .select("status, external_id, application_id")
      .eq("external_id", paymentId)
      .single();

    if (payment?.status === "confirmed" || payment?.status === "received") {
      return NextResponse.json({ status: "CONFIRMED", source: "webhook" });
    }

    // Poll Asaas directly
    const res = await fetch(`${ASAAS_BASE}/payments/${paymentId}`, {
      headers: { "access_token": ASAAS_KEY },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Erro ao consultar Asaas" }, { status: 502 });
    }

    const data = await res.json();

    return NextResponse.json({
      status: data.status,         // PENDING | CONFIRMED | RECEIVED | OVERDUE
      value: data.value,
      netValue: data.netValue,
      paymentDate: data.paymentDate,
      source: "asaas",
    });
  } catch (err) {
    console.error("[GET /api/pagamento/status/[id]]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
