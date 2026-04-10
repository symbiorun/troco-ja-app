/**
 * POST /api/webhook/uazapi
 *
 * Webhook da UAZAPI — recebe mensagens dos clientes via WhatsApp
 * e orquestra o agente conversacional.
 *
 * Configuração no painel UAZAPI:
 *   URL: https://seu-dominio.vercel.app/api/webhook/uazapi
 *   Events: ["message"]
 *   excludeMessages: ["wasSentByApi"] para não fazer loop
 *
 * Verificação de segurança: checa o campo "instance" do payload
 * contra UAZAPI_INSTANCE_ID para evitar payloads de terceiros.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  parseWebhookPayload,
  sendMessage,
  sendText,
} from "@/lib/whatsapp";
import {
  runWhatsAppAgent,
  createNewSession,
  applyAgentResponse,
  PROACTIVE_MESSAGES,
} from "@/lib/ai/agents/whatsapp";
import type { WhatsAppSession, WhatsAppAgentInput } from "@/lib/ai/types";

const UAZAPI_INSTANCE_ID = process.env.UAZAPI_INSTANCE_ID ?? "";

// ─── Handler principal ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    // 1. Verifica se é a instância correta (segurança básica)
    if (
      UAZAPI_INSTANCE_ID &&
      payload?.instance &&
      payload.instance !== UAZAPI_INSTANCE_ID
    ) {
      console.warn("[webhook/uazapi] Instance mismatch:", payload.instance);
      return NextResponse.json({ ok: true }); // 200 para não gerar retry
    }

    // 2. Processa apenas eventos de mensagem recebida
    if (payload?.event && payload.event !== "message") {
      return NextResponse.json({ ok: true });
    }

    // 3. Parseia o payload
    const msg = parseWebhookPayload(payload);
    if (!msg) {
      return NextResponse.json({ ok: true });
    }

    // 4. Ignora mensagens enviadas pelo próprio bot e grupos
    if (msg.fromMe || msg.isGroup) {
      return NextResponse.json({ ok: true });
    }

    // 5. Ignora mensagens vazias
    if (!msg.text.trim()) {
      return NextResponse.json({ ok: true });
    }

    const admin = createAdminClient();

    // 6. Carrega sessão do cliente (ou cria nova)
    const { data: sessionRow } = await admin
      .from("whatsapp_sessions")
      .select("session_data")
      .eq("phone", msg.phone)
      .maybeSingle();

    const session: WhatsAppSession =
      sessionRow?.session_data ?? createNewSession(msg.phone);

    // 7. Executa o agente de IA
    const agentResult = await runWhatsAppAgent({
      session,
      incomingMessage: msg.text,
      messageType: msg.messageType as WhatsAppAgentInput["messageType"],
      mediaUrl: msg.mediaUrl,
    });

    if (!agentResult.success || !agentResult.data) {
      await sendText(msg.phone, "Tive um problema técnico. Pode tentar novamente? 🙏");
      return NextResponse.json({ ok: true });
    }

    const agentResponse = agentResult.data;

    // 8. Executa side effects (criar aplicação, atualizar status, etc.)
    for (const effect of agentResponse.sideEffects ?? []) {
      await executeSideEffect(effect, msg.phone, admin);
    }

    // 9. Envia respostas para o cliente com delay natural entre mensagens
    for (let i = 0; i < agentResponse.messages.length; i++) {
      const m = agentResponse.messages[i];
      await sendMessage(msg.phone, m.text, m.buttons);
      if (i < agentResponse.messages.length - 1) {
        await new Promise((r) => setTimeout(r, 900));
      }
    }

    // 10. Atualiza sessão no Supabase
    const updatedSession = applyAgentResponse(session, agentResponse, msg.text);
    await admin
      .from("whatsapp_sessions")
      .upsert(
        {
          phone: msg.phone,
          session_data: updatedSession,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "phone" }
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/webhook/uazapi]", error);
    return NextResponse.json({ ok: true }); // 200 para evitar retry infinito
  }
}

// ─── Side effects do agente ───────────────────────────────────────────────────

async function executeSideEffect(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  effect: any,
  phone: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
) {
  const e = effect as { type: string; [key: string]: unknown };

  switch (e.type) {
    case "CREATE_APPLICATION": {
      const data = e.payload as Record<string, unknown>;
      const { data: app } = await admin
        .from("applications")
        .insert(data)
        .select("id")
        .single();

      if (app?.id) {
        await admin.from("application_logs").insert({
          application_id: app.id,
          event_type: "application_created_via_whatsapp",
          new_status: "pending",
          metadata: { phone },
        });
        console.log("[webhook/uazapi] Aplicação criada:", app.id);
      }
      break;
    }

    case "UPDATE_STATUS": {
      await admin
        .from("applications")
        .update({
          status: e.newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", e.applicationId);

      await admin.from("application_logs").insert({
        application_id: e.applicationId,
        event_type: `status_updated_via_whatsapp`,
        new_status: e.newStatus,
        metadata: { phone },
      });
      break;
    }

    case "ESCALATE_TO_HUMAN": {
      // Marca na sessão e notifica operador
      console.log(`[webhook/uazapi] Escalada: ${phone} — ${e.reason}`);
      // TODO: notificar operador via Telegram ou email
      break;
    }

    default:
      break;
  }
}

// ─── Mensagens proativas (chamadas por outros módulos) ────────────────────────

/**
 * Envia mensagem proativa baseada em evento do sistema.
 * Ex: status da aplicação mudou → notifica o cliente.
 */
export async function sendProactiveMessage(
  phone: string,
  event: string,
  data: Record<string, string>
) {
  const messageBuilder = PROACTIVE_MESSAGES[event];
  if (!messageBuilder) return;

  const messages = messageBuilder(data);
  for (const msg of messages) {
    await sendText(phone, msg.text);
    if (messages.length > 1) {
      await new Promise((r) => setTimeout(r, 800));
    }
  }
}
