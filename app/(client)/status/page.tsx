"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Header } from "@/components/layout/Header";
import { createClient } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { ApplicationStatus } from "@/types";
import { STATUS_LABELS } from "@/types";

interface TimelineStep {
  status: ApplicationStatus;
  label: string;
  sublabel: string;
  icon: string;
}

const TIMELINE_STEPS: TimelineStep[] = [
  { status: "payment_pending",   label: "Aguardando pagamento",    sublabel: "Início do processo",       icon: "schedule" },
  { status: "payment_confirmed", label: "Pagamento confirmado",     sublabel: "Processando transferência", icon: "payments" },
  { status: "pix_ready_to_send", label: "PIX em envio",            sublabel: "Transferência instantânea", icon: "account_balance_wallet" },
  { status: "pix_sent",          label: "PIX enviado",             sublabel: "Transferência realizada",   icon: "send" },
  { status: "completed",         label: "Concluído!",              sublabel: "Dinheiro na conta",         icon: "task_alt" },
];

const STATUS_ORDER: ApplicationStatus[] = [
  "payment_pending", "payment_confirmed", "pix_ready_to_send", "pix_sent", "completed"
];

export default function StatusPage() {
  const router = useRouter();
  const supabase = createClient();

  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [status, setStatus] = useState<ApplicationStatus>("payment_pending");
  const [pixAmount, setPixAmount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const appId = sessionStorage.getItem("applicationId");
    const sim   = sessionStorage.getItem("simulation");
    if (!appId) { router.replace("/simulacao"); return; }

    setApplicationId(appId);
    if (sim) {
      const parsed = JSON.parse(sim);
      setPixAmount(parsed.pixAmount ?? 0);
    }

    // Busca status inicial
    async function fetchStatus() {
      const { data } = await supabase
        .from("applications")
        .select("status")
        .eq("id", appId)
        .single();

      if (data?.status) setStatus(data.status as ApplicationStatus);
      setLoading(false);
    }

    fetchStatus();

    // Supabase Realtime — atualiza status em tempo real
    const channel = supabase
      .channel(`application:${appId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "applications",
          filter: `id=eq.${appId}`,
        },
        (payload) => {
          const newStatus = payload.new?.status as ApplicationStatus;
          if (newStatus) setStatus(newStatus);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [router, supabase]);

  const isCompleted  = status === "completed";
  const isRejected   = status === "rejected";
  const currentIndex = STATUS_ORDER.indexOf(status);

  function getStepState(step: TimelineStep): "done" | "current" | "pending" {
    const stepIndex = STATUS_ORDER.indexOf(step.status);
    if (stepIndex < currentIndex || isCompleted) return "done";
    if (stepIndex === currentIndex) return "current";
    return "pending";
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-pulse-slow rounded-3xl overflow-hidden w-24 h-24"
               style={{ background: "#191c1e" }}>
            <Image src="/assets/mascote.png" alt="" width={96} height={96}
                   className="object-contain w-full h-full" />
          </div>
          <p className="text-on-surface-variant text-sm font-body">Carregando status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-container-low min-h-dvh flex flex-col">
      <Header showLogo={false} title="Status da Operação" />

      <main className="flex-1 mt-16 pb-40 px-5 pt-8">
        <div className="max-w-md mx-auto flex flex-col gap-6">

          {/* Progress bar completo */}
          <div>
            <div className="flex justify-between items-end mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-primary font-label">
                {isCompleted ? "Concluído!" : STATUS_LABELS[status] ?? "Processando..."}
              </span>
              <span className="text-xs font-bold text-on-surface-variant">8/8</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill transition-all duration-1000"
                style={{ width: isCompleted ? "100%" : `${((currentIndex + 1) / STATUS_ORDER.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Hero card */}
          <div className="relative bg-white rounded-3xl p-8 shadow-card overflow-hidden">
            {/* Mascote watermark */}
            <div className="absolute -right-4 -top-4 w-32 h-32 opacity-8 pointer-events-none">
              <div className="rounded-2xl overflow-hidden w-full h-full" style={{ background: "#191c1e" }}>
                <Image src="/assets/mascote.png" alt="" width={128} height={128}
                       className="object-contain w-full h-full" />
              </div>
            </div>

            <div className="relative z-10 flex flex-col items-center text-center">
              {isCompleted ? (
                <>
                  <div className="w-24 h-24 mb-5 rounded-full flex items-center justify-center shadow-lift"
                       style={{ background: "linear-gradient(135deg, #006b41, #0a8754)" }}>
                    <span className="material-symbols-outlined text-white text-5xl icon-filled">
                      check_circle
                    </span>
                  </div>
                  <h1 className="text-headline-sm font-headline font-extrabold text-on-surface mb-2">
                    Troco Realizado! 🎉
                  </h1>
                  <p className="text-body-md text-on-surface-variant leading-relaxed">
                    Sua transação foi processada com sucesso.
                    {pixAmount > 0 && (
                      <> O valor de <strong className="text-primary">{formatBRL(pixAmount)}</strong> já está disponível na sua conta.</>
                    )}
                  </p>
                </>
              ) : isRejected ? (
                <>
                  <div className="w-20 h-20 mb-5 rounded-full bg-error/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-error text-5xl">cancel</span>
                  </div>
                  <h1 className="text-headline-sm font-headline font-extrabold text-on-surface mb-2">
                    Operação Recusada
                  </h1>
                  <p className="text-body-md text-on-surface-variant leading-relaxed">
                    Infelizmente não foi possível processar sua operação. Entre em contato com o suporte.
                  </p>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 mb-5 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary text-5xl animate-pulse-slow">
                      hourglass_empty
                    </span>
                  </div>
                  <h1 className="text-headline-sm font-headline font-extrabold text-on-surface mb-2">
                    Processando...
                  </h1>
                  <p className="text-body-md text-on-surface-variant">
                    Aguarde, estamos processando sua operação em tempo real.
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-xs text-primary font-label font-bold">
                    <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                    Atualizando automaticamente
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Timeline de status */}
          <div className="flex flex-col gap-3">
            <h2 className="text-[10px] font-bold text-on-surface-variant px-2 uppercase tracking-widest font-label">
              Detalhes do Status
            </h2>
            {[...TIMELINE_STEPS].reverse().map((step) => {
              const state = getStepState(step);
              return (
                <div
                  key={step.status}
                  className={cn(
                    "bg-white p-4 rounded-2xl flex items-center gap-4 transition-all",
                    state === "current" && "ring-2 ring-primary/20 shadow-card"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                    state === "done"    ? "bg-primary/10"              :
                    state === "current" ? "bg-primary/15 animate-pulse-slow" :
                                         "bg-surface-container"
                  )}>
                    <span className={cn(
                      "material-symbols-outlined text-xl",
                      state === "done" || state === "current" ? "text-primary icon-filled" : "text-outline-variant"
                    )}>
                      {step.icon}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-body-md font-bold",
                      state === "pending" ? "text-on-surface-variant" : "text-on-surface"
                    )}>
                      {step.label}
                    </p>
                    <p className="text-body-sm text-on-surface-variant">{step.sublabel}</p>
                  </div>
                  {state === "done" && (
                    <span className="material-symbols-outlined text-primary text-base icon-filled">check_circle</span>
                  )}
                  {state === "current" && (
                    <span className="text-[10px] font-bold text-primary/60 font-label whitespace-nowrap">AGORA</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Mascote feedback */}
          {isCompleted && (
            <div className="flex flex-col items-center bg-secondary/5 rounded-3xl p-7 text-center animate-fade-in">
              <div className="rounded-2xl overflow-hidden w-20 h-20 mb-4"
                   style={{ background: "#191c1e" }}>
                <Image src="/assets/mascote.png" alt="Mascote" width={80} height={80}
                       className="object-contain w-full h-full" />
              </div>
              <p className="text-secondary font-bold text-body-md font-headline">
                "Tudo certo! Precisando de mais troco, é só chamar."
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Bottom actions */}
      <div className="bottom-cta flex flex-col gap-3">
        <button
          onClick={() => { sessionStorage.clear(); router.push("/simulacao"); }}
          className="btn-primary flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-xl">home</span>
          Voltar ao início
        </button>
        {isCompleted && (
          <button
            onClick={() => alert("Comprovante — funcionalidade em desenvolvimento")}
            className="w-full py-3.5 px-8 rounded-full font-body font-bold text-on-surface
                       bg-surface-container hover:bg-surface-container-high transition-all
                       flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-xl">share</span>
            Compartilhar comprovante
          </button>
        )}
      </div>
    </div>
  );
}
