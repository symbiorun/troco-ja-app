"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface HeaderProps {
  showBack?: boolean;
  /** Se fornecido, o botão voltar navega para este path em vez de router.back() */
  backHref?: string;
  title?: string;
  /** Se true, exibe logomarca. Se false, exibe título textual */
  showLogo?: boolean;
  transparent?: boolean;
  className?: string;
}

/**
 * Header principal do app — mobile-first
 * Fundo escuro (primary) para contraste com as logomarcas que têm fundo preto
 */
export function Header({
  showBack = false,
  backHref,
  title,
  showLogo = true,
  transparent = false,
  className,
}: HeaderProps) {
  const router = useRouter();

  function handleBack() {
    if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  }

  return (
    <header
      className={cn(
        "fixed top-0 left-0 w-full z-50 flex items-center justify-between px-5 h-16",
        transparent ? "bg-transparent" : "bg-primary shadow-sm",
        className
      )}
    >
      {/* Esquerda: botão voltar ou menu */}
      <div className="flex items-center gap-3 w-10">
        {showBack ? (
          <button
            onClick={handleBack}
            className="text-white hover:opacity-75 transition-opacity p-1"
            aria-label="Voltar"
          >
            <span className="material-symbols-outlined text-2xl">arrow_back</span>
          </button>
        ) : (
          <button
            className="text-white hover:opacity-75 transition-opacity p-1"
            aria-label="Menu"
          >
            <span className="material-symbols-outlined text-2xl">menu</span>
          </button>
        )}
      </div>

      {/* Centro: logo ou título */}
      <div className="flex-1 flex justify-center items-center">
        {showLogo ? (
          <Link href="/" className="flex items-center">
            <Image
              src="/assets/logo-horizontal.png"
              alt="TrocoJá"
              width={120}
              height={36}
              className="object-contain h-9 w-auto"
              priority
            />
          </Link>
        ) : (
          <span className="text-white font-headline font-bold text-base tracking-tight line-clamp-1">
            {title}
          </span>
        )}
      </div>

      {/* Direita: botão de ajuda */}
      <div className="flex items-center justify-end w-10">
        <button
          className="text-white hover:opacity-75 transition-opacity p-1"
          aria-label="Ajuda"
        >
          <span className="material-symbols-outlined text-2xl">help_outline</span>
        </button>
      </div>
    </header>
  );
}

// Default export for pages that import without braces
export default Header;
