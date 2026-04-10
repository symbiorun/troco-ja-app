// ============================================================
// TrocoJá — OpenRouter Client
// Cliente centralizado para chamadas aos modelos de IA.
//
// DECISÃO DE MODELOS (definitiva):
//
//  kyc_full_analysis      → google/gemini-2.5-pro-preview
//    Melhor visão de mercado para documentos brasileiros.
//    Extrai texto de RG/CNH com alta precisão, compara faces,
//    entende layout brasileiro. Custo justificado: cada operação
//    aprovada errada = prejuízo real.
//
//  risk_score             → anthropic/claude-sonnet-4
//    Melhor raciocínio lógico para análise multifatorial.
//    Fraude é o maior risco do negócio — não é lugar para economizar.
//
//  whatsapp_conversation  → google/gemini-2.5-flash-preview
//    Volume alto, respostas precisam ser < 2s, excelente em PT-BR,
//    segue fluxos estruturados com fidelidade.
//
//  staff_query            → google/gemini-2.5-flash-preview
//    Ferramenta interna, boa relação custo/performance.
// ============================================================

import { AITask } from './types'

interface ModelConfig {
  model: string
  maxTokens: number
  temperature: number
  description: string
}

// ----------------------------------------------------------------
// Tabela de modelos por task
// ----------------------------------------------------------------
const MODEL_TABLE: Record<AITask, ModelConfig> = {
  kyc_full_analysis: {
    model: 'google/gemini-2.5-pro-preview',
    maxTokens: 4096,
    temperature: 0.05,  // Determinístico — extração de dados não pode "ser criativo"
    description: 'KYC completo: extração de documento + match facial + consistência',
  },
  kyc_document_extract: {
    model: 'google/gemini-2.5-pro-preview',
    maxTokens: 2048,
    temperature: 0.05,
    description: 'Extração de dados de documento RG/CNH',
  },
  kyc_face_match: {
    model: 'google/gemini-2.5-pro-preview',
    maxTokens: 1024,
    temperature: 0.05,
    description: 'Comparação facial documento vs selfie',
  },
  risk_score: {
    model: 'anthropic/claude-sonnet-4',
    maxTokens: 2048,
    temperature: 0.1,   // Levemente criativo para raciocínio, mas ainda conservador
    description: 'Análise de risco / anti-fraude com scoring multidimensional',
  },
  whatsapp_conversation: {
    model: 'google/gemini-2.5-flash-preview',
    maxTokens: 1024,
    temperature: 0.4,   // Mais natural para conversação
    description: 'Agente conversacional do WhatsApp',
  },
  staff_query: {
    model: 'google/gemini-2.5-flash-preview',
    maxTokens: 2048,
    temperature: 0.2,
    description: 'Copilot do painel staff',
  },
}

// ----------------------------------------------------------------
// Tipos da API OpenRouter
// ----------------------------------------------------------------
export type ORContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }

export interface ORMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ORContentPart[]
}

interface ORResponse {
  id: string
  model: string
  choices: Array<{
    message: { role: string; content: string }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// Tabela de custo aproximado por 1M tokens (input / output)
// Atualizar conforme OpenRouter pricing mudar
const COST_PER_MILLION: Record<string, { input: number; output: number }> = {
  'google/gemini-2.5-pro-preview':   { input: 1.25,  output: 10.0  },
  'google/gemini-2.5-flash-preview': { input: 0.15,  output: 0.60  },
  'anthropic/claude-sonnet-4':       { input: 3.00,  output: 15.00 },
}

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = COST_PER_MILLION[model]
  if (!pricing) return 0
  return (promptTokens / 1_000_000) * pricing.input
       + (completionTokens / 1_000_000) * pricing.output
}

// ----------------------------------------------------------------
// Função principal de chamada
// ----------------------------------------------------------------
export async function callAI<T = string>(
  task: AITask,
  messages: ORMessage[],
  options?: {
    jsonMode?: boolean
    overrideModel?: string
    overrideMaxTokens?: number
    overrideTemperature?: number
  }
): Promise<{
  data: T
  model: string
  usage: { promptTokens: number; completionTokens: number; totalTokens: number; estimatedCostUsd: number }
  latencyMs: number
}> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY não configurada')

  const config = MODEL_TABLE[task]
  const model = options?.overrideModel ?? config.model
  const maxTokens = options?.overrideMaxTokens ?? config.maxTokens
  const temperature = options?.overrideTemperature ?? config.temperature

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
  }

  if (options?.jsonMode) {
    body.response_format = { type: 'json_object' }
  }

  const start = Date.now()

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://trocoja.com.br',
      'X-Title': 'TrocoJá',
    },
    body: JSON.stringify(body),
  })

  const latencyMs = Date.now() - start

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`OpenRouter ${response.status}: ${errText}`)
  }

  const result: ORResponse = await response.json()
  const content = result.choices[0]?.message?.content ?? ''

  let data: T
  if (options?.jsonMode) {
    try {
      data = JSON.parse(content) as T
    } catch {
      // Tenta extrair JSON de um bloco markdown
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]+?)```/)
      if (jsonMatch) {
        data = JSON.parse(jsonMatch[1]) as T
      } else {
        throw new Error(`Falha ao parsear JSON do modelo: ${content.slice(0, 200)}`)
      }
    }
  } else {
    data = content as T
  }

  const usage = {
    promptTokens: result.usage.prompt_tokens,
    completionTokens: result.usage.completion_tokens,
    totalTokens: result.usage.total_tokens,
    estimatedCostUsd: estimateCost(model, result.usage.prompt_tokens, result.usage.completion_tokens),
  }

  return { data, model, usage, latencyMs }
}

// ----------------------------------------------------------------
// Helper: converte buffer/URL de imagem para parte de mensagem
// ----------------------------------------------------------------
export function imageUrlPart(url: string, detail: 'low' | 'high' | 'auto' = 'high'): ORContentPart {
  return { type: 'image_url', image_url: { url, detail } }
}

export function bufferToDataUrl(buffer: Buffer, mimeType: 'image/jpeg' | 'image/png' | 'image/webp'): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

export function textPart(text: string): ORContentPart {
  return { type: 'text', text }
}

// ----------------------------------------------------------------
// Helper: loga uso de tokens para o Supabase (audit_logs)
// Para rastreamento de custo por operação
// ----------------------------------------------------------------
export function buildAIAuditEntry(
  task: AITask,
  applicationId: string | null,
  usage: { estimatedCostUsd?: number; totalTokens: number },
  model: string,
  latencyMs: number
) {
  return {
    event_type: `ai_${task}`,
    entity_id: applicationId,
    metadata: {
      model,
      totalTokens: usage.totalTokens,
      estimatedCostUsd: usage.estimatedCostUsd,
      latencyMs,
    },
  }
}
