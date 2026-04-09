// ============================================================
// TrocoJá — Agente Conversacional WhatsApp
//
// Responsabilidade: conduzir o cliente desde a primeira
// mensagem no WhatsApp até a conclusão da operação, gerenciando
// estado de sessão e disparando side effects (criar aplicação,
// enviar links, atualizar status).
//
// Modelo: google/gemini-2.5-flash-preview
// Motivo: volume alto, latência crítica (< 2s para boa UX),
// excelente em PT-BR, segue fluxos estruturados com fidelidade.
// Custo por mensagem ≈ $0,0001 — totalmente viável em volume.
// ============================================================

import { callAI, ORMessage } from '../client'
import type {
  WhatsAppSession,
  WhatsAppAgentInput,
  WhatsAppAgentResponse,
  WhatsAppSessionState,
  WhatsAppOutboundMessage,
  WhatsAppSideEffect,
  AIResult,
} from '../types'

// ----------------------------------------------------------------
// System Prompt
// ----------------------------------------------------------------
const WA_SYSTEM_PROMPT = `Você é o assistente virtual do TrocoJá, uma fintech brasileira de cash-out (você passa o cartão e recebe PIX na hora).

SEU PAPEL:
- Conduzir clientes pelo fluxo de contratação via WhatsApp
- Tom: amigável, direto, profissional mas não formal demais — como um atendente treinado
- Linguagem: português brasileiro coloquial mas correto, sem gírias excessivas
- Mensagens curtas (máx 3 parágrafos por mensagem), fáceis de ler no celular
- Use emojis com moderação (1-2 por mensagem, apenas quando natural)

FLUXO PRINCIPAL:
1. Saudação → perguntar quanto quer receber (valor em PIX)
2. Perguntar tipo de pagamento (débito, crédito à vista, crédito parcelado)
3. Mostrar simulação (valor no cartão, taxa)
4. Se cliente confirmar: coletar nome, CPF, email, telefone, chave PIX
5. Enviar link para upload de documentos
6. Aguardar aprovação, enviar link do contrato
7. Confirmar pagamento, informar que PIX será enviado

REGRAS:
- NUNCA prometa valores ou taxas específicos sem ter feito simulação real
- NUNCA processe dados sem consentimento explícito
- Se cliente digitar valor absurdo (< R$50 ou > R$5.000), explique os limites
- Se cliente pedir algo fora do escopo (empréstimo, transferência, etc), explique o que o TrocoJá faz
- Perguntas sobre suporte: ofereça escalada para atendente humano
- Se cliente demonstrar frustração 2x: ofereça escalada humana

SAÍDA: Retorne EXCLUSIVAMENTE JSON válido com a estrutura solicitada. Sem markdown, sem texto fora do JSON.`

// ----------------------------------------------------------------
// Função principal
// ----------------------------------------------------------------
export async function runWhatsAppAgent(
  input: WhatsAppAgentInput
): Promise<AIResult<WhatsAppAgentResponse>> {
  const start = Date.now()

  try {
    const contextPrompt = buildContextPrompt(input)
    const messages: ORMessage[] = [
      { role: 'system', content: WA_SYSTEM_PROMPT },
      { role: 'user', content: contextPrompt },
    ]

    const { data, model, usage, latencyMs } = await callAI<WhatsAppAgentResponse>(
      'whatsapp_conversation',
      messages,
      { jsonMode: true, overrideTemperature: 0.4 }
    )

    return {
      success: true,
      data,
      meta: { model, latencyMs, usage },
    }
  } catch (error) {
    return {
      success: true, // Retorna true mesmo com erro — temos fallback
      data: buildFallbackResponse(input.session.state),
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      meta: {
        model: 'google/gemini-2.5-flash-preview',
        latencyMs: Date.now() - start,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      },
    }
  }
}

// ----------------------------------------------------------------
// Contexto completo para o modelo
// ----------------------------------------------------------------
function buildContextPrompt(input: WhatsAppAgentInput): string {
  const { session, incomingMessage, messageType } = input
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://trocoja.com.br'

  const historyText = session.conversationHistory
    .slice(-10) // Últimas 10 mensagens para não exceder contexto
    .map(m => `${m.role === 'user' ? 'CLIENTE' : 'ASSISTENTE'}: ${m.content}`)
    .join('\n')

  return `=== ESTADO ATUAL DA SESSÃO ===
Estado: ${session.state}
Dados coletados: ${JSON.stringify(session.data, null, 2)}
Application ID: ${session.applicationId ?? 'não criada ainda'}
Tentativas neste estado: ${session.attemptCount}

=== HISTÓRICO RECENTE ===
${historyText || '(início da conversa)'}

=== MENSAGEM DO CLIENTE AGORA ===
Tipo: ${messageType}
Conteúdo: "${incomingMessage}"

=== CONTEXTO DO SISTEMA ===
App URL: ${appUrl}
Limites: PIX mínimo R$ 50,00 | PIX máximo R$ 5.000,00
Canais: Débito (D0, taxa ~2%) | Crédito à vista (D0, taxa ~5%) | Crédito parcelado (D30, taxa ~22%)

=== INSTRUÇÃO ===
Com base no estado atual e na mensagem do cliente, decida a próxima resposta e o próximo estado.

Retorne JSON com esta estrutura EXATA:
{
  "messages": [
    {
      "type": "text",
      "text": "mensagem principal"
    }
  ],
  "nextState": "ESTADO_PRÓXIMO",
  "sessionUpdate": {
    "campo": "valor"
  },
  "sideEffects": []
}

Estados válidos: ${VALID_STATES.join(' | ')}

Side effects disponíveis:
- { "type": "CREATE_APPLICATION", "payload": {...dados da aplicação} }
- { "type": "SEND_LINK", "url": "https://..." }
- { "type": "UPDATE_STATUS", "applicationId": "...", "newStatus": "..." }
- { "type": "ESCALATE_TO_HUMAN", "reason": "..." }
- { "type": "STORE_SESSION", "session": {...} }

Para botões de resposta rápida, use:
{ "type": "text", "text": "mensagem", "buttons": [{"id": "id1", "title": "Débito"}, ...] }
(máx 3 botões por mensagem)`
}

const VALID_STATES: WhatsAppSessionState[] = [
  'GREETING',
  'COLLECTING_PIX_AMOUNT',
  'COLLECTING_PAYMENT_TYPE',
  'SHOWING_SIMULATION',
  'SIMULATION_CONFIRMED',
  'COLLECTING_NAME',
  'COLLECTING_CPF',
  'COLLECTING_EMAIL',
  'COLLECTING_PHONE',
  'COLLECTING_PIX_KEY',
  'REGISTRATION_COMPLETE',
  'WAITING_DOCS_UPLOAD',
  'DOCS_UNDER_REVIEW',
  'CONTRACT_SENT',
  'CONTRACT_SIGNED',
  'PAYMENT_INSTRUCTIONS',
  'PAYMENT_CONFIRMED',
  'PIX_PROCESSING',
  'COMPLETED',
  'REJECTED',
  'HUMAN_ESCALATION',
  'SUPPORT',
]

// ----------------------------------------------------------------
// Sessão inicial para novos clientes
// ----------------------------------------------------------------
export function createNewSession(phone: string): WhatsAppSession {
  return {
    sessionId: phone,
    state: 'GREETING',
    data: {},
    conversationHistory: [],
    lastActivity: new Date().toISOString(),
    attemptCount: 0,
  }
}

// ----------------------------------------------------------------
// Atualiza sessão com o resultado do agente
// ----------------------------------------------------------------
export function applyAgentResponse(
  session: WhatsAppSession,
  agentResponse: WhatsAppAgentResponse,
  incomingMessage: string
): WhatsAppSession {
  const updated: WhatsAppSession = {
    ...session,
    state: agentResponse.nextState,
    data: { ...session.data, ...agentResponse.sessionUpdate },
    lastActivity: new Date().toISOString(),
    attemptCount: agentResponse.nextState === session.state ? session.attemptCount + 1 : 0,
  }

  // Adiciona ao histórico
  updated.conversationHistory = [
    ...session.conversationHistory,
    { role: 'user', content: incomingMessage, ts: new Date().toISOString() },
    {
      role: 'assistant',
      content: agentResponse.messages.map(m => m.text).join(' | '),
      ts: new Date().toISOString(),
    },
  ].slice(-20) // Mantém apenas últimas 20 mensagens

  return updated
}

// ----------------------------------------------------------------
// Mensagens proativas (enviadas por trigger de status, não por LLM)
// ----------------------------------------------------------------
export const PROACTIVE_MESSAGES: Partial<Record<string, (data: Record<string, string>) => WhatsAppOutboundMessage[]>> = {
  docs_pending: (data) => [{
    type: 'text',
    text: `📋 Seus documentos foram recebidos, ${data.name ?? 'cliente'}! Estamos analisando. Em breve você receberá o contrato para assinar.`,
  }],
  contract_pending: (data) => [{
    type: 'text',
    text: `📄 Seu contrato está pronto! Acesse o link abaixo para ler e assinar digitalmente:\n${data.contractLink ?? process.env.NEXT_PUBLIC_APP_URL + '/contrato'}`,
  }],
  payment_confirmed: (data) => [{
    type: 'text',
    text: `✅ Pagamento confirmado! O PIX de *R$ ${data.pixAmount ?? '---'}* será enviado para ${data.pixKey ?? 'sua chave PIX'} em instantes. 🎉`,
  }],
  pix_sent: (data) => [{
    type: 'text',
    text: `💸 PIX enviado! R$ ${data.pixAmount ?? '---'} enviado para ${data.pixKey ?? 'sua chave'}. Verifique seu banco. Qualquer dúvida, é só chamar aqui!`,
  }],
  rejected: () => [{
    type: 'text',
    text: `⚠️ Infelizmente sua solicitação não pôde ser aprovada neste momento. Se tiver dúvidas, entre em contato com nossa equipe.`,
  }],
}

// ----------------------------------------------------------------
// Fallback quando o LLM falha
// ----------------------------------------------------------------
function buildFallbackResponse(currentState: WhatsAppSessionState): WhatsAppAgentResponse {
  return {
    messages: [{
      type: 'text',
      text: 'Desculpe, tive uma instabilidade. Pode repetir sua mensagem?',
    }],
    nextState: currentState,
    sessionUpdate: {},
    sideEffects: [],
  }
}
