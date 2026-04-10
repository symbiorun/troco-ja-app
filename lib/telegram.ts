/**
 * lib/telegram.ts
 * Cliente do Bot Telegram para notificações ao administrador.
 * Envia mensagens com botões inline e processa callbacks de autorização.
 */

const TELEGRAM_API = "https://api.telegram.org/bot";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID ?? "";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface TelegramInlineButton {
  text: string;
  callback_data: string;
}

export interface TelegramMessage {
  message_id: number;
  chat: { id: number };
  text?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: { id: number; first_name: string };
  message: TelegramMessage;
  data?: string; // callback_data do botão clicado
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

function api(method: string) {
  return `${TELEGRAM_API}${BOT_TOKEN}/${method}`;
}

function escapeMarkdown(text: string): string {
  // Escape caracteres especiais do MarkdownV2
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

// ─── Funções principais ───────────────────────────────────────────────────────

/**
 * Envia mensagem de texto para o chat do admin.
 */
export async function sendMessage(
  text: string,
  chatId: string = ADMIN_CHAT_ID,
  parseMode: "HTML" | "MarkdownV2" | "Markdown" = "HTML"
): Promise<TelegramMessage | null> {
  if (!BOT_TOKEN || !chatId) {
    console.warn("[telegram] BOT_TOKEN ou ADMIN_CHAT_ID não configurados");
    return null;
  }

  const res = await fetch(api("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error("[telegram] sendMessage error:", data);
    return null;
  }
  return data.result;
}

/**
 * Envia mensagem com botões inline (teclado interativo).
 */
export async function sendMessageWithButtons(
  text: string,
  buttons: TelegramInlineButton[][],
  chatId: string = ADMIN_CHAT_ID
): Promise<TelegramMessage | null> {
  if (!BOT_TOKEN || !chatId) {
    console.warn("[telegram] BOT_TOKEN ou ADMIN_CHAT_ID não configurados");
    return null;
  }

  const res = await fetch(api("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: buttons,
      },
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error("[telegram] sendMessageWithButtons error:", data);
    return null;
  }
  return data.result;
}

/**
 * Edita uma mensagem já enviada (usado para atualizar após o admin clicar).
 */
export async function editMessage(
  chatId: number | string,
  messageId: number,
  text: string
): Promise<void> {
  await fetch(api("editMessageText"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [] }, // Remove os botões após ação
    }),
  });
}

/**
 * Responde a um callback_query (remove o "loading" do botão no app).
 */
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<void> {
  await fetch(api("answerCallbackQuery"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text: text ?? "Processando...",
      show_alert: false,
    }),
  });
}

// ─── Mensagens pré-formatadas ─────────────────────────────────────────────────

export interface OperationNotificationData {
  applicationId: string;
  customerName: string;
  customerCpf: string;
  customerPhone: string;
  cardAmount: number;  // Valor cobrado no cartão
  pixAmount: number;   // Valor a enviar no PIX (após taxa)
  feeAmount: number;   // Taxa da operação
  pixKey: string;
  pixKeyType: string;
  paymentId: string;   // ID do pagamento no Asaas
  operatorName?: string;
}

/**
 * Envia notificação de operação confirmada ao admin, com botões de ação.
 * callback_data formato: "ACTION:applicationId:paymentId"
 */
export async function notifyNewOperation(
  data: OperationNotificationData
): Promise<TelegramMessage | null> {
  const pixKeyTypeLabel: Record<string, string> = {
    CPF: "CPF",
    CNPJ: "CNPJ",
    EMAIL: "E-mail",
    PHONE: "Celular",
    EVP: "Chave aleatória",
  };

  const text = `
💰 <b>NOVA OPERAÇÃO CONFIRMADA</b>

🔢 <b>ID:</b> <code>${data.applicationId}</code>
👤 <b>Cliente:</b> ${data.customerName}
🪪 <b>CPF:</b> <code>${data.customerCpf}</code>
📱 <b>WhatsApp:</b> ${data.customerPhone}

━━━━━━━━━━━━━━━━━━━━━
💳 <b>Cartão:</b> R$ ${data.cardAmount.toFixed(2).replace(".", ",")}
💸 <b>Taxa:</b>  R$ ${data.feeAmount.toFixed(2).replace(".", ",")}
✅ <b>PIX a enviar:</b> R$ ${data.pixAmount.toFixed(2).replace(".", ",")}
━━━━━━━━━━━━━━━━━━━━━

🏦 <b>Chave PIX:</b>
<code>${data.pixKey}</code>
<i>Tipo: ${pixKeyTypeLabel[data.pixKeyType] ?? data.pixKeyType}</i>

${data.operatorName ? `👔 <b>Operador:</b> ${data.operatorName}\n` : ""}
⚡ Aguardando sua autorização para envio do PIX.
`.trim();

  const buttons: TelegramInlineButton[][] = [
    [
      {
        text: "✅ Autorizar PIX",
        callback_data: `AUTHORIZE_PIX:${data.applicationId}:${data.paymentId}`,
      },
      {
        text: "❌ Rejeitar",
        callback_data: `REJECT_PIX:${data.applicationId}:${data.paymentId}`,
      },
    ],
    [
      {
        text: "🔍 Ver detalhes no sistema",
        callback_data: `VIEW_DETAILS:${data.applicationId}`,
      },
    ],
  ];

  return sendMessageWithButtons(text, buttons);
}

/**
 * Notifica admin que o PIX foi enviado com sucesso.
 */
export async function notifyPixSent(
  applicationId: string,
  pixAmount: number,
  endToEndId: string,
  customerName: string
): Promise<void> {
  const text = `
✅ <b>PIX ENVIADO COM SUCESSO</b>

🔢 <b>Operação:</b> <code>${applicationId}</code>
👤 <b>Cliente:</b> ${customerName}
💸 <b>Valor enviado:</b> R$ ${pixAmount.toFixed(2).replace(".", ",")}
🔑 <b>EndToEndId:</b> <code>${endToEndId}</code>

📲 Cliente já foi notificado via WhatsApp e e-mail.
  `.trim();

  await sendMessage(text);
}

/**
 * Notifica admin que a operação foi rejeitada.
 */
export async function notifyOperationRejected(
  applicationId: string,
  customerName: string,
  reason: string
): Promise<void> {
  const text = `
❌ <b>OPERAÇÃO REJEITADA</b>

🔢 <b>Operação:</b> <code>${applicationId}</code>
👤 <b>Cliente:</b> ${customerName}
📋 <b>Motivo:</b> ${reason}
  `.trim();

  await sendMessage(text);
}

/**
 * Verifica se um callback_query veio do admin autorizado.
 */
export function isAuthorizedAdmin(fromId: number): boolean {
  const adminId = parseInt(ADMIN_CHAT_ID, 10);
  if (isNaN(adminId)) return false;
  return fromId === adminId;
}
