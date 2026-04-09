"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface MascoteCardProps {
  /** Mensagem do mascote (bolinha de fala) */
  message?: string;
  /** Tamanho do mascote */
  size?: "sm" | "md" | "lg";
  /** Posiciona mascote à direita do título */
  inline?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { width: 64,  height: 64  },
  md: { width: 80,  height: 80  },
  lg: { width: 120, height: 120 },
};

/**
 * Mascote do TrocoJá integrado ao card
 * Regras do Design System:
 * - Aparece no canto superior direito dos cards (15% do espaço)
 * - Animação pulse durante loadings
 * - Badge "Oi!" na diagonal do mascote
 */
export function MascoteCard({
  message = "Oi!",
  size = "md",
  inline = false,
  className,
}: MascoteCardProps) {
  const dimensions = sizeMap[size];

  if (inline) {
    return (
      <div className={cn("relative flex-shrink-0", className)}>
        {/* Mascote com fundo escuro para contraste */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ width: dimensions.width, height: dimensions.height, background: "#191c1e" }}
        >
          <Image
            src="/assets/mascote.png"
            alt="Mascote TrocoJá"
            width={dimensions.width}
            height={dimensions.height}
            className="object-contain w-full h-full"
          />
        </div>
        {/* Badge */}
        {message && (
          <div className="absolute -top-2 -right-2 bg-tertiary-fixed-dim text-on-tertiary-fixed
                          text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm font-label whitespace-nowrap">
            {message}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex justify-center items-center py-4", className)}>
      <div className="relative">
        <div
          className="rounded-3xl overflow-hidden"
          style={{ width: dimensions.width, height: dimensions.height, background: "#191c1e" }}
        >
          <Image
            src="/assets/mascote.png"
            alt="Mascote TrocoJá"
            width={dimensions.width}
            height={dimensions.height}
            className="object-contain w-full h-full"
          />
        </div>
        {message && (
          <div className="absolute -top-2 -right-2 bg-tertiary-fixed-dim text-on-tertiary-fixed
                          text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm font-label">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Loading state com mascote animado (pulse)
 */
export function MascoteLoader({ message = "Processando..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <div className="relative animate-pulse-slow">
        <div
          className="rounded-3xl overflow-hidden"
          style={{ width: 100, height: 100, background: "#191c1e" }}
        >
          <Image
            src="/assets/mascote.png"
            alt="Carregando..."
            width={100}
            height={100}
            className="object-contain w-full h-full"
          />
        </div>
      </div>
      <p className="text-on-surface-variant text-sm font-body text-center">{message}</p>
    </div>
  );
}
