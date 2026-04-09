"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { BottomCTA } from "@/components/ui/BottomCTA";
import { maskCPF, maskPhone, onlyDigits } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { PixKeyType } from "@/types";

const BANKS = [
  "Nubank", "Itaú Unibanco", "Banco do Brasil", "Bradesco",
  "Santander", "Caixa Econômica Federal", "Inter", "C6 Bank",
  "Next", "Neon", "PagBank", "Mercado Pago", "Outro",
];

const PIX_KEY_TYPES: { value: PixKeyType; label: string; placeholder: string }[] = [
  { value: "cpf",    label: "CPF",             placeholder: "000.000.000-00" },
  { value: "phone",  label: "Celular",          placeholder: "(00) 00000-0000" },
  { value: "email",  label: "E-mail",           placeholder: "seu@email.com" },
  { value: "random", label: "Chave Aleatória",  placeholder: "xxxx-xxxx-xxxx-xxxx" },
  { value: "cnpj",   label: "CNPJ",             placeholder: "00.000.000/0000-00" },
];

export default function PixPage() {
  const router = useRouter();

  const [keyType, setKeyType] = useState<PixKeyType>("cpf");
  const [pixKey, setPixKey] = useState("");
  const [bankName, setBankName] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [sameHolder, setSameHolder] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const currentKeyType = PIX_KEY_TYPES.find((t) => t.value === keyType)!;

  function formatKey(raw: string): string {
    if (keyType === "cpf")   return maskCPF(raw);
    if (keyType === "phone") return maskPhone(raw);
    return raw;
  }

  function validatePixKey(): boolean {
    if (!pixKey.trim()) { setError("Informe sua chave PIX"); return false; }
    if (!bankName)       { setError("Selecione o banco recebedor"); return false; }
    if (!recipientName.trim()) { setError("Informe o nome do titular"); return false; }
    if (!sameHolder)     { setError("Confirme que a chave está no seu nome"); return false; }
    return true;
  }

  function handleContinue() {
    setError("");
    if (!validatePixKey()) return;
    setLoading(true);

    const pixData = {
      pixKey: keyType === "cpf" ? onlyDigits(pixKey) : pixKey.trim(),
      pixKeyType: keyType,
      pixBankName: bankName,
      pixRecipientNameDeclared: recipientName,
      pixConfirmedSameHolder: true,
    };

    sessionStorage.setItem("pixData", JSON.stringify(pixData));
    router.push("/documentos");
  }

  return (
    <div className="bg-surface min-h-dvh flex flex-col">
      <Header showBack showLogo={false} title="Chave PIX" />

      <main className="flex-1 mt-16 pb-40 px-5 pt-8">
        <div className="max-w-lg mx-auto flex flex-col gap-6">

          <ProgressBar currentStep={4} label="Chave PIX" />

          <div>
            <h1 className="text-headline-md font-headline font-extrabold text-on-surface tracking-tight mb-2">
              Onde você quer receber o dinheiro?
            </h1>
            <p className="text-body-md text-on-surface-variant leading-relaxed">
              Informe sua chave PIX para receber a transferência instantânea após a aprovação.
            </p>
          </div>

          <div className="flex flex-col gap-4">

            {/* Tipo de chave — botões pill */}
            <div>
              <p className="text-label-md text-on-surface-variant font-label mb-2.5 px-1">
                Tipo de chave
              </p>
              <div className="flex flex-wrap gap-2">
                {PIX_KEY_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => { setKeyType(t.value); setPixKey(""); }}
                    className={cn(
                      "px-4 py-2 rounded-full text-xs font-bold font-label transition-all",
                      keyType === t.value
                        ? "bg-primary text-white"
                        : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Chave PIX */}
            <div className={cn(
              "bg-surface-container-low rounded-2xl border-2 transition-all",
              "focus-within:border-primary/30 focus-within:bg-white",
              "border-transparent"
            )}>
              <div className="px-5 pt-4">
                <label className="text-[10px] font-bold text-primary uppercase tracking-wider font-label">
                  Chave PIX — {currentKeyType.label}
                </label>
              </div>
              <input
                type={keyType === "email" ? "email" : "text"}
                inputMode={keyType === "cpf" || keyType === "phone" ? "numeric" : "text"}
                value={formatKey(pixKey)}
                onChange={(e) => {
                  setError("");
                  setPixKey(e.target.value);
                }}
                placeholder={currentKeyType.placeholder}
                className="w-full bg-transparent border-none outline-none px-5 pb-4 pt-2
                           text-on-surface font-body font-semibold text-base
                           placeholder:text-outline-variant"
              />
            </div>

            {/* Banco recebedor */}
            <div className="bg-surface-container-low rounded-2xl border-2 border-transparent focus-within:border-primary/30">
              <div className="px-5 pt-4">
                <label className="text-[10px] font-bold text-primary uppercase tracking-wider font-label">
                  Banco recebedor
                </label>
              </div>
              <select
                value={bankName}
                onChange={(e) => { setBankName(e.target.value); setError(""); }}
                className="w-full bg-transparent border-none outline-none px-5 pb-4 pt-2
                           text-on-surface font-body font-semibold cursor-pointer"
              >
                <option value="">Selecione o banco</option>
                {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            {/* Nome do titular */}
            <div className="bg-surface-container-low rounded-2xl border-2 border-transparent focus-within:border-primary/30">
              <div className="px-5 pt-4">
                <label className="text-[10px] font-bold text-primary uppercase tracking-wider font-label">
                  Nome do titular da chave
                </label>
              </div>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => { setRecipientName(e.target.value); setError(""); }}
                placeholder="Nome completo como na conta"
                className="w-full bg-transparent border-none outline-none px-5 pb-4 pt-2
                           text-on-surface font-body font-semibold placeholder:text-outline-variant"
              />
            </div>

            {/* Aviso importante */}
            <div className="bg-tertiary-fixed-dim/15 border-l-4 border-tertiary-fixed-dim p-4 rounded-r-2xl flex gap-3 items-start">
              <span className="material-symbols-outlined text-tertiary text-xl flex-shrink-0">warning</span>
              <p className="text-body-sm font-bold text-on-tertiary-fixed-variant leading-snug">
                O PIX só será enviado para contas no mesmo nome do titular da operação.
              </p>
            </div>

            {/* Checkbox confirmação */}
            <label className="flex items-center gap-3 p-4 bg-surface-container-low rounded-2xl cursor-pointer">
              <div className="relative flex-shrink-0">
                <input
                  type="checkbox"
                  checked={sameHolder}
                  onChange={(e) => { setSameHolder(e.target.checked); setError(""); }}
                  className="h-6 w-6 rounded-lg border-2 border-outline-variant appearance-none
                             bg-white checked:bg-primary checked:border-primary
                             transition-all cursor-pointer"
                />
                {sameHolder && (
                  <span className="material-symbols-outlined absolute inset-0 text-white text-[18px]
                                   flex items-center justify-center pointer-events-none icon-filled">
                    check
                  </span>
                )}
              </div>
              <span className="text-body-md font-semibold text-on-surface">
                Confirmo que a chave PIX está no meu nome
              </span>
            </label>

            {/* Erro */}
            {error && (
              <p className="text-body-sm text-error flex items-center gap-1.5 px-1">
                <span className="material-symbols-outlined text-base">error</span>
                {error}
              </p>
            )}
          </div>
        </div>
      </main>

      <BottomCTA
        label="Continuar →"
        onClick={handleContinue}
        loading={loading}
        disabled={!sameHolder || !pixKey || !bankName || !recipientName}
      />
    </div>
  );
}
