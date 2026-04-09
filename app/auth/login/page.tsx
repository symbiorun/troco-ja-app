"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email) { setError("Informe seu e-mail"); return; }
    setLoading(true);
    setError("");

    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (err) {
      setError("Erro ao enviar link. Tente novamente.");
      setLoading(false);
    } else {
      setSent(true);
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <div className="min-h-dvh bg-surface flex flex-col items-center justify-center px-5 py-12">
      {/* Logo */}
      <div className="mb-8 rounded-3xl overflow-hidden w-32 h-32" style={{ background: "#191c1e" }}>
        <Image src="/assets/logo-vertical.png" alt="TrocoJá" width={128} height={128}
               className="object-contain w-full h-full" priority />
      </div>

      <div className="w-full max-w-sm">
        {!sent ? (
          <>
            <h1 className="text-headline-md font-headline font-extrabold text-on-surface text-center mb-2">
              Entrar na TrocoJá
            </h1>
            <p className="text-body-md text-on-surface-variant text-center mb-8">
              Acesse sua conta para acompanhar suas operações
            </p>

            {/* Google */}
            <button
              onClick={handleGoogle}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 bg-white border border-outline-variant/40
                         py-4 px-6 rounded-2xl shadow-card hover:bg-surface-container-low transition-colors mb-6
                         disabled:opacity-50"
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span className="font-bold font-headline text-on-surface">
                {googleLoading ? "Redirecionando..." : "Entrar com Google"}
              </span>
            </button>

            <div className="flex items-center gap-4 mb-6">
              <div className="h-px flex-1 bg-surface-container-high" />
              <span className="text-[10px] font-bold text-outline uppercase tracking-widest">ou</span>
              <div className="h-px flex-1 bg-surface-container-high" />
            </div>

            <form onSubmit={handleMagicLink} className="flex flex-col gap-4">
              <div className={cn(
                "bg-surface-container-lowest rounded-2xl border-2 transition-all",
                "focus-within:border-primary/30",
                error ? "border-error/50" : "border-transparent"
              )}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  placeholder="seu@email.com"
                  className="w-full bg-transparent border-none outline-none px-5 py-4
                             text-on-surface font-body placeholder:text-outline-variant"
                  autoFocus
                />
              </div>
              {error && <p className="text-body-sm text-error px-1">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
              >
                {loading ? "Enviando..." : "Enviar link de acesso"}
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-col items-center text-center gap-5 animate-fade-in">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-5xl icon-filled">mark_email_read</span>
            </div>
            <h2 className="text-headline-sm font-headline font-extrabold text-on-surface">
              Verifique seu e-mail!
            </h2>
            <p className="text-body-md text-on-surface-variant leading-relaxed">
              Enviamos um link de acesso para <strong>{email}</strong>.
              Clique no link para entrar na sua conta.
            </p>
            <button
              onClick={() => setSent(false)}
              className="text-body-md text-primary font-bold hover:underline"
            >
              Tentar outro e-mail
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
