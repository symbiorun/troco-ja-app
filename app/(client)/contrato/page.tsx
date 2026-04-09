"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import Header from "@/components/layout/Header";
import ProgressBar from "@/components/ui/ProgressBar";
import BottomCTA from "@/components/ui/BottomCTA";
import { formatBRL, formatPct } from "@/lib/utils";

interface SimulationData {
  pixAmount: number;
  cardTotal: number;
  feePct: number;
  profitMarginPct: number;
  installments: number;
  channel: string;
}

interface ContractData {
  id: string;
  version: string;
  content_html: string;
}

export default function ContratoPage() {
  const router = useRouter();
  const supabase = createClient();
  const contractRef = useRef<HTMLDivElement>(null);

  const [simulation, setSimulation] = useState<SimulationData | null>(null);
  const [contract, setContract] = useState<ContractData | null>(null);
  const [hasScrolled, setHasScrolled] = useState(false);

  const [checks, setChecks] = useState({
    read: false,
    irrevocable: false,
    lgpd: false,
    antifraud: false,
    signature: false,
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const allChecked = Object.values(checks).every(Boolean);
  const canAccept = allChecked && hasScrolled;

  useEffect(() => {
    const sim = sessionStorage.getItem("simulation");
    if (sim) setSimulation(JSON.parse(sim));
  }, []);

  useEffect(() => {
    async function fetchContract() {
      const { data } = await supabase
        .from("contracts")
        .select("id, version, content_html")
        .eq("is_active", true)
        .single();
      setContract(data);
      setLoading(false);
    }
    fetchContract();
  }, [supabase]);

  function handleScroll() {
    const el = contractRef.current;
    if (!el) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
    if (nearBottom) setHasScrolled(true);
  }

  function toggle(key: keyof typeof checks) {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleAccept() {
    if (!canAccept) return;
    setSubmitting(true);
    setError("");

    try {
      const applicationId = sessionStorage.getItem("applicationId");
      if (!applicationId || !contract) throw new Error("Sessão inválida");

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Record acceptance via API
      const res = await fetch("/api/contrato/aceitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          contractId: contract.id,
          contractVersion: contract.version,
          userId: user.id,
          acceptedAt: new Date().toISOString(),
          ipAddress: null, // collected server-side
          checks,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Erro ao aceitar contrato");
      }

      router.push("/pagamento");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
      setSubmitting(false);
    }
  }

  const installmentValue = simulation
    ? simulation.cardTotal / simulation.installments
    : 0;

  return (
    <div className="min-h-dvh bg-surface flex flex-col">
      <Header showBack backHref="/documentos" />

      <main className="flex-1 pt-20 pb-36 px-5 max-w-lg mx-auto w-full">
        <ProgressBar currentStep={6} totalSteps={8} className="mb-8" />

        <h1 className="text-headline-sm font-headline font-extrabold text-on-surface mb-1">
          Resumo do Contrato
        </h1>
        <p className="text-body-sm text-on-surface-variant mb-6">
          Leia com atenção antes de assinar digitalmente.
        </p>

        {/* Transaction Summary Bento */}
        {simulation && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="card p-4">
              <p className="text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">
                Você recebe via PIX
              </p>
              <p className="text-title-lg font-headline font-extrabold text-on-surface">
                {formatBRL(simulation.pixAmount)}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">
                {simulation.installments > 1
                  ? `${simulation.installments}x no cartão`
                  : "Cartão à vista"}
              </p>
              <p className="text-title-lg font-headline font-extrabold text-on-surface">
                {simulation.installments > 1
                  ? formatBRL(installmentValue)
                  : formatBRL(simulation.cardTotal)}
              </p>
            </div>
            <div className="col-span-2 bg-surface-container-low p-4 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-xl">percent</span>
                <div>
                  <p className="text-[11px] font-bold text-on-surface-variant">Taxa da operação</p>
                  <p className="text-body-sm font-bold text-on-surface">
                    {formatPct(simulation.feePct + simulation.profitMarginPct)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold text-on-surface-variant">Total cartão</p>
                <p className="text-body-sm font-bold text-primary">
                  {formatBRL(simulation.cardTotal)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Contract text */}
        <div className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-card mb-6">
          <div className="bg-surface-container-high px-5 py-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-on-surface-variant text-lg">gavel</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Instrumento Particular de Crédito
            </span>
          </div>

          {loading ? (
            <div className="h-56 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div
              ref={contractRef}
              onScroll={handleScroll}
              className="h-56 overflow-y-auto px-5 py-5 text-body-sm text-on-surface-variant leading-relaxed space-y-4"
              style={{ scrollbarWidth: "thin", scrollbarColor: "#bdcabf #f2f4f7" }}
            >
              {contract?.content_html ? (
                <div dangerouslySetInnerHTML={{ __html: contract.content_html }} />
              ) : (
                <DefaultContractText />
              )}
            </div>
          )}

          {!hasScrolled && (
            <div className="px-5 pb-3 flex items-center gap-2 text-[11px] text-outline">
              <span className="material-symbols-outlined text-sm">expand_more</span>
              Role até o final para continuar
            </div>
          )}
        </div>

        {/* Checkboxes */}
        <div className="space-y-3 mb-6">
          <CheckItem
            checked={checks.read}
            onChange={() => toggle("read")}
            label="Li e concordo com todos os termos do contrato acima"
          />
          <CheckItem
            checked={checks.irrevocable}
            onChange={() => toggle("irrevocable")}
            label="Estou ciente de que o serviço é de execução imediata e irreversível após o envio do PIX, e que o direito de arrependimento do Art. 49 do CDC não se aplica a esta operação"
          />
          <CheckItem
            checked={checks.lgpd}
            onChange={() => toggle("lgpd")}
            label="Autorizo o tratamento dos meus dados conforme a LGPD e a Política de Privacidade da TrocoJá"
          />
          <CheckItem
            checked={checks.antifraud}
            onChange={() => toggle("antifraud")}
            label="Declaro que sou o titular do cartão utilizado, que esta operação é legítima e que não realizarei contestação indevida junto à operadora do cartão após o recebimento do PIX"
          />
          <CheckItem
            checked={checks.signature}
            onChange={() => toggle("signature")}
            label="Assino digitalmente este contrato, ciente de que esta assinatura possui validade jurídica vinculada ao meu CPF, dispositivo e endereço IP"
          />
        </div>

        {/* Mascote peek */}
        <div className="flex justify-center mt-6 opacity-50">
          <div className="w-20 h-20 rounded-2xl overflow-hidden" style={{ background: "#191c1e" }}>
            <Image
              src="/assets/mascote.png"
              alt="Mascote TrocoJá"
              width={80}
              height={80}
              className="object-contain w-full h-full"
            />
          </div>
        </div>

        {/* Legal note */}
        <div className="mt-4 flex items-start gap-3 p-4 bg-secondary-fixed/20 rounded-2xl">
          <span className="material-symbols-outlined text-secondary text-lg flex-shrink-0 mt-0.5">info</span>
          <p className="text-[11px] leading-relaxed text-on-surface-variant">
            Este documento possui validade jurídica e utiliza assinatura digital
            vinculada ao seu dispositivo e CPF.
          </p>
        </div>

        {error && <p className="mt-4 text-body-sm text-error px-1">{error}</p>}
      </main>

      <BottomCTA
        label={submitting ? "Assinando..." : "Aceitar contrato"}
        onClick={handleAccept}
        disabled={!canAccept || submitting}
        variant="action"
        icon="draw"
      />
    </div>
  );
}

/* ── Default contract text (fallback if DB empty) ── */
function DefaultContractText() {
  return (
    <>
      <p className="font-bold text-on-surface">1. OBJETO DO CONTRATO</p>
      <p>
        O presente instrumento tem por objeto a concessão de crédito operacional ao
        consumidor, doravante denominado "CREDITADO", pela plataforma TrocoJá, nos
        termos e condições aqui pactuados.
      </p>
      <p className="font-bold text-on-surface">2. LIBERAÇÃO DE RECURSOS</p>
      <p>
        O valor líquido discriminado no resumo acima será creditado via PIX na conta
        bancária de titularidade do CREDITADO, após a confirmação do pagamento no
        cartão informado e validação final de segurança.
      </p>
      <p className="font-bold text-on-surface">3. TAXAS E ENCARGOS</p>
      <p>
        As taxas aplicadas correspondem ao spread entre a taxa da maquininha/processadora
        e a margem do operador, conforme demonstrado na simulação realizada. Não há
        IOF, pois trata-se de operação de adiantamento de saldo.
      </p>
      <p className="font-bold text-on-surface">4. PROTEÇÃO DE DADOS</p>
      <p>
        Os dados pessoais coletados são tratados exclusivamente para fins de validação
        da identidade e prevenção a fraudes, em conformidade com a LGPD (Lei
        13.709/2018).
      </p>
      <p className="font-bold text-on-surface">5. IRREVOGABILIDADE E DIREITO DE ARREPENDIMENTO</p>
      <p>
        O serviço prestado é de <strong>execução imediata e irreversível</strong>: assim que
        o PIX é enviado, a operação está concluída e não pode ser desfeita. Por determinação
        técnica do Banco Central, transferências PIX liquidadas são definitivas.
      </p>
      <p>
        O direito de arrependimento previsto no Art. 49 do CDC <strong>não se aplica</strong> a
        esta operação, pois o serviço digital é integralmente consumido no momento de sua
        execução, conforme entendimento consolidado do STJ para serviços digitais de execução
        imediata. Ao aceitar este contrato, o CONTRATANTE reconhece expressamente esta
        condição.
      </p>
      <p>
        A contestação indevida do pagamento no cartão após o recebimento do PIX configura
        enriquecimento ilícito (Art. 884 do Código Civil) e poderá ser tipificada como
        estelionato (Art. 171 do Código Penal).
      </p>
      <p className="font-bold text-on-surface">6. DISPOSIÇÕES GERAIS</p>
      <p>
        A TrocoJá não é instituição financeira. As operações são intermediadas por
        parceiros financeiros devidamente autorizados pelo Banco Central do Brasil.
        Ao aceitar, você declara ter lido e concordado com todos os termos expostos.
      </p>
      <div className="p-4 bg-surface-container-low rounded-xl flex items-start gap-3 mt-4">
        <span className="material-symbols-outlined text-secondary text-lg">info</span>
        <p className="text-[11px]">
          Este documento possui validade jurídica conforme MP 2.200-2/2001 e
          utiliza assinatura digital vinculada ao seu dispositivo e CPF.
        </p>
      </div>
    </>
  );
}

/* ── Checkbox Item ── */
function CheckItem({
  checked, onChange, label,
}: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      onClick={onChange}
      className="w-full flex items-start gap-3 p-4 bg-surface-container-lowest rounded-2xl
                 hover:bg-surface-container-low transition-colors text-left"
    >
      <div className={`w-5 h-5 rounded flex-shrink-0 mt-0.5 flex items-center justify-center border-2 transition-colors ${
        checked
          ? "bg-primary border-primary"
          : "border-outline-variant bg-transparent"
      }`}>
        {checked && (
          <span className="material-symbols-outlined text-white text-sm"
                style={{ fontVariationSettings: "'FILL' 1", fontSize: "14px" }}>check</span>
        )}
      </div>
      <span className="text-body-sm text-on-surface leading-snug">{label}</span>
    </button>
  );
}
