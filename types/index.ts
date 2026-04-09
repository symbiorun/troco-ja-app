// =============================================================================
// TROCO JÁ — Tipos globais TypeScript
// =============================================================================

// ── Status da aplicação (espelha constants.js do backend) ─────────────────
export type ApplicationStatus =
  | "new"
  | "simulation_done"
  | "data_filled"
  | "pix_data_added"
  | "docs_pending"
  | "contract_pending"
  | "payment_pending"
  | "payment_confirmed"
  | "pix_data_pending"
  | "pix_data_validating"
  | "pix_ready_to_send"
  | "pix_divergence_review"
  | "pix_sent"
  | "completed"
  | "rejected"
  | "cancelled";

// ── Canal de pagamento ─────────────────────────────────────────────────────
export type Channel = "online_link" | "machine_delivery";

// ── Tipo de chave PIX ──────────────────────────────────────────────────────
export type PixKeyType = "cpf" | "phone" | "email" | "random" | "cnpj";

// ── Resultado da simulação ─────────────────────────────────────────────────
export interface SimulationResult {
  pixAmount: number;
  installments: number;
  profitMarginPct: number;
  feePct: number;
  feeAmount: number;
  cardTotal: number;
  installmentValue: number;
  netToOperation: number;
  estimatedProfit: number;
  channel: Channel;
}

// ── Linha da tabela de simulação (1x–12x) ─────────────────────────────────
export interface SimulationRow {
  installments: number;
  feePct: number;
  cardTotal: number;
  installmentValue: number;
  estimatedProfit: number;
  profitPct: number;
}

// ── Dados de registro do cliente ───────────────────────────────────────────
export interface CustomerFormData {
  fullName: string;
  cpf: string;
  phone: string;
  email?: string;
  birthDate?: string;
  address?: string;
  addressNumber?: string;
  addressComplement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

// ── Dados da chave PIX ─────────────────────────────────────────────────────
export interface PixData {
  pixKey: string;
  pixKeyType: PixKeyType;
  pixBankName: string;
  pixRecipientNameDeclared: string;
  pixConfirmedSameHolder: boolean;
}

// ── Aplicação completa (banco) ─────────────────────────────────────────────
export interface Application {
  id: string;
  userId?: string;
  fullName: string;
  cpf: string;
  phone: string;
  email?: string;
  birthDate?: string;
  channel: Channel;
  pixAmount: number;
  installments: number;
  cardTotal: number;
  installmentValue: number;
  feePct?: number;
  profitMarginPct?: number;
  estimatedProfit?: number;
  // PIX
  pixKey?: string;
  pixKeyType?: PixKeyType;
  pixBankName?: string;
  pixRecipientNameDeclared?: string;
  pixConfirmedSameHolder?: boolean;
  pixHolderMatchStatus?: string;
  // Asaas
  asaasCustomerId?: string;
  asaasPaymentId?: string;
  asaasPaymentUrl?: string;
  // Status
  status: ApplicationStatus;
  riskScore?: number;
  paymentConfirmedAt?: string;
  pixSentAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Perfil do usuário ──────────────────────────────────────────────────────
export interface Profile {
  id: string;
  fullName?: string;
  phone?: string;
  avatarUrl?: string;
  role: "client" | "operator" | "admin";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Configuração admin ─────────────────────────────────────────────────────
export interface AdminConfig {
  key: string;
  value: string;
  valueType: "string" | "number" | "boolean" | "json";
  description?: string;
}

// ── Labels dos status para exibição ───────────────────────────────────────
export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  new:                  "Novo",
  simulation_done:      "Simulação feita",
  data_filled:          "Cadastro completo",
  pix_data_added:       "PIX informado",
  docs_pending:         "Documentos enviados",
  contract_pending:     "Contrato pendente",
  payment_pending:      "Aguardando pagamento",
  payment_confirmed:    "Pagamento confirmado",
  pix_data_pending:     "Dados PIX pendentes",
  pix_data_validating:  "Validando PIX",
  pix_ready_to_send:    "PIX pronto para envio",
  pix_divergence_review:"Revisão de divergência",
  pix_sent:             "PIX enviado ✓",
  completed:            "Concluído",
  rejected:             "Recusado",
  cancelled:            "Cancelado",
};

// ── Etapas do progresso (para ProgressBar) ────────────────────────────────
export const FLOW_STEPS = [
  { path: "/simulacao",  label: "Simulação",  step: 1 },
  { path: "/resultado",  label: "Resultado",  step: 2 },
  { path: "/cadastro",   label: "Cadastro",   step: 3 },
  { path: "/pix",        label: "Chave PIX",  step: 4 },
  { path: "/documentos", label: "Documentos", step: 5 },
  { path: "/contrato",   label: "Contrato",   step: 6 },
  { path: "/pagamento",  label: "Pagamento",  step: 7 },
  { path: "/status",     label: "Status",     step: 8 },
] as const;

export const TOTAL_STEPS = FLOW_STEPS.length;
