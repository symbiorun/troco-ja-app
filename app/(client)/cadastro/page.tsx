"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Header } from "@/components/layout/Header";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { BottomCTA } from "@/components/ui/BottomCTA";
import { createClient } from "@/lib/supabase/client";
import { validateCPF, maskCPF, maskPhone, onlyDigits } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface FormState {
  email: string;
  fullName: string;
  cpf: string;
  phone: string;
  birthDate: string;
}

interface FormErrors {
  email?: string;
  fullName?: string;
  cpf?: string;
  phone?: string;
  birthDate?: string;
}

export default function CadastroPage() {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState<FormState>({
    email: "",
    fullName: "",
    cpf: "",
    phone: "",
    birthDate: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  function setField<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const newErrors: FormErrors = {};
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "E-mail inválido";
    }
    if (!form.fullName || form.fullName.trim().split(" ").length < 2) {
      newErrors.fullName = "Informe nome e sobrenome";
    }
    if (!validateCPF(form.cpf)) {
      newErrors.cpf = "CPF inválido";
    }
    if (onlyDigits(form.phone).length < 10) {
      newErrors.phone = "Telefone inválido";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/pix`,
        },
      });
      if (error) throw error;
    } catch (err) {
      console.error("Erro Google OAuth:", err);
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);

    try {
      // Salva dados do cadastro para usar no fluxo
      sessionStorage.setItem("customer", JSON.stringify({
        email: form.email,
        fullName: form.fullName,
        cpf: onlyDigits(form.cpf),
        phone: onlyDigits(form.phone),
        birthDate: form.birthDate,
      }));

      // Sign up / sign in com magic link
      const { error } = await supabase.auth.signInWithOtp({
        email: form.email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/pix`,
          data: {
            full_name: form.fullName,
            cpf: onlyDigits(form.cpf),
            phone: onlyDigits(form.phone),
          },
        },
      });

      if (error) throw error;
      router.push("/pix");
    } catch (err: unknown) {
      console.error("Erro no cadastro:", err);
      setLoading(false);
    }
  }

  return (
    <div className="bg-surface min-h-dvh flex flex-col">
      <Header showBack showLogo={false} title="Seus dados" />

      <main className="flex-1 mt-16 pb-40 px-5 pt-8">
        <div className="max-w-lg mx-auto flex flex-col gap-6">

          {/* Já tem conta? */}
          <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex justify-between items-center">
            <span className="text-body-sm text-on-surface-variant">Já tem uma conta?</span>
            <button
              onClick={() => router.push("/auth/login")}
              className="text-body-sm font-bold text-primary hover:underline"
            >
              Fazer Login
            </button>
          </div>

          <ProgressBar currentStep={3} label="Cadastro" />

          {/* Título Editorial */}
          <div className="relative">
            <h1 className="text-headline-md font-headline font-extrabold text-on-surface tracking-tight mb-2">
              Acesse sua conta ou<br />comece agora
            </h1>
            <p className="text-body-md text-on-surface-variant leading-relaxed max-w-[90%]">
              Digite seu e-mail para continuar. Usamos seus dados apenas para validar a operação.
            </p>
            {/* Mascote watermark */}
            <div className="absolute -right-2 -top-4 opacity-8 pointer-events-none w-20 h-20 rounded-2xl overflow-hidden"
                 style={{ background: "#191c1e" }}>
              <Image src="/assets/mascote.png" alt="" width={80} height={80}
                     className="object-contain w-full h-full opacity-60" />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>

            {/* Botão Google */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 bg-white border border-surface-container-highest
                         py-4 px-6 rounded-2xl shadow-card hover:bg-surface-container-low transition-colors
                         disabled:opacity-50"
            >
              {/* Google SVG */}
              <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span className="font-bold text-on-surface font-headline">
                {googleLoading ? "Aguarde..." : "Continuar com Google"}
              </span>
            </button>

            {/* Divisor */}
            <div className="flex items-center gap-4">
              <div className="h-px w-full bg-surface-container-high" />
              <span className="text-[10px] font-bold text-outline uppercase tracking-widest whitespace-nowrap">ou</span>
              <div className="h-px w-full bg-surface-container-high" />
            </div>

            {/* E-mail */}
            <InputField
              label="E-mail"
              type="email"
              value={form.email}
              onChange={(v) => setField("email", v)}
              placeholder="seu@email.com"
              error={errors.email}
              autoFocus
            />

            {/* Divisor "Novo por aqui?" */}
            <div className="flex items-center gap-4 pt-2">
              <span className="text-[10px] font-bold text-outline uppercase tracking-widest whitespace-nowrap font-label">Novo por aqui?</span>
              <div className="h-px w-full bg-surface-container-high" />
            </div>

            <InputField
              label="Nome completo"
              type="text"
              value={form.fullName}
              onChange={(v) => setField("fullName", v)}
              placeholder="Como no seu documento"
              error={errors.fullName}
            />

            <InputField
              label="CPF"
              type="text"
              inputMode="numeric"
              value={maskCPF(form.cpf)}
              onChange={(v) => setField("cpf", v)}
              placeholder="000.000.000-00"
              maxLength={14}
              error={errors.cpf}
            />

            <InputField
              label="Telefone (WhatsApp)"
              type="tel"
              value={maskPhone(form.phone)}
              onChange={(v) => setField("phone", v)}
              placeholder="(00) 00000-0000"
              maxLength={15}
              error={errors.phone}
            />

            <InputField
              label="Data de nascimento"
              type="date"
              value={form.birthDate}
              onChange={(v) => setField("birthDate", v)}
              error={errors.birthDate}
            />

            {/* Botão submit oculto — o CTA externo fará submit */}
            <button type="submit" className="hidden" id="submit-btn" />
          </form>
        </div>
      </main>

      <BottomCTA
        label="Continuar →"
        onClick={() => document.getElementById("submit-btn")?.click()}
        loading={loading}
      />
    </div>
  );
}

// ── Campo de input reutilizável ────────────────────────────────────────────
interface InputFieldProps {
  label: string;
  type?: string;
  inputMode?: "text" | "numeric" | "tel" | "email" | "decimal";
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  error?: string;
  autoFocus?: boolean;
}

function InputField({
  label,
  type = "text",
  inputMode,
  value,
  onChange,
  placeholder,
  maxLength,
  error,
  autoFocus,
}: InputFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-label-md text-on-surface font-label px-1">{label}</label>
      <div className={cn(
        "bg-surface-container-lowest rounded-2xl px-5 py-4 border-2 transition-all",
        "focus-within:border-primary/30 focus-within:ring-4 focus-within:ring-primary/5",
        error ? "border-error/50 bg-error/5" : "border-transparent"
      )}>
        <input
          type={type}
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          autoFocus={autoFocus}
          className="w-full bg-transparent border-none outline-none p-0 text-on-surface
                     placeholder:text-outline-variant font-body font-medium text-base"
        />
      </div>
      {error && (
        <p className="text-body-sm text-error px-1 flex items-center gap-1">
          <span className="material-symbols-outlined text-sm">error</span>
          {error}
        </p>
      )}
    </div>
  );
}
