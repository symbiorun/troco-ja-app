import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const SimulateSchema = z.object({
  pixAmount: z.number().positive("Valor PIX deve ser positivo"),
  installments: z.number().int().min(1).max(12),
  channel: z.enum(["online_link", "machine_delivery"]),
});

/**
 * POST /api/simular
 * Runs the financial simulation using live fee configs from admin_configs table.
 * Formula: cardTotal = (pixAmount × (1 + marginPct/100)) / (1 - feePct/100)
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(getClientIp(req), 'simular', 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  try {
    const body = await req.json();
    const parsed = SimulateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { pixAmount, installments, channel } = parsed.data;

    // Load live configs from Supabase
    const supabase = createAdminClient();
    const { data: configs } = await supabase
      .from("admin_configs")
      .select("key, value");

    const cfg = Object.fromEntries(
      (configs ?? []).map((c: { key: string; value: string }) => [c.key, parseFloat(c.value)])
    );

    // Determine fee based on channel and installments
    let feePct: number;
    if (channel === "machine_delivery") {
      if (installments === 1) {
        feePct = cfg["mp_credit_fee_pct"] ?? 4.98;
      } else {
        feePct = cfg["mp_credit_12x_fee_pct"] ?? 22.59;
      }
    } else {
      // online_link — Asaas credit
      feePct = (cfg["asaas_fee_pct"] ?? 2.89) + (installments > 1 ? 1.99 * (installments - 1) / installments : 0);
    }

    const profitMarginPct = cfg["operator_margin_pct"] ?? 2.5;
    const minPix = cfg["min_pix_amount"] ?? 50;
    const maxPix = cfg["max_pix_amount"] ?? 5000;

    // Validate limits
    if (pixAmount < minPix || pixAmount > maxPix) {
      return NextResponse.json(
        { error: `Valor PIX deve estar entre R$ ${minPix} e R$ ${maxPix}` },
        { status: 422 }
      );
    }

    // Core financial formula (matches simulation.service.js in backend)
    const cardTotal = (pixAmount * (1 + profitMarginPct / 100)) / (1 - feePct / 100);
    const installmentValue = cardTotal / installments;
    const totalFeeAmount = cardTotal - pixAmount;
    const effectivePct = ((cardTotal - pixAmount) / pixAmount) * 100;

    return NextResponse.json({
      pixAmount,
      cardTotal: Math.round(cardTotal * 100) / 100,
      installments,
      installmentValue: Math.round(installmentValue * 100) / 100,
      feePct,
      profitMarginPct,
      totalFeeAmount: Math.round(totalFeeAmount * 100) / 100,
      effectivePct: Math.round(effectivePct * 100) / 100,
      channel,
    });
  } catch (err) {
    console.error("[POST /api/simular]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
