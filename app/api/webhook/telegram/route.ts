/**
 * POST /api/webhook/telegram
 *
 * Recebe callbacks do Bot Telegram quando o admin clica em botões inline.
 * Fluxo ao clicar "✅ Autorizar PIX":
 *   1. Busca dados da operação no Supabase
 *   2. Verifica saldo disponível no Asaas
 *   3. Solicita antecipação (se configurado)
 *   4. Executa transferência PIX
 *   5. Atualiza status no Supabase
 *   6. Notifica cliente via WhatsApp + e-mail
 *   7. Confirma ao admin no Telegram
 *
 * Formato do callback_data: "ACTION:applicationId:paymentId"
 * Ações: AUTHORIZE_PIX | REJECT_PIX | VIEW_DETAILS
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  answerCallbackQuery,
  editMessage,
  isAuthorizedAdmin,
  notifyPixSent,
  notifyOperationRejected,
  sendMessage,
  type TelegramUpdate,
} from "@/lib/telegram";
import {
  sendPixTransfer,
  requestAnticipation,
  getAsaasBalance,
  type PixKeyType,
} from "@/lib/asaas-pix";
import { Resend } from "resend";
import { sendPixConfirmation, sendRejectionNotice } from "@/lib/whatsapp";

const resend = new Resend(process.env.RESEND_API_KEY);
const ANTICIPATION_ENABLED = process.env.ASAAS_AUTO_ANTICIPATION === "true";

// ─── Handler principal ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const update: TelegramUpdate = await req.json();

    // Só processa callback_query (cliques em botões)
    if (!update.callback_query) {
      return NextResponse.json({ ok: true });
    }

    const { id: callbackId, from, message, data: callbackData } = update.callback_query;

    // Verifica se é o admin autorizado
    if (!isAuthorizedAdmin(from.id)) {
      await answerCallbackQuery(callbackId, "⛔ Acesso não autorizado.");
      console.warn("[webhook/telegram] Unauthorized admin attempt from:", from.id);
      return NextResponse.json({ ok: true });
    }

    if (!callbackData) {
      await answerCallbackQuery(callbackId, "Dados inválidos.");
      return NextResponse.json({ ok: true });
    }

    const [action, applicationId, paymentId] = callbackData.split(":");

    // Responde imediatamente ao Telegram (remove o loading do botão)
    await answerCallbackQuery(callbackId, "Processando...");

    switch (action) {
      case "AUTHORIZE_PIX":
        await handleAuthorizePixAction(applicationId, paymentId, message.chat.id, message.message_id);
        break;

      case "REJECT_PIX":
        await handleRejectPixAction(applicationId, message.chat.id, message.message_id);
        break;

      case "VIEW_DETAILS":
        await handleViewDetailsAction(applicationId, message.chat.id);
        break;

      default:
        await sendMessage(`⚠️ Ação desconhecida: ${action}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/webhook/telegram]", err);
    // Sempre retorna 200 para o Telegram não retentar
    return NextResponse.json({ ok: true });
  }
}

// ─── Ação: Autorizar PIX ──────────────────────────────────────────────────────

async function handleAuthorizePixAction(
  applicationId: string,
  paymentId: string,
  chatId: number,
  messageId: number
) {
  const admin = createAdminClient();

  // Busca dados completos da operação
  const { data: app, error } = await admin
    .from("applications")
    .select(`
      id,
      customer_name,
      customer_phone,
      customer_email,
      pix_key,
      pix_key_type,
      pix_amount,
      card_amount,
      status
    `)
    .eq("id", applicationId)
    .single();

  if (error || !app) {
    await editMessage(chatId, messageId, `❌ <b>Operação não encontrada:</b> <code>${applicationId}</code>`);
    return;
  }

  // Verifica se já foi processada (idempotência)
  if (app.status === "pix_sent" || app.status === "completed") {
    await editMessage(chatId, messageId, `⚠️ <b>PIX já enviado</b> para operação <code>${applicationId}</code>`);
    return;
  }

  // Verifica saldo disponível
  const balance = await getAsaasBalance();
  if (balance && balance.available < app.pix_amount) {
    await editMessage(
      chatId,
      messageId,
      `❌ <b>Saldo insuficiente no Asaas</b>\n\nDisponível: R$ ${balance.available.toFixed(2)}\nNecessário: R$ ${app.pix_amount.toFixed(2)}`
    );
    return;
  }

  // Solicita antecipação se habilitado
  if (ANTICIPATION_ENABLED && paymentId) {
    await editMessage(chatId, messageId, `⏳ <b>Solicitando antecipação...</b>\n\nOperação: <code>${applicationId}</code>`);
    const anticipation = await requestAnticipation(paymentId);
    if (!anticipation.success) {
      // Antecipação falhou — continua sem ela (o saldo pode já estar disponível)
      console.warn("[webhook/telegram] Anticipation failed:", anticipation.error);
    }
  }

  // Atualiza status para "pix_processing" antes de enviar
  await admin
    .from("applications")
    .update({ status: "pix_processing", updated_at: new Date().toISOString() })
    .eq("id", applicationId);

  await editMessage(chatId, messageId, `⏳ <b>Enviando PIX...</b>\n\nValor: R$ ${app.pix_amount.toFixed(2)}\nChave: <code>${app.pix_key}</code>`);

  // Executa a transferência PIX
  const pixResult = await sendPixTransfer({
    pixKey: app.pix_key,
    pixKeyType: app.pix_key_type as PixKeyType,
    amount: app.pix_amount,
    applicationId,
    description: `TrocoJá - ${app.customer_name} - Op.${applicationId.slice(0, 8)}`,
  });

  if (!pixResult.success) {
    // PIX falhou — reverte status
    await admin
      .from("applications")
      .update({ status: "payment_confirmed", updated_at: new Date().toISOString() })
      .eq("id", applicationId);

    await editMessage(
      chatId,
      messageId,
      `❌ <b>Falha no envio do PIX</b>\n\nOperação: <code>${applicationId}</code>\nErro: ${pixResult.error}`
    );

    await admin.from("application_logs").insert({
      application_id: applicationId,
      event_type: "pix_transfer_failed",
      new_status: "payment_confirmed",
      metadata: { error: pixResult.error, authorized_by: "telegram_admin" },
    });
    return;
  }

  // PIX enviado com sucesso — atualiza banco
  const now = new Date().toISOString();
  await admin
    .from("applications")
    .update({
      status: "pix_sent",
      pix_sent_at: now,
      pix_transfer_id: pixResult.transferId,
      pix_end_to_end_id: pixResult.endToEndId,
      updated_at: now,
    })
    .eq("id", applicationId);

  await admin.from("application_logs").insert({
    application_id: applicationId,
    event_type: "pix_sent",
    previous_status: "pix_processing",
    new_status: "pix_sent",
    metadata: {
      transfer_id: pixResult.transferId,
      end_to_end_id: pixResult.endToEndId,
      amount: app.pix_amount,
      authorized_by: "telegram_admin",
    },
  });

  // Notificações em paralelo (não bloqueia)
  await Promise.allSettled([
    // 1. Telegram admin — confirma
    notifyPixSent(applicationId, app.pix_amount, pixResult.endToEndId ?? "N/A", app.customer_name),

    // 2. Edita a mensagem original com status final
    editMessage(
      chatId,
      messageId,
      `✅ <b>PIX ENVIADO COM SUCESSO</b>\n\n` +
      `🔢 Operação: <code>${applicationId}</code>\n` +
      `👤 Cliente: ${app.customer_name}\n` +
      `💸 Valor: R$ ${app.pix_amount.toFixed(2).replace(".", ",")}\n` +
      `🔑 EndToEndId: <code>${pixResult.endToEndId ?? "N/A"}</code>`
    ),

    // 3. WhatsApp para o cliente
    sendPixConfirmation(app.customer_phone, app.customer_name, app.pix_amount, pixResult.endToEndId ?? ""),

    // 4. E-mail para o cliente
    notifyClientEmail(app.customer_email, app.customer_name, app.pix_amount, applicationId, pixResult.endToEndId ?? ""),
  ]);

  // Marca como concluída após notificações
  await admin
    .from("applications")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", applicationId);
}

// ─── Ação: Rejeitar PIX ───────────────────────────────────────────────────────

async function handleRejectPixAction(
  applicationId: string,
  chatId: number,
  messageId: number
) {
  const admin = createAdminClient();

  const { data: app } = await admin
    .from("applications")
    .select("customer_name, customer_phone, status")
    .eq("id", applicationId)
    .single();

  if (!app) {
    await editMessage(chatId, messageId, `❌ Operação <code>${applicationId}</code> não encontrada.`);
    return;
  }

  await admin
    .from("applications")
    .update({ status: "rejected_by_admin", updated_at: new Date().toISOString() })
    .eq("id", applicationId);

  await admin.from("application_logs").insert({
    application_id: applicationId,
    event_type: "pix_rejected_by_admin",
    previous_status: app.status,
    new_status: "rejected_by_admin",
    metadata: { rejected_by: "telegram_admin" },
  });

  await editMessage(
    chatId,
    messageId,
    `❌ <b>OPERAÇÃO REJEITADA</b>\n\nOperação: <code>${applicationId}</code>\nCliente: ${app.customer_name}`
  );

  // Notifica o cliente via WhatsApp
  await sendRejectionNotice(app.customer_phone, app.customer_name);

  await notifyOperationRejected(applicationId, app.customer_name, "Rejeitado pelo administrador");
}

// ─── Ação: Ver detalhes ───────────────────────────────────────────────────────

async function handleViewDetailsAction(applicationId: string, chatId: number) {
  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const { data: app } = await admin
    .from("applications")
    .select("id, customer_name, customer_cpf, status, card_amount, pix_amount, created_at")
    .eq("id", applicationId)
    .single();

  if (!app) {
    await sendMessage(`❌ Operação <code>${applicationId}</code> não encontrada.`);
    return;
  }

  const detailUrl = `${appUrl}/admin/operacoes/${applicationId}`;
  await sendMessage(
    `📋 <b>Detalhes da Operação</b>\n\n` +
    `ID: <code>${app.id}</code>\n` +
    `Cliente: ${app.customer_name}\n` +
    `CPF: <code>${app.customer_cpf}</code>\n` +
    `Status: <b>${app.status}</b>\n` +
    `Cartão: R$ ${Number(app.card_amount).toFixed(2)}\n` +
    `PIX: R$ ${Number(app.pix_amount).toFixed(2)}\n` +
    `Data: ${new Date(app.created_at).toLocaleString("pt-BR")}\n\n` +
    `🔗 <a href="${detailUrl}">Ver no sistema</a>`
  );
}

// ─── Notificação por e-mail ao cliente ───────────────────────────────────────

async function notifyClientEmail(
  email: string,
  name: string,
  amount: number,
  applicationId: string,
  endToEndId: string
) {
  try {
    if (!process.env.RESEND_API_KEY || !email) return;

    const firstName = name.split(" ")[0];
    const amountFormatted = amount.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "noreply@trocoja.com.br",
      to: email,
      subject: `✅ TrocoJá - PIX enviado com sucesso!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #1a1a2e; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">TrocoJá</h1>
            <p style="color: #a0aec0; margin: 5px 0 0;">Confirmação de operação</p>
          </div>

          <div style="background: #f9f9f9; padding: 30px; border: 1px solid #e2e8f0;">
            <h2 style="color: #2d3748; margin-top: 0;">✅ PIX Enviado com Sucesso!</h2>
            <p style="color: #4a5568;">Olá, <strong>${firstName}</strong>!</p>
            <p style="color: #4a5568;">Seu PIX foi enviado e está a caminho da sua conta.</p>

            <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <h3 style="color: #2d3748; margin-top: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Detalhes da Operação</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #718096; font-size: 14px;">Valor enviado</td>
                  <td style="padding: 8px 0; color: #2d3748; font-weight: bold; text-align: right;">${amountFormatted}</td>
                </tr>
                <tr style="border-top: 1px solid #e2e8f0;">
                  <td style="padding: 8px 0; color: #718096; font-size: 14px;">ID da Operação</td>
                  <td style="padding: 8px 0; color: #2d3748; font-size: 12px; text-align: right; font-family: monospace;">${applicationId.slice(0, 8).toUpperCase()}</td>
                </tr>
                <tr style="border-top: 1px solid #e2e8f0;">
                  <td style="padding: 8px 0; color: #718096; font-size: 14px;">Comprovante (EndToEnd)</td>
                  <td style="padding: 8px 0; color: #2d3748; font-size: 11px; text-align: right; font-family: monospace;">${endToEndId}</td>
                </tr>
                <tr style="border-top: 1px solid #e2e8f0;">
                  <td style="padding: 8px 0; color: #718096; font-size: 14px;">Data/Hora</td>
                  <td style="padding: 8px 0; color: #2d3748; font-size: 14px; text-align: right;">${now}</td>
                </tr>
              </table>
            </div>

            <p style="color: #718096; font-size: 13px;">
              O EndToEndId acima é o comprovante único da sua transação PIX e pode ser usado
              para contestar qualquer irregularidade junto ao seu banco.
            </p>
          </div>

          <div style="background: #e2e8f0; padding: 15px; border-radius: 0 0 8px 8px; text-align: center;">
            <p style="color: #718096; font-size: 12px; margin: 0;">
              TrocoJá Serviços Financeiros • ${process.env.OPERADORA_CIDADE ?? "Brasil"}<br>
              Em caso de dúvidas, responda este e-mail.
            </p>
          </div>
        </div>
      `,
    });
  } catch (err) {
    console.error("[webhook/telegram] Email notify error:", err);
  }
}
