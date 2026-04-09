"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { MascoteCard } from "@/components/ui/MascoteCard";
import { BottomCTA } from "@/components/ui/BottomCTA";
import { formatBRL, formatPct, simulateOperation } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Channel } from "@/types";

// Taxas padrão Mercado Pago D0 (faixa inicial)
// Esses valores serão dinâmicos via admin_configs em produção
const MP_FEES: Record<number, number> = {
  1: 4.98,  2: 5.50,  3: 6.20,  4: 7.20,
  5: 8.30,  6: 9.50,  7: 11.0,  8: 12.5,
  9: 14.0, 10: 15.5, 11: 18.0, 12: 22.59,
};

const ASAAS_FEES: Record<number, number> = {
  1: 2.99,  2: 3.80,  3: 4.60,  4: 5.50,
  5: 6.40,  6: 7.30,  7: 8.50,  8: 9.80,
  9: 11.2, 10: 12.6, 11: 14.1, 12: 15.8,
};

const DEFAULT_PROFIT = 15; // margem padrão 15%
const MIN_PIX = 200;
const MAX_PIX = 5000;

export default function SimulacaoPage() {
  const router = useRouter();

  const [pixAmount, setPixAmount]         = useState(2500);
  const [installments, setInstallments]   = useState(12);
  const [channel, setChannel]             = useState<Channel>("online_link");
  const [inputValue, setInputValue]       = useState("2.500,00");

  const feePct = channel === "online_link"
    ? ASAAS_FEES[installments]
    : MP_FEES[installments];

  const result = simulateOperation({
    pixAmount,
    installments,
    profitMarginPct: DEFAULT_PROFIT,
    feePct,
  });

  // Formata input como moeda BR
  function handleAmountInput(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) { setInputValue(""); setPixAmount(0); return; }
    const val = parseInt(digits) / 100;
    const clamped = Math.min(Math.max(val, 0), MAX_PIX);
    setPixAmount(clamped);
    setInputValue(
      new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        .format(clamped)
    );
  }

  function handleSimulate() {
    if (pixAmount < MIN_PIX) return;
    // Salva resultado na sessionStorage para a tela de resultado
    sessionStorage.setItem("simulation", JSON.stringify({ ...result, channel }));
    router.push("/resultado");
  }

  return (
    <div className="bg-surface min-h-dvh flex flex-col">
      <Header showLogo />

      {/* Content Canvas */}
      <main className="flex-1 mt-16 pb-40 px-5 pt-8 flex justify-center">
        <div className="w-full max-w-xl flex flex-col gap-7">

          {/* Progress */}
          <ProgressBar currentStep={1} label="Simulação" />

          {/* Header Editorial + Mascote */}
          <div className="relative flex items-start gap-4 pt-2">
            <div className="flex-1">
              <h1 className="text-headline-md font-headline font-extrabold text-on-surface tracking-tight mb-2">
                Simule seu crédito agora
              </h1>
              <p className="text-body-md text-on-surface-variant leading-relaxed max-w-[82%]">
                Escolha o valor que você precisa e em quantas vezes deseja pagar.
              </p>
            </div>
            <MascoteCard message="Oi!" size="md" inline />
          </div>

          {/* Canal */}
          <div className="flex gap-3">
            {[
              { value: "online_link",     label: "Online", icon: "smartphone" },
              { value: "machine_delivery", label: "Maquininha", icon: "point_of_sale" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setChannel(opt.value as Channel)}
                className={cn(
                  "flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-2xl transition-all duration-200 border-2",
                  channel === opt.value
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-surface-container-low border-transparent text-on-surface-variant"
                )}
              >
                <span className={cn(
                  "material-symbols-outlined text-2xl",
                  channel === opt.value && "icon-filled"
                )}>
                  {opt.icon}
                </span>
                <span className="text-xs font-bold font-label">{opt.label}</span>
              </button>
            ))}
          </div>

          {/* Card Simulador */}
          <div className="bg-surface-container-low rounded-3xl p-6 flex flex-col gap-8">

            {/* Input: Valor PIX */}
            <div className="flex flex-col gap-2.5">
              <label className="text-label-md text-on-surface-variant font-label px-1">
                Quanto você quer receber?
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                  <span className="text-primary font-extrabold text-xl font-headline">R$</span>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={inputValue}
                  onChange={(e) => handleAmountInput(e.target.value)}
                  placeholder="0,00"
                  className="input-field pl-14"
                  aria-label="Valor desejado em reais"
                />
                <span className="absolute top-1/2 -right-3 -translate-y-1/2 opacity-10 pointer-events-none
                                  material-symbols-outlined text-4xl">
                  bolt
                </span>
              </div>
              {pixAmount > 0 && pixAmount < MIN_PIX && (
                <p className="text-xs text-error px-1 font-label">
                  Valor mínimo: {formatBRL(MIN_PIX)}
                </p>
              )}
              {pixAmount > MAX_PIX && (
                <p className="text-xs text-error px-1 font-label">
                  Valor máximo: {formatBRL(MAX_PIX)}
                </p>
              )}
            </div>

            {/* Slider: Parcelas */}
            <div className="flex flex-col gap-5">
              <div className="flex justify-between items-center px-1">
                <label className="text-label-md text-on-surface-variant font-label">
                  Parcelas
                </label>
                <span className="bg-primary-container text-white px-4 py-1 rounded-full text-sm font-extrabold font-headline">
                  {installments}x
                </span>
              </div>
              <div className="relative px-1">
                <input
                  type="range"
                  min={1}
                  max={12}
                  step={1}
                  value={installments}
                  onChange={(e) => setInstallments(Number(e.target.value))}
                  aria-label="Número de parcelas"
                />
                <div className="flex justify-between mt-3.5 px-1">
                  {[1, 3, 6, 9, 12].map((n) => (
                    <span key={n} className={cn(
                      "text-xs font-bold font-label",
                      installments === n ? "text-primary" : "text-outline"
                    )}>
                      {n}x
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Resumo tonal */}
            {pixAmount >= MIN_PIX && (
              <div className="bg-surface-container-highest/50 rounded-2xl p-4 flex items-center justify-between
                              animate-fade-in">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary">
                    <span className="material-symbols-outlined text-xl">payments</span>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-outline-variant tracking-wider font-label">
                      Estimativa da parcela
                    </p>
                    <p className="text-lg font-extrabold text-on-surface font-headline">
                      {formatBRL(result.installmentValue)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase font-bold text-outline-variant tracking-wider font-label">
                    Taxa total
                  </p>
                  <p className="text-sm font-bold text-primary font-label">
                    {formatPct(feePct)}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Info card */}
          <div className="flex items-start gap-3 bg-secondary/5 rounded-2xl p-4">
            <span className="material-symbols-outlined text-secondary text-xl mt-0.5">info</span>
            <p className="text-body-sm text-secondary/90 leading-relaxed">
              Você passa{" "}
              <strong>{pixAmount >= MIN_PIX ? formatBRL(result.cardTotal) : "o valor"}</strong>{" "}
              no cartão em {installments}x e recebe{" "}
              <strong>{pixAmount >= MIN_PIX ? formatBRL(pixAmount) : "o valor"}</strong>{" "}
              em PIX na hora.
            </p>
          </div>
        </div>
      </main>

      <BottomCTA
        label="👉 Ver simulação completa"
        onClick={handleSimulate}
        disabled={pixAmount < MIN_PIX || pixAmount > MAX_PIX}
        hint={pixAmount < MIN_PIX ? `Mínimo ${formatBRL(MIN_PIX)}` : undefined}
      />
    </div>
  );
}
