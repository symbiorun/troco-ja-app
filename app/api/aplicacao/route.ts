import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";

const CreateApplicationSchema = z.object({
  // Simulation data
  pixAmount: z.number().positive(),
  cardTotal: z.number().positive(),
  feePct: z.number(),
  profitMarginPct: z.number(),
  installments: z.number().int().min(1).max(12),
  channel: z.enum(["online_link", "machine_delivery"]),
  // Customer data
  customerName: z.string().min(3),
  customerEmail: z.string().email(),
  customerCpf: z.string().length(11),
  customerPhone: z.string().optional(),
  // PIX data
  pixKey: z.string().min(1),
  pixKeyType: z.enum(["cpf", "phone", "email", "random", "cnpj"]),
  pixBankName: z.string().optional(),
  pixRecipientName: z.string().optional(),
  sameHolder: z.boolean().default(true),
});

/**
 * POST /api/aplicacao
 * Creates a new application in Supabase, linked to the authenticated user.
 * Logs the creation event in application_logs.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = CreateApplicationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const admin = createAdminClient();

    // Create application
    const { data: app, error: appErr } = await admin
      .from("applications")
      .insert({
        user_id: user.id,
        customer_name: data.customerName,
        customer_email: data.customerEmail,
        customer_cpf: data.customerCpf,
        customer_phone: data.customerPhone,
        pix_amount: data.pixAmount,
        card_total: data.cardTotal,
        fee_pct: data.feePct,
        profit_margin_pct: data.profitMarginPct,
        installments: data.installments,
        channel: data.channel,
        pix_key: data.pixKey,
        pix_key_type: data.pixKeyType,
        pix_bank_name: data.pixBankName,
        pix_recipient_name: data.pixRecipientName,
        same_holder: data.sameHolder,
        status: "pix_data_added",
      })
      .select("id, status")
      .single();

    if (appErr || !app) {
      console.error("[POST /api/aplicacao] insert error:", appErr);
      return NextResponse.json({ error: "Erro ao criar operação" }, { status: 500 });
    }

    // Log event
    await admin.from("application_logs").insert({
      application_id: app.id,
      event_type: "application_created",
      new_status: "pix_data_added",
      metadata: { channel: data.channel, pixAmount: data.pixAmount },
    });

    return NextResponse.json({ applicationId: app.id, status: app.status }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/aplicacao]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * GET /api/aplicacao?id=xxx
 * Returns application data for the authenticated user (RLS enforced).
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Operação não encontrada" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[GET /api/aplicacao]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
