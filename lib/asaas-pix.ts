/**
 * lib/asaas-pix.ts
 * Integração com a API do Asaas para:
 *   - Solicitar antecipação de recebível de cartão
 *   - Executar transferência PIX
 *   - Consultar status de transferência
 */

const ASAAS_BASE_URL = process.env.ASAAS_BASE_URL ?? "https://sandbox.asaas.com/api/v3";
const ASAAS_API_KEY = process.env.ASAAS_API_KEY ?? "";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type PixKeyType = "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "EVP";

export interface AsaasAnticipation {
  id: string;
  status: "PENDING" | "APPROVED" | "DENIED";
  anticipatedValue: number;
  fee: number;
  requestedAt: string;
}

export interface AsaasTransfer {
  id: string;
  status: "PENDING" | "BANK_PROCESSING" | "DONE" | "CANCELLED" | "FAILED";
  value: number;
  netValue: number;
  transferFee: number;
  scheduledDate: string;
  endToEndIdentifier?: string;
  pixTransaction?: {
    endToEndIdentifier: string;
    txId: string;
  };
  failReason?: string;
}

export interface PixTransferInput {
  pixKey: string;
  pixKeyType: PixKeyType;
  amount: number;          // Valor a transferir em R$
  description?: string;    // Descrição da transferência
  applicationId: string;   // Para rastreabilidade
}

export interface AnticipationResult {
  success: boolean;
  anticipationId?: string;
  status?: string;
  anticipatedValue?: number;
  fee?: number;
  error?: string;
}

export interface PixTransferResult {
  success: boolean;
  transferId?: string;
  endToEndId?: string;
  status?: string;
  error?: string;
}

// ─── Cliente HTTP interno ─────────────────────────────────────────────────────

async function asaasRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  if (!ASAAS_API_KEY) throw new Error("ASAAS_API_KEY não configurada");

  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "access_token": ASAAS_API_KEY,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json();

  if (!res.ok) {
    const errMsg = data?.errors?.[0]?.description ?? data?.message ?? `HTTP ${res.status}`;
    throw new Error(`[Asaas] ${path}: ${errMsg}`);
  }

  return data as T;
}

// ─── Antecipação ──────────────────────────────────────────────────────────────

/**
 * Solicita antecipação de recebível de cartão no Asaas.
 * Asaas cobra uma taxa pela antecipação (geralmente % sobre o valor).
 * O pagamento precisa estar no status CONFIRMED.
 *
 * Docs: POST /v3/anticipations
 */
export async function requestAnticipation(
  paymentId: string
): Promise<AnticipationResult> {
  try {
    const result = await asaasRequest<AsaasAnticipation>("POST", "/anticipations", {
      payment: paymentId,
    });

    return {
      success: true,
      anticipationId: result.id,
      status: result.status,
      anticipatedValue: result.anticipatedValue,
      fee: result.fee,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[asaas-pix] requestAnticipation error:", message);
    return { success: false, error: message };
  }
}

/**
 * Consulta status de uma antecipação.
 */
export async function getAnticipationStatus(
  anticipationId: string
): Promise<AsaasAnticipation | null> {
  try {
    return await asaasRequest<AsaasAnticipation>("GET", `/anticipations/${anticipationId}`);
  } catch (err) {
    console.error("[asaas-pix] getAnticipationStatus error:", err);
    return null;
  }
}

// ─── Transferência PIX ────────────────────────────────────────────────────────

/**
 * Executa uma transferência PIX via Asaas.
 * O valor é debitado do saldo da conta Asaas.
 *
 * Docs: POST /v3/transfers
 */
export async function sendPixTransfer(
  input: PixTransferInput
): Promise<PixTransferResult> {
  try {
    const payload: Record<string, unknown> = {
      value: input.amount,
      pixAddressKey: input.pixKey,
      pixAddressKeyType: input.pixKeyType,
      description: input.description ?? `TrocoJá - Operação ${input.applicationId}`,
      scheduleDate: new Date().toISOString().split("T")[0], // Hoje
    };

    const result = await asaasRequest<AsaasTransfer>("POST", "/transfers", payload);

    // Extrai o endToEndId se disponível
    const endToEndId =
      result.endToEndIdentifier ??
      result.pixTransaction?.endToEndIdentifier ??
      result.id;

    return {
      success: true,
      transferId: result.id,
      endToEndId,
      status: result.status,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[asaas-pix] sendPixTransfer error:", message);
    return { success: false, error: message };
  }
}

/**
 * Consulta status de uma transferência PIX.
 */
export async function getTransferStatus(
  transferId: string
): Promise<AsaasTransfer | null> {
  try {
    return await asaasRequest<AsaasTransfer>("GET", `/transfers/${transferId}`);
  } catch (err) {
    console.error("[asaas-pix] getTransferStatus error:", err);
    return null;
  }
}

/**
 * Valida uma chave PIX consultando o Asaas.
 * Útil para verificar antes de enviar.
 *
 * Docs: GET /v3/pix/addressKeys/{key}
 */
export async function validatePixKey(
  pixKey: string
): Promise<{ valid: boolean; ownerName?: string; error?: string }> {
  try {
    const result = await asaasRequest<{
      addressKey: string;
      type: string;
      ownerName?: string;
    }>("GET", `/pix/addressKeys/${encodeURIComponent(pixKey)}`);

    return { valid: true, ownerName: result.ownerName };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: message };
  }
}

/**
 * Consulta o saldo disponível na conta Asaas.
 * Usado para verificar antes de enviar o PIX.
 */
export async function getAsaasBalance(): Promise<{
  balance: number;
  available: number;
} | null> {
  try {
    const result = await asaasRequest<{
      balance: number;
      availableForWithdrawal: number;
    }>("GET", "/finance/balance");

    return {
      balance: result.balance,
      available: result.availableForWithdrawal,
    };
  } catch (err) {
    console.error("[asaas-pix] getAsaasBalance error:", err);
    return null;
  }
}
