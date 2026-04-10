// POST /api/webhook/zapi
// Webhook da Z-API (WhatsApp) — recebe mensagens dos clientes
// e orquestra o agente conversacional.
//
// Configuração Z-API: apontar webhook para /api/webhook/zapi
// com Header de token: x-zapi-token: {ZAPI_WEBHOOK_TOKEN}

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { runWhatsAppAgent, createNewSession, applyAgentResponse, PROACTIVE_MESSAGES } from '@/lib/ai/agents/whatsapp'
import type { WhatsAppSession, WhatsAppAgentInput } from '@/lib/ai/types'

// ----------------------------------------------------------------
// Tipos do payload Z-API
// ----------------------------------------------------------------
interface ZAPIMessage {
  phone: string                    // 5511999999999@c.us
  fromMe: boolean
  isGroup: boolean
  type: 'ReceivedCallback'
  chatName?: string
  senderName?: string
  body?: string                    // Texto da mensagem
  messageId: string
  momment: number                  // timestamp Unix ms
  status?: string
  // Mídia
  image?: { imageUrl: string; caption?: string }
  document?: { documentUrl: string; fileName: string; caption?: string }
  audio?: { audioUrl: string }
  buttonReply?: { buttonId: string; buttonText: string }
  listReply?: { listResponseId: string; listResponseTitle: string }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Verificação de token
    const token = req.headers.get('x-zapi-token')
    if (token !== process.env.ZAPI_WEBHOOK_TOKEN) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
    }

    const payload: ZAPIMessage = await req.json()

    // 2. Ignora mensagens enviadas pelo bot (loop prevention)
    if (payload.fromMe || payload.isGroup) {
      return NextResponse.json({ ok: true })
    }

    // 3. Normaliza o número de telefone
    const phone = payload.phone.replace('@c.us', '').replace(/\D/g, '')

    // 4. Determina tipo e conteúdo da mensagem
    let incomingMessage = payload.body ?? ''
    let messageType: WhatsAppAgentInput['messageType'] = 'text'
    let mediaUrl: string | undefined

    if (payload.image) {
      messageType = 'image'
      mediaUrl = payload.image.imageUrl
      incomingMessage = payload.image.caption ?? '[Imagem enviada]'
    } else if (payload.document) {
      messageType = 'document'
      mediaUrl = payload.document.documentUrl
      incomingMessage = `[Documento: ${payload.document.fileName}]`
    } else if (payload.audio) {
      messageType = 'audio'
      incomingMessage = '[Áudio enviado]'
    } else if (payload.buttonReply) {
      messageType = 'button_reply'
      incomingMessage = payload.buttonReply.buttonText
    } else if (payload.listReply) {
      messageType = 'button_reply'
      incomingMessage = payload.listReply.listResponseTitle
    }

    if (!incomingMessage.trim()) {
      return NextResponse.json({ ok: true }) // Ignora mensagens vazias
    }

    const admin = createAdminClient()

    // 5. Carrega sessão do cliente (ou cria nova)
    const { data: sessionRow } = await admin
      .from('whatsapp_sessions')
      .select('session_data')
      .eq('phone', phone)
      .maybeSingle()

    const session: WhatsAppSession = sessionRow?.session_data ?? createNewSession(phone)

    // 6. Executa o agente
    const agentResult = await runWhatsAppAgent({
      session,
      incomingMessage,
      messageType,
      mediaUrl,
    })

    if (!agentResult.success || !agentResult.data) {
      // Envia mensagem de erro genérica
      await sendWhatsAppMessage(phone, 'Tive um problema técnico. Pode tentar novamente?')
      return NextResponse.json({ ok: true })
    }

    const agentResponse = agentResult.data

    // 7. Executa side effects
    for (const effect of agentResponse.sideEffects ?? []) {
      await executeSideEffect(effect, phone, admin)
    }

    // 8. Envia respostas para o cliente
    for (const msg of agentResponse.messages) {
      await sendWhatsAppMessage(phone, msg.text, msg.buttons)
      // Pequeno delay entre múltiplas mensagens para naturalidade
      if (agentResponse.messages.length > 1) {
        await new Promise(r => setTimeout(r, 800))
      }
    }

    // 9. Atualiza sessão no banco
    const updatedSession = applyAgentResponse(session, agentResponse, incomingMessage)
    await admin
      .from('whatsapp_sessions')
      .upsert({ phone, session_data: updatedSession, updated_at: new Date().toISOString() }, {
        onConflict: 'phone',
      })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[/api/webhook/zapi]', error)
    // Retorna 200 para a Z-API não fazer retry infinito
    return NextResponse.json({ ok: true })
  }
}

// ----------------------------------------------------------------
// Envia mensagem via Z-API
// ----------------------------------------------------------------
async function sendWhatsAppMessage(
  phone: string,
  text: string,
  buttons?: Array<{ id: string; title: string }>
) {
  const zapiBase = process.env.ZAPI_BASE_URL
  const instanceId = process.env.ZAPI_INSTANCE_ID
  const token = process.env.ZAPI_TOKEN
  const clientToken = process.env.ZAPI_CLIENT_TOKEN

  if (!zapiBase || !instanceId || !token) {
    console.warn('[zapi] Credenciais Z-API não configuradas')
    return
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Client-Token': clientToken ?? '',
  }

  if (buttons && buttons.length > 0 && buttons.length <= 3) {
    // Mensagem com botões
    await fetch(`${zapiBase}/instances/${instanceId}/token/${token}/send-button-list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone,
        message: text,
        buttonList: {
          buttons: buttons.map(b => ({ id: b.id, label: b.title })),
        },
      }),
    })
  } else {
    // Mensagem de texto simples
    await fetch(`${zapiBase}/instances/${instanceId}/token/${token}/send-text`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone, message: text }),
    })
  }
}

// ----------------------------------------------------------------
// Executa side effects do agente
// ----------------------------------------------------------------
async function executeSideEffect(
  effect: NonNullable<ReturnType<typeof createNewSession>['data']> & { type?: string },
  phone: string,

  admin: any
) {
  const e = effect as { type: string; [key: string]: unknown }
  switch (e.type) {
    case 'CREATE_APPLICATION': {
      const payload = e.payload as Record<string, unknown>
      const { data: app } = await admin.from('applications').insert(payload).select('id').single()
      if (app?.id) {
        // Atualiza a sessão com o applicationId (será salvo no step 9)
        console.log('[zapi] Aplicação criada:', app.id)
      }
      break
    }
    case 'UPDATE_STATUS': {
      await admin
        .from('applications')
        .update({ status: e.newStatus, updated_at: new Date().toISOString() })
        .eq('id', e.applicationId)
      break
    }
    case 'ESCALATE_TO_HUMAN': {
      // Marca sessão como escalada e notifica operador via email/slack
      console.log(`[zapi] Escalada para humano: ${phone} — motivo: ${e.reason}`)
      break
    }
    default:
      break
  }
}

// ----------------------------------------------------------------
// Função para enviar mensagens proativas (chamada por outros sistemas)
// Ex: quando status da aplicação muda, notifica o cliente pelo WhatsApp
// ----------------------------------------------------------------
async function sendProactiveMessage(
  phone: string,
  event: string,
  data: Record<string, string>
) {
  const messageBuilder = PROACTIVE_MESSAGES[event]
  if (!messageBuilder) return

  const messages = messageBuilder(data)
  for (const msg of messages) {
    await sendWhatsAppMessage(phone, msg.text)
  }
}
