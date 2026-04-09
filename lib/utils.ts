import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes sem conflitos */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formata valor em reais: 1234.56 → "R$ 1.234,56" */
export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/** Formata percentual: 4.98 → "4,98%" */
export function formatPct(value: number, decimals = 2): string {
  return `${value.toFixed(decimals).replace(".", ",")}%`;
}

/** Aplica máscara no CPF: 12345678901 → "123.456.789-01" */
export function maskCPF(cpf: string): string {
  return cpf
    .replace(/\D/g, "")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
    .slice(0, 14);
}

/** Aplica máscara no telefone: 11999999999 → "(11) 99999-9999" */
export function maskPhone(phone: string): string {
  return phone
    .replace(/\D/g, "")
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d{4})$/, "$1-$2")
    .slice(0, 15);
}

/** Aplica máscara no CEP: 01310100 → "01310-100" */
export function maskCEP(cep: string): string {
  return cep
    .replace(/\D/g, "")
    .replace(/(\d{5})(\d{3})$/, "$1-$2")
    .slice(0, 9);
}

/** Remove todos os caracteres não numéricos */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Valida CPF pelo algoritmo oficial */
export function validateCPF(cpf: string): boolean {
  const digits = onlyDigits(cpf);
  if (digits.length !== 11) return false;
  if (/^(\d)\1+$/.test(digits)) return false; // todos iguais

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  return remainder === parseInt(digits[10]);
}

/** Simulação financeira (espelha simulation.service.js do backend) */
export function simulateOperation({
  pixAmount,
  installments,
  profitMarginPct,
  feePct,
}: {
  pixAmount: number;
  installments: number;
  profitMarginPct: number;
  feePct: number;
}) {
  const desiredNet = pixAmount * (1 + profitMarginPct / 100);
  const factor = 1 - feePct / 100;
  const cardTotal = desiredNet / factor;
  const installmentValue = cardTotal / installments;
  const feeAmount = cardTotal - desiredNet;

  return {
    pixAmount:        round(pixAmount),
    installments,
    profitMarginPct:  round(profitMarginPct),
    feePct:           round(feePct),
    feeAmount:        round(feeAmount),
    cardTotal:        round(cardTotal),
    installmentValue: round(installmentValue),
    netToOperation:   round(desiredNet),
    estimatedProfit:  round(desiredNet - pixAmount),
  };
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Gera tabela de 1x a maxInstallments para um pixAmount + feeMap */
export function generateSimulationTable(
  pixAmount: number,
  profitMarginPct: number,
  feeMap: Record<number, number>, // installments → feePct
  maxInstallments = 12
) {
  return Array.from({ length: maxInstallments }, (_, i) => {
    const installments = i + 1;
    const feePct = feeMap[installments] ?? feeMap[maxInstallments] ?? 4.98;
    const result = simulateOperation({ pixAmount, installments, profitMarginPct, feePct });
    return {
      installments,
      feePct,
      cardTotal:        result.cardTotal,
      installmentValue: result.installmentValue,
      estimatedProfit:  result.estimatedProfit,
      profitPct:        round((result.estimatedProfit / pixAmount) * 100),
    };
  });
}

/** Trunca texto: "Lorem ipsum dolor" → "Lorem ipsum..." */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

/** Atraso assíncrono */
export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
