"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import Header from "@/components/layout/Header";
import ProgressBar from "@/components/ui/ProgressBar";
import BottomCTA from "@/components/ui/BottomCTA";

type DocStatus = "pending" | "uploading" | "done" | "error";

interface DocFile {
  file: File | null;
  preview: string | null;
  status: DocStatus;
  error?: string;
}

const initialDoc: DocFile = { file: null, preview: null, status: "pending" };

export default function DocumentosPage() {
  const router = useRouter();
  const supabase = createClient();

  const [docFront, setDocFront] = useState<DocFile>(initialDoc);
  const [docBack, setDocBack] = useState<DocFile>(initialDoc);
  const [selfie, setSelfie] = useState<DocFile>(initialDoc);
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState("");

  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);
  const selfieRef = useRef<HTMLInputElement>(null);

  const allDone =
    docFront.status === "done" &&
    docBack.status === "done" &&
    selfie.status === "done";

  const handleFile = useCallback(
    async (
      file: File,
      setter: React.Dispatch<React.SetStateAction<DocFile>>,
      folder: string
    ) => {
      if (!file.type.startsWith("image/")) {
        setter((p) => ({ ...p, error: "Apenas imagens são aceitas", status: "error" }));
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setter((p) => ({ ...p, error: "Arquivo muito grande (máx 10MB)", status: "error" }));
        return;
      }

      const preview = URL.createObjectURL(file);
      setter({ file, preview, status: "uploading" });

      try {
        const applicationId = sessionStorage.getItem("applicationId");
        if (!applicationId) throw new Error("Sessão inválida");

        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${applicationId}/${folder}/${Date.now()}.${ext}`;

        const { error } = await supabase.storage
          .from("documents")
          .upload(path, file, { upsert: true });

        if (error) throw error;

        setter({ file, preview, status: "done" });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erro no upload";
        setter((p) => ({ ...p, status: "error", error: msg }));
      }
    },
    [supabase]
  );

  const onFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<DocFile>>,
    folder: string
  ) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file, setter, folder);
  };

  async function handleSubmit() {
    if (!allDone) return;
    setSubmitting(true);
    setGlobalError("");

    try {
      const applicationId = sessionStorage.getItem("applicationId");
      if (!applicationId) throw new Error("Sessão inválida. Reinicie o processo.");

      // 1) Mark docs as submitted (docs_pending)
      const res1 = await fetch(`/api/aplicacao/${applicationId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "docs_pending" }),
      });
      if (!res1.ok) throw new Error("Erro ao registrar documentos");

      // 2) Advance immediately to contract_pending (KYC runs async in background)
      const res2 = await fetch(`/api/aplicacao/${applicationId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "contract_pending", notes: "KYC async — avançando para contrato" }),
      });
      if (!res2.ok) throw new Error("Erro ao avançar para contrato");

      router.push("/contrato");
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : "Erro inesperado");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh bg-surface flex flex-col">
      <Header showBack backHref="/pix" />

      <main className="flex-1 pt-20 pb-32 px-5 max-w-lg mx-auto w-full">
        <ProgressBar currentStep={5} totalSteps={8} className="mb-8" />

        {/* Mascote card */}
        <div className="relative bg-surface-container-low rounded-3xl p-6 mb-8 overflow-hidden">
          <div className="relative z-10 pr-20">
            <h1 className="text-headline-sm font-headline font-extrabold text-on-surface leading-tight mb-2">
              Envie seus documentos
            </h1>
            <p className="text-body-sm text-on-surface-variant">
              Estamos quase lá! Precisamos validar sua identidade com segurança.
            </p>
          </div>
          <div className="absolute -right-2 -bottom-2 w-28 h-28" style={{ background: "#191c1e", borderRadius: "1rem" }}>
            <Image
              src="/assets/mascote.png"
              alt="Mascote TrocoJá"
              width={112}
              height={112}
              className="object-contain w-full h-full"
            />
          </div>
        </div>

        {/* Upload cards */}
        <div className="space-y-4 mb-6">
          {/* RG/CNH Frente */}
          <UploadCard
            icon="badge"
            title="RG ou CNH — Frente"
            hint="Frente do documento visível"
            doc={docFront}
            inputRef={frontRef}
            onChange={(e) => onFileChange(e, setDocFront, "doc_front")}
            onRetry={() => { setDocFront(initialDoc); frontRef.current?.click(); }}
          />

          {/* RG/CNH Verso */}
          <UploadCard
            icon="document_scanner"
            title="RG ou CNH — Verso"
            hint="Verso do documento visível"
            doc={docBack}
            inputRef={backRef}
            onChange={(e) => onFileChange(e, setDocBack, "doc_back")}
            onRetry={() => { setDocBack(initialDoc); backRef.current?.click(); }}
          />

          {/* Selfie */}
          <UploadCard
            icon="photo_camera_front"
            title="Selfie de Segurança"
            hint="Sem óculos ou boné — rosto visível"
            doc={selfie}
            inputRef={selfieRef}
            onChange={(e) => onFileChange(e, setSelfie, "selfie")}
            onRetry={() => { setSelfie(initialDoc); selfieRef.current?.click(); }}
            isCapture
          />
        </div>

        {/* LGPD notice */}
        <div className="flex items-start gap-3 p-4 bg-secondary-fixed/20 rounded-2xl">
          <span className="material-symbols-outlined text-secondary text-xl flex-shrink-0 mt-0.5">lock</span>
          <p className="text-[11px] leading-relaxed text-on-surface-variant font-medium">
            Seus dados são criptografados e protegidos de acordo com a LGPD.
            Não compartilhamos suas fotos com terceiros.
          </p>
        </div>

        {globalError && (
          <p className="mt-4 text-body-sm text-error px-1">{globalError}</p>
        )}
      </main>

      <BottomCTA
        label={submitting ? "Enviando..." : "Enviar documentos"}
        onClick={handleSubmit}
        disabled={!allDone || submitting}
        icon="arrow_forward"
      />
    </div>
  );
}

/* ── Upload Card Component ── */
interface UploadCardProps {
  icon: string;
  title: string;
  hint: string;
  doc: DocFile;
  inputRef: React.RefObject<HTMLInputElement>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRetry: () => void;
  isCapture?: boolean;
}

function UploadCard({
  icon, title, hint, doc, inputRef, onChange, onRetry, isCapture,
}: UploadCardProps) {
  return (
    <div
      className={`bg-surface-container-lowest rounded-2xl p-5 transition-all ${
        doc.status === "done" ? "ring-2 ring-primary/30" :
        doc.status === "error" ? "ring-2 ring-error/30" : ""
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={isCapture ? "user" : undefined}
        className="hidden"
        onChange={onChange}
      />

      <div className="flex items-center gap-4">
        {/* Icon / Preview */}
        <div className="w-14 h-14 rounded-xl overflow-hidden bg-surface-container flex-shrink-0 flex items-center justify-center">
          {doc.preview ? (
            <img src={doc.preview} alt={title} className="w-full h-full object-cover" />
          ) : (
            <span className="material-symbols-outlined text-secondary text-2xl">{icon}</span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-body-md font-bold text-on-surface">{title}</h3>
          <p className="text-body-sm text-on-surface-variant">{hint}</p>
          {doc.error && (
            <p className="text-[11px] text-error mt-1">{doc.error}</p>
          )}
        </div>

        {/* Status action */}
        <StatusBadge
          status={doc.status}
          onUpload={() => inputRef.current?.click()}
          onRetry={onRetry}
        />
      </div>

      {/* Upload progress indicator */}
      {doc.status === "uploading" && (
        <div className="mt-3 h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
          <div className="h-full w-2/3 bg-primary rounded-full animate-pulse" />
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status, onUpload, onRetry,
}: { status: DocStatus; onUpload: () => void; onRetry: () => void }) {
  if (status === "pending") {
    return (
      <button
        onClick={onUpload}
        className="flex-shrink-0 w-10 h-10 rounded-full bg-surface-container
                   flex items-center justify-center hover:bg-surface-container-high transition-colors"
      >
        <span className="material-symbols-outlined text-outline text-xl">upload</span>
      </button>
    );
  }
  if (status === "uploading") {
    return (
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-surface-container
                      flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (status === "done") {
    return (
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10
                      flex items-center justify-center">
        <span className="material-symbols-outlined text-primary text-xl"
              style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
      </div>
    );
  }
  // error
  return (
    <button
      onClick={onRetry}
      className="flex-shrink-0 w-10 h-10 rounded-full bg-error/10
                 flex items-center justify-center hover:bg-error/20 transition-colors"
    >
      <span className="material-symbols-outlined text-error text-xl">refresh</span>
    </button>
  );
}
