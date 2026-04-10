/**
 * lib/whatsapp.ts
 * Cliente UAZAPI para envio de mensagens WhatsApp.
 *
 * Docs: https://free.uazapi.com (ou api.uazapi.com no plano pago)
 *
 * Auth: header "token" com o token da instância
 * Envio: POST {UAZAPI_BASE_URL}/send/text
 *        POST {UAZAPI_BASE_URL}/send/menu  (botões)
 */

const UAZAPI_BASE_URL = process.env.UAZAPI_BASE_URL ?? "https://free.uazapi.com";
const UAZAPI_TOKEN    = process.env.UAZAPI_TOKEN ?? "";      // Token da instância

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface WhatsAppButton {
  id: string;
  title: string;
}

export interface SendTextResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ─── Cliente interno ──────────────────────────────────────────────────────────

async function uazapiRequest<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  if (!UAZAPI_TOKEN) {
    throw new Error("UAZAPI_TOKEN não configurado");
  }

  const res = await fetch(`${UAZAPI_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      token: UAZAPI_TOKEN,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(`[UAZAPI] ${path}: HTTP ${res.status} — ${JSON.stringify(data)}`);
  }

  return data as T;
}

// ─── Normalização de número ───────────────────────────────────────────────────

/**
 * Normaliza o número para o formato esperado pelo UAZAPI.
 * Entrada: "11999887766", "5511999887766", "+55 (11) 9 9988-7766"
 * Saída:   "5511999887766"
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Já tem código do país
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  // Adiciona +55
  return `55${digits}`;
}

// ─── Envio de mensagens ───────────────────────────────────────────────────────

/**
 * Envia mensagem de texto simples.
 */
export async function sendText(
  phone: string,
  text: string
): Promise<SendTextResult> {
  try {
    const number = normalizePhone(phone);
    const result = await uazapiRequest<{ messageId?: string; id?: string }>(
      "/send/text",
      { number, text, delay: 500 }   // delay: simula digitação (ms)
    );

    return {
      success: true,
      messageId: result.messageId ?? result.id,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[whatsapp] sendText error:", error);
    return { success: false, error };
  }
}

/**
 * Envia mensagem com botões de ação (até 3 botões).
 * UAZAPI usa o endpoint /send/menu com type: "button"
 */
export async function sendTextWithButtons(
  phone: string,
  text: string,
  buttons: WhatsAppButton[]
): Promise<SendTextResult> {
  // UAZAPI limita a 3 botões por mensagem
  const limitedButtons = buttons.slice(0, 3);

  try {
    const number = normalizePhone(phone);

    const result = await uazapiRequest<{ messageId?: string; id?: string }>(
      "/send/menu",
      {
        number,
        text,
        delay: 500,
        type: "button",
        footer: "",
        menu: limitedButtons.map((b) => ({
          id: b.id,
          title: b.title,
        })),
      }
    );

    return {
      success: true,
      messageId: result.messageId ?? result.id,
    };
  } catch (err) {
    // Fallback: envia texto sem botões se /send/menu falhar
    console.warn("[whatsapp] sendTextWithButtons failed, falling back to text:", err);
    return sendText(phone, text);
  }
}

/**
 * Envia mensagem de texto ou com botões automaticamente.
 */
export async function sendMessage(
  phone: string,
  text: string,
  buttons?: WhatsAppButton[]
): Promise<SendTextResult> {
  if (buttons && buttons.length > 0) {
    return sendTextWithButtons(phone, text, buttons);
  }
  return sendText(phone, text);
}

/**
 * Envia confirmação de PIX enviado ao cliente.
 */
export async function sendPixConfirmation(
  phone: string,
  customerName: string,
  amount: number,
  endToEndId: string
): Promise<SendTextResult> {
  const firstName = customerName.split(" ")[0];
  const amountFormatted = amount.toFixed(2).replace(".", ",");

  const text =
    `✅ *TrocoJá — PIX Enviado!*\n\n` +
    `Olá, ${firstName}! Seu PIX foi enviado com sucesso.\n\n` +
    `💸 *Valor:* R$ ${amountFormatted}\n` +
    `🔑 *Comprovante:* ${endToEndId}\n\n` +
    `O valor já está a caminho da sua conta.\n` +
    `Qualquer dúvida é só chamar aqui. 🙏`;

  return sendText(phone, text);
}

/**
 * Notifica cliente que sua operação foi rejeitada.
 */
export async function sendRejectionNotice(
  phone: string,
  customerName: string
): Promise<SendTextResult> {
  const firstName = customerName.split(" ")[0];

  const text =
    `⚠️ *TrocoJá — Operação não processada*\n\n` +
    `Olá, ${firstName}. Infelizmente sua operação não pôde ser concluída.\n\n` +
    `Entre em contato com nossa equipe para mais informações.\n\n` +
    `_Equipe TrocoJá_`;

  return sendText(phone, text);
}

// ─── Parser do payload de webhook UAZAPI ─────────────────────────────────────

export interface ParsedWebhookMessage {
  phone: string;           // Número normalizado (somente dígitos, sem @s.whatsapp.net)
  fromMe: boolean;
  isGroup: boolean;
  messageId: string;
  text: string;            // Texto extraído independente do tipo
  messageType: "text" | "image" | "document" | "audio" | "button_reply" | "other";
  mediaUrl?: string;
  senderName?: string;
  timestamp: number;
}

/**
 * Extrai os dados relevantes do payload de webhook do UAZAPI.
 * O UAZAPI envia: { event: "message", instance: "...", data: { key, message, ... } }
 */
export function parseWebhookPayload(

  payload: any
): ParsedWebhookMessage | null {
  try {
    // Suporta tanto o formato novo (com wrapper event/data) quanto direto
    const data = payload?.data ?? payload;
    const key = data?.key ?? {};

    const fromMe: boolean = key?.fromMe ?? false;
    const remoteJid: string = key?.remoteJid ?? "";

    // Ignora grupos
    const isGroup = remoteJid.endsWith("@g.us");

    // Extrai número limpo
    const phone = remoteJid
      .replace("@s.whatsapp.net", "")
      .replace("@c.us", "")
      .replace(/\D/g, "");

    if (!phone) return null;

    const msgObj = data?.message ?? {};
    const messageId = key?.id ?? data?.messageId ?? "";
    const senderName = data?.pushName ?? data?.senderName ?? "";
    const timestamp = data?.messageTimestamp ?? data?.momment ?? Date.now();

    // Extrai texto e tipo
    let text = "";
    let messageType: ParsedWebhookMessage["messageType"] = "other";
    let mediaUrl: string | undefined;

    if (msgObj.conversation) {
      text = msgObj.conversation;
      messageType = "text";
    } else if (msgObj.extendedTextMessage?.text) {
      text = msgObj.extendedTextMessage.text;
      messageType = "text";
    } else if (msgObj.imageMessage) {
      text = msgObj.imageMessage.caption ?? "[Imagem]";
      messageType = "image";
      mediaUrl = msgObj.imageMessage.url;
    } else if (msgObj.documentMessage) {
      text = `[Documento: ${msgObj.documentMessage.fileName ?? "arquivo"}]`;
      messageType = "document";
      mediaUrl = msgObj.documentMessage.url;
    } else if (msgObj.audioMessage || msgObj.pttMessage) {
      text = "[Áudio enviado]";
      messageType = "audio";
    } else if (msgObj.buttonsResponseMessage) {
      text = msgObj.buttonsResponseMessage.selectedDisplayText ?? "";
      messageType = "button_reply";
    } else if (msgObj.listResponseMessage) {
      text = msgObj.listResponseMessage.title ?? "";
      messageType = "button_reply";
    } else if (data?.body) {
      // Fallback para formato alternativo
      text = data.body;
      messageType = "text";
    }

    return {
      phone,
      fromMe,
      isGroup,
      messageId,
      text,
      messageType,
      mediaUrl,
      senderName,
      timestamp: typeof timestamp === "number" ? timestamp * 1000 : Date.now(),
    };
  } catch (err) {
    console.error("[whatsapp] parseWebhookPayload error:", err);
    return null;
  }
}
