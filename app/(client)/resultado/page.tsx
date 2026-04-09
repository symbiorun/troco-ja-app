"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { MascoteCard } from "@/components/ui/MascoteCard";
import { BottomCTA } from "@/components/ui/BottomCTA";
import { formatBRL, formatPct, simulateOperation } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Channel, SimulationResult } from "@/types";

const ASAAS_FEES: Record<number, number> = {
  1: 2.99,  2: 3.80,  3: 4.60,  4: 5.50,
  5: 6.40,  6: 7.30,  7: 8.50,  8: 9.80,
  9: 11.2, 10: 12.6, 11: 14.1, 12: 15.8,
};

const MP_FEES: Record<number, number> = {
  1: 4.98,  2: 5.50,  3: 6.20,  4: 7.20,
  5: 8.30,  6: 9.50,  7: 11.0,  8: 12.5,
  9: 14.0, 10: 15.5, 11: 18.0, 12: 22.59,
};

const DEFAULT_PROFIT = 15;

export default function ResultadoPage() {
  const router = useRouter();
  const [simulation, setSimulation] = useState<(SimulationResult & { channel: Channel }) | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel>("online_link");

  useEffect(() => {
    const raw = sessionStorage.getItem("simulation");
    if (!raw) { router.replace("/simulacao"); return; }
    const sim = JSON.parse(raw);
    setSimulation(sim);
    setSelectedChannel(sim.channel ?? "online_link");
  }, [router]);

  if (!simulation) return null;

  const { pixAmount, installments } = simulation;

  const onlineResult = simulateOperation({
    pixAmount, installments,
    profitMarginPct: DEFAULT_PROFIT,
    feePct: ASAAS_FEES[installments] ?? 4.98,
  });

  const machineResult = simulateOperation({
    pixAmount, installments,
    profitMarginPct: DEFAULT_PROFIT,
    feePct: MP_FEES[installments] ?? 4.98,
  });

  const currentResult = selectedChannel === "online_link" ? onlineResult : machineResult;

  function handleContinue() {
    sessionStorage.setItem("simulation", JSON.stringify({
      ...currentResult,
      channel: selectedChannel,
    }));
    router.push("/cadastro");
  }

  const options = [
    {
      id: "online_link" as Channel,
      title: "Operação Online",
      subtitle: "Via link de pagamento",
      result: onlineResult,
      badge: "Recomendado",
      icon: "smartphone",
    },
    {
      id: "machine_delivery" as Channel,
      title: "Receber Maquininha",
      subtitle: "Operação presencial",
      result: machineResult,
      badge: null,
      icon: "point_of_sale",
    },
  ];

  return (
    <div className="bg-surface min-h-dvh flex flex-col">
      <Header showBack showLogo={false} title="Resultado da simulação" />

      <main className="flex-1 mt-16 pb-40 px-5 pt-8">
        <div className="max-w-2xl mx-auto flex flex-col gap-7">

          <ProgressBar currentStep={2} label="Resultado" />

          <div>
            <h2 className="text-headline-sm font-headline font-extrabold text-on-surface tracking-tight">
              Resultado da simulação
            </h2>
            <p className="text-body-md text-on-surface-variant mt-1.5">
              Compare as opções e escolha a melhor para você.
            </p>
          </div>

          {/* Cards de canal */}
          <div className="flex flex-col gap-4">
            {options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSelectedChannel(opt.id)}
                className={cn(
                  "w-full text-left bg-white rounded-3xl p-5 border-2 transition-all duration-200 shadow-card",
                  selectedChannel === opt.id
                    ? "border-primary bg-green-50/40"
                    : "border-outline-variant/20 hover:border-outline-variant/50"
                )}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    {opt.badge && (
                      <span className="inline-block px-2 py-0.5 rounded bg-primary/10 text-primary
                                        text-[10px] font-bold uppercase tracking-wider mb-2 font-label">
                        {opt.badge}
                      </span>
                    )}
                    <h3 className="text-title-lg font-headline text-on-surface">{opt.title}</h3>
                    <p className="text-body-sm text-on-surface-variant">{opt.subtitle}</p>
                  </div>
                  <span className={cn(
                    "material-symbols-outlined text-2xl",
                    selectedChannel === opt.id ? "text-primary icon-filled" : "text-outline-variant"
                  )}>
                    {selectedChannel === opt.id ? "check_circle" : "radio_button_unchecked"}
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider font-label">
                      Você recebe
                    </span>
                    <span className={cn(
                      "text-2xl font-extrabold font-headline",
                      selectedChannel === opt.id ? "text-primary" : "text-on-surface"
                    )}>
                      {formatBRL(pixAmount)}
                    </span>
                  </div>

                  <div className="h-px w-full bg-surface-container" />

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[10px] text-on-surface-variant font-label">Passa no cartão</p>
                      <p className="text-sm font-bold text-on-surface font-headline">
                        {formatBRL(opt.result.cardTotal)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-on-surface-variant font-label">Parcela ({installments}x)</p>
                      <p className="text-sm font-bold text-on-surface font-headline">
                        {formatBRL(opt.result.installmentValue)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-on-surface-variant font-label">Taxa total</p>
                      <p className="text-sm font-bold text-primary font-label">
                        {formatPct(opt.result.feePct)}
                      </p>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Info boxes */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: "account_balance", label: "Taxa de serviço", value: formatBRL(currentResult.feeAmount), color: "primary" },
              { icon: "speed",           label: "Liberação do PIX", value: "Instantânea",                      color: "secondary" },
            ].map((item) => (
              <div key={item.label} className="p-4 rounded-2xl bg-surface-container-low flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full bg-${item.color}/10 flex items-center justify-center flex-shrink-0`}>
                  <span className={`material-symbols-outlined text-${item.color} text-xl`}>{item.icon}</span>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-on-surface-variant font-label leading-tight">{item.label}</p>
                  <p className="text-sm font-bold text-on-surface font-headline">{item.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Dica do mascote */}
          <div className="flex items-start gap-4 p-4 bg-secondary/5 rounded-3xl border border-secondary/10">
            <MascoteCard size="sm" inline message="💡" />
            <div className="flex-1">
              <p className="text-body-sm text-secondary/90 leading-relaxed">
                <strong>Dica:</strong> A operação online é processada automaticamente. A maquininha requer
                atendimento presencial mas pode ter taxas melhores em volumes maiores.
              </p>
            </div>
          </div>
        </div>
      </main>

      <BottomCTA
        label="Continuar com esta opção →"
        onClick={handleContinue}
        hint={`${selectedChannel === "online_link" ? "Operação Online" : "Maquininha"} • ${installments}x de ${formatBRL(currentResult.installmentValue)}`}
      />
    </div>
  );
}
