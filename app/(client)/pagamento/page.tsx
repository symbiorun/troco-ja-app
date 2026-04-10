"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Header from "@/components/layout/Header";
import ProgressBar from "@/components/ui/ProgressBar";
import BottomCTA from "@/components/ui/BottomCTA";
import { formatBRL } from "@/lib/utils";

interface SimulationData {
  pixAmount: number;
  cardTotal: number;
  feePct: number;
  profitMarginPct: number;
  installments: number;
  channel: string;
}

type PaymentStatus = "idle" | "generating" | "ready" | "polling" | "confirmed" | "error";

export default function PagamentoPage() {
  const router = useRouter();

  const [simulation, setSimulation] = useState<SimulationData | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("idle");
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const sim = sessionStorage.getItem("simulation");
    if (sim) setSimulation(JSON.parse(sim));
  }, []);

  async function handleGeneratePayment() {
    setPaymentStatus("generating");
    setError("");

    try {
      const applicationId = sessionStorage.getItem("applicationId");
      const customer = JSON.parse(sessionStorage.getItem("customer") ?? "{}");
      if (!applicationId) throw new Error("Sessão inválida");

      const res = await fetch("/api/pagamento/criar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          customerName: customer.name,
          customerEmail: customer.email,
          customerCpf: customer.cpf,
          amount: simulation?.cardTotal,
          installments: simulation?.installments,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Erro ao gerar cobrança");
      }

      const data = await res.json();
      setCheckoutUrl(data.checkoutUrl);
      setPaymentId(data.paymentId);
      setPaymentStatus("ready");

      // Auto-open checkout
      window.open(data.checkoutUrl, "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
      setPaymentStatus("error");
    }
  }

  async function checkPaymentStatus() {
    if (!paymentId) return;
    setPaymentStatus("polling");

    try {
      const res = await fetch(`/api/pagamento/status/${paymentId}`);
      const data = await res.json();

      if (data.status === "CONFIRMED" || data.status === "RECEIVED") {
        setPaymentStatus("confirmed");
        sessionStorage.setItem("paymentConfirmed", "true");

        setTimeout(() => {
          router.push("/status");
        }, 2000);
      } else {
        setPaymentStatus("ready");
        setError("Pagamento ainda não confirmado. Verifique e tente novamente.");
      }
    } catch {
      setPaymentStatus("ready");
      setError("Erro ao verificar pagamento");
    }
  }

  const isOnline = simulation?.channel === "online_link";
  const convenienceFee = simulation
    ? simulation.cardTotal - simulation.pixAmount
    : 0;

  return (
    <div className="min-h-dvh bg-surface flex flex-col">
      <Header showBack backHref="/contrato" />

      <main className="flex-1 pt-20 pb-36 px-5 max-w-lg mx-auto w-full">
        <ProgressBar currentStep={7} totalSteps={8} className="mb-8" />

        <h1 className="text-headline-sm font-headline font-extrabold text-on-surface mb-2">
          Realizar Pagamento
        </h1>
        <p className="text-body-sm text-on-surface-variant mb-6">
          {isOnline
            ? "Finalize o pagamento no cartão para liberar seu PIX."
            : "Nosso parceiro já está a caminho com a maquininha."}
        </p>

        {/* Channel-specific card */}
        {isOnline ? (
          <OnlinePaymentCard
            checkoutUrl={checkoutUrl}
            paymentStatus={paymentStatus}
            onGenerate={handleGeneratePayment}
            onOpenCheckout={() => window.open(checkoutUrl, "_blank", "noopener,noreferrer")}
          />
        ) : (
          <MachineDeliveryCard />
        )}

        {/* Summary */}
        {simulation && (
          <div className="mt-6 p-5 bg-surface-container-lowest rounded-3xl shadow-card">
            <h3 className="text-label-lg font-bold text-on-surface-variant uppercase tracking-wider mb-4">
              Resumo da operação
            </h3>
            <div className="space-y-3">
              <SummaryRow label="Valor que você recebe (PIX)" value={formatBRL(simulation.pixAmount)} />
              <SummaryRow label="Taxa da operação" value={formatBRL(convenienceFee)} />
              <div className="h-px bg-outline-variant/20" />
              <div className="flex justify-between items-center">
                <span className="text-body-md font-extrabold font-headline text-on-surface">
                  {simulation.installments > 1
                    ? `Total cartão (${simulation.installments}x)`
                    : "Total no cartão"}
                </span>
                <span className="text-title-lg font-extrabold font-headline text-primary">
                  {formatBRL(simulation.cardTotal)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Trust badges */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            { icon: "lock", label: "Pagamento\nseguro" },
            { icon: "verified_user", label: "Dados\nprotegidos" },
            { icon: "speed", label: "PIX em\nminutos" },
          ].map(({ icon, label }) => (
            <div key={icon} className="flex flex-col items-center gap-1.5 p-3
                                       bg-surface-container-low rounded-2xl text-center">
              <span className="material-symbols-outlined text-primary text-2xl">{icon}</span>
              <span className="text-[10px] font-bold text-on-surface-variant whitespace-pre-line">
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Confirmed state */}
        {paymentStatus === "confirmed" && (
          <div className="mt-6 p-5 bg-primary/10 rounded-3xl flex items-center gap-4 animate-fade-in">
            <span className="material-symbols-outlined text-primary text-4xl"
                  style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            <div>
              <p className="font-bold text-on-surface">Pagamento confirmado!</p>
              <p className="text-body-sm text-on-surface-variant">Redirecionando para acompanhar seu PIX...</p>
            </div>
          </div>
        )}

        {error && <p className="mt-4 text-body-sm text-error px-1">{error}</p>}
      </main>

      {/* CTA bottom — only for online with confirmed */}
      {paymentStatus === "ready" && (
        <BottomCTA
          label="Já paguei — confirmar"
          onClick={checkPaymentStatus}
          disabled={false}
          variant="action"
          icon="check_circle"
        />
      )}

      {paymentStatus === "idle" && isOnline && (
        <BottomCTA
          label="Gerar link de pagamento"
          onClick={handleGeneratePayment}
          disabled={false}
          icon="open_in_new"
        />
      )}

      {!isOnline && (
        <BottomCTA
          label="Acompanhar meu PIX"
          onClick={() => router.push("/status")}
          disabled={false}
          variant="action"
          icon="arrow_forward"
        />
      )}
    </div>
  );
}

/* ── Online Payment Card ── */
function OnlinePaymentCard({
  checkoutUrl, paymentStatus, onGenerate, onOpenCheckout,
}: {
  checkoutUrl: string;
  paymentStatus: PaymentStatus;
  onGenerate: () => void;
  onOpenCheckout: () => void;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-3xl p-6 shadow-card">
      <div className="flex items-center gap-4 mb-5">
        <div className="w-12 h-12 rounded-2xl bg-secondary-fixed/30 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-secondary text-2xl">credit_card</span>
        </div>
        <div>
          <h3 className="font-bold text-on-surface">Link de Pagamento Asaas</h3>
          <p className="text-body-sm text-on-surface-variant">
            Pague com cartão de crédito de forma segura
          </p>
        </div>
      </div>

      {paymentStatus === "idle" && (
        <div className="p-4 bg-surface-container-low rounded-2xl text-center">
          <span className="material-symbols-outlined text-outline text-4xl block mb-2">
            receipt_long
          </span>
          <p className="text-body-sm text-on-surface-variant">
            Clique abaixo para gerar seu link de pagamento personalizado.
          </p>
        </div>
      )}

      {paymentStatus === "generating" && (
        <div className="p-6 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-body-sm text-on-surface-variant">Gerando link seguro...</p>
        </div>
      )}

      {(paymentStatus === "ready" || paymentStatus === "polling") && checkoutUrl && (
        <div className="space-y-4">
          <div className="p-4 bg-primary/5 rounded-2xl flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-xl"
                  style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            <p className="text-body-sm font-bold text-on-surface">Link gerado com sucesso!</p>
          </div>

          <button
            onClick={onOpenCheckout}
            className="w-full flex items-center justify-center gap-2 py-3 px-5
                       bg-secondary-fixed/30 rounded-2xl font-bold text-secondary
                       hover:bg-secondary-fixed/50 transition-colors"
          >
            <span className="material-symbols-outlined text-lg">open_in_new</span>
            Abrir checkout novamente
          </button>
        </div>
      )}

      {paymentStatus === "error" && (
        <div className="p-4 bg-error/10 rounded-2xl flex items-center gap-3">
          <span className="material-symbols-outlined text-error text-xl">error</span>
          <p className="text-body-sm text-on-surface-variant">Falha ao gerar o link.</p>
          <button onClick={onGenerate} className="ml-auto text-body-sm font-bold text-primary">
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Machine Delivery Card ── */
function MachineDeliveryCard() {
  return (
    <div className="bg-surface-container-lowest rounded-3xl p-6 shadow-card relative overflow-hidden">
      <div className="absolute -right-4 -top-4 opacity-5 pointer-events-none">
        <span className="material-symbols-outlined text-9xl">bolt</span>
      </div>

      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-secondary-fixed/30 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-secondary text-2xl">moped</span>
        </div>
        <div>
          <h3 className="font-bold text-on-surface text-lg">
            Estamos enviando a maquininha
          </h3>
          <p className="text-body-sm text-on-surface-variant mt-1">
            Nosso parceiro já está a caminho do seu endereço com total segurança.
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between p-3 bg-surface-container-low rounded-xl">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
          <span className="text-[11px] font-bold text-primary uppercase tracking-wider">EM ROTA</span>
        </div>
        <span className="text-body-sm text-on-surface-variant">Previsão: 15–20 min</span>
      </div>

      {/* Mascote */}
      <div className="mt-5 flex items-center gap-3 p-4 bg-primary/5 rounded-2xl">
        <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0" style={{ background: "#191c1e" }}>
          <Image
            src="/assets/mascote.png"
            alt="Mascote"
            width={48}
            height={48}
            className="object-contain w-full h-full"
          />
        </div>
        <p className="text-body-sm text-on-surface-variant leading-snug">
          Aguarde a chegada e passe seu cartão na maquininha para liberar o PIX!
        </p>
      </div>
    </div>
  );
}

/* ── Summary Row ── */
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-body-sm text-on-surface-variant">{label}</span>
      <span className="text-body-sm font-bold text-on-surface">{value}</span>
    </div>
  );
}
