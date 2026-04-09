"use client";

import { cn } from "@/lib/utils";

interface BottomCTAProps {
  /** Texto do botão principal */
  label: string;
  /** Ação ao clicar */
  onClick?: () => void;
  /** Tipo do botão: primary (verde) ou action (amarelo) */
  variant?: "primary" | "action";
  /** Desabilita o botão */
  disabled?: boolean;
  /** Exibe estado de loading */
  loading?: boolean;
  /** Ícone Material Symbols à direita do label (ex: "arrow_forward") */
  icon?: string;
  /** Texto secundário acima do botão */
  hint?: string;
  /** type do button HTML */
  type?: "button" | "submit";
  className?: string;
}

/**
 * Botão CTA fixo no bottom com glassmorphism.
 *
 * REGRA DO DESIGN SYSTEM:
 * - variant="primary" (verde, default): para avançar no fluxo
 * - variant="action" (amarelo #fcbb37): EXCLUSIVO para ação final irreversível
 *   (Aceitar Contrato, Confirmar PIX, Finalizar Pagamento)
 */
export function BottomCTA({
  label,
  onClick,
  variant = "primary",
  disabled = false,
  loading = false,
  icon,
  hint,
  type = "button",
  className,
}: BottomCTAProps) {
  return (
    <div className={cn("bottom-cta", className)}>
      {hint && (
        <p className="text-center text-xs text-on-surface-variant font-body mb-3">
          {hint}
        </p>
      )}
      <button
        type={type}
        onClick={onClick}
        disabled={disabled || loading}
        className={cn(
          variant === "action" ? "btn-action" : "btn-primary",
          "flex items-center justify-center gap-2",
          (disabled || loading) && "opacity-50 cursor-not-allowed"
        )}
      >
        {loading ? (
          <>
            <span className="material-symbols-outlined text-xl animate-spin">
              progress_activity
            </span>
            <span>Aguarde...</span>
          </>
        ) : (
          <>
            <span>{label}</span>
            {icon && (
              <span className="material-symbols-outlined text-xl">{icon}</span>
            )}
          </>
        )}
      </button>
    </div>
  );
}

// Default export for pages that import without braces
export default BottomCTA;
