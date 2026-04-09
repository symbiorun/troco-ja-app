// ============================================================
// TrocoJá — Agente de Análise de Risco / Anti-Fraude
//
// Responsabilidade: receber o contexto completo de uma operação
// (dados do cliente, valores, comportamento, KYC) e emitir um
// score de risco multidimensional com recomendação de ação.
//
// Modelo: anthropic/claude-sonnet-4
// Motivo: fraude é o maior risco financeiro do negócio.
// O Sonnet tem o melhor raciocínio de cadeia causal para
// detectar padrões suspeitos que modelos menores perdem.
// Chamado 1x por operação → custo absolutamente justificado.
// ============================================================

import { callAI, ORMessage } from '../client'
import type { RiskInput, RiskScoreResult, RiskFlag, AIResult } from '../types'

// ----------------------------------------------------------------
// System Prompt
// ----------------------------------------------------------------
const RISK_SYSTEM_PROMPT = `Você é o sistema de análise de risco e anti-fraude da TrocoJá, uma fintech brasileira.

O TrocoJá realiza operações de cash-out: o cliente passa o cartão (débito/crédito) e recebe PIX imediato.
Este modelo de negócio tem riscos específicos:
- Chargeback: cliente passa cartão, recebe PIX, depois contesta o pagamento no banco
- Fraude de identidade: usa dados/cartão de terceiros
- Fraude de PIX: chave PIX pertence a terceiro (laranja)
- Velocity fraud: múltiplas operações em sequência com dados diferentes
- Mule accounts: conta receptora de valores ilícitos

FATORES DE RISCO (use todos):
1. Valor da operação vs perfil do cliente (primeira operação com valor alto = risco)
2. Horário (madrugada = maior risco, especialmente 0h-5h)
3. Histórico (rejeições anteriores são sinal forte de tentativas fraudulentas)
4. KYC (cliente com KYC pendente ou rejeitado = risco alto)
5. Consistência da chave PIX (CPF da chave deve bater com CPF cadastrado)
6. Canal (online_link tem mais chargebacks que machine_delivery)
7. Padrões comportamentais (múltiplas tentativas, mudanças de dados)

SCORING:
- 0-25: Baixo risco — aprovação automática recomendada
- 26-50: Médio risco — aprovação com atenção
- 51-75: Alto risco — revisão manual obrigatória
- 76-100: Crítico — rejeição automática recomendada

SAÍDA: JSON válido apenas, sem markdown.`

// ----------------------------------------------------------------
// Função principal
// ----------------------------------------------------------------
export async function runRiskAnalysis(input: RiskInput): Promise<AIResult<RiskScoreResult>> {
  const start = Date.now()

  try {
    // Pré-checks de regras estáticas (sem LLM — rápido e gratuito)
    const staticFlags = runStaticRules(input)
    if (staticFlags.autoReject) {
      return buildStaticRejectResult(staticFlags, start)
    }

    const messages: ORMessage[] = [
      { role: 'system', content: RISK_SYSTEM_PROMPT },
      {
        role: 'user',
        content: buildRiskPrompt(input, staticFlags.flags),
      },
    ]

    const { data, model, usage, latencyMs } = await callAI<RiskScoreResult>(
      'risk_score',
      messages,
      { jsonMode: true }
    )

    // Merge das flags estáticas com as do modelo
    const merged: RiskScoreResult = {
      ...data,
      flags: [...new Set([...staticFlags.flags, ...(data.flags ?? [])])],
    }

    // Aplica regras de negócio sobre o score
    const final = applyBusinessRules(merged, input)

    return {
      success: true,
      data: final,
      meta: { model, latencyMs, usage },
    }
  } catch (error) {
    // Em caso de erro no LLM, retorna MANUAL_REVIEW conservador
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro na análise de risco',
      data: buildFallbackRiskResult(),
      meta: {
        model: 'anthropic/claude-sonnet-4',
        latencyMs: Date.now() - start,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      },
    }
  }
}

// ----------------------------------------------------------------
// Regras estáticas (executadas ANTES do LLM)
// Sem custo, rápidas, para casos óbvios
// ----------------------------------------------------------------
interface StaticRuleResult {
  flags: RiskFlag[]
  autoReject: boolean
  autoRejectReason?: string
}

function runStaticRules(input: RiskInput): StaticRuleResult {
  const flags: RiskFlag[] = []
  let autoReject = false
  let autoRejectReason: string | undefined

  // CPF com todos dígitos iguais (inválido)
  const cpfDigits = input.customerCpf.replace(/\D/g, '')
  if (/^(.)\1+$/.test(cpfDigits)) {
    flags.push('CPF_PATTERN_SUSPICIOUS')
    autoReject = true
    autoRejectReason = 'CPF com padrão inválido (todos dígitos iguais)'
  }

  // KYC rejeitado = não passa
  if (input.kycRecommendation === 'REJECT') {
    autoReject = true
    autoRejectReason = 'KYC reprovado pelo sistema de verificação de identidade'
  }

  // Muitas rejeições anteriores
  if (input.previousRejections >= 3) {
    flags.push('REPEATED_REJECTIONS')
    if (input.previousRejections >= 5) {
      autoReject = true
      autoRejectReason = 'Limite de rejeições anteriores excedido (≥5)'
    }
  }

  // Horário de madrugada
  if (input.timeOfDay >= 0 && input.timeOfDay <= 5) {
    flags.push('UNUSUAL_HOURS')
  }

  // Muitas tentativas no mesmo dia
  if (input.previousApplicationsCount >= 3) {
    flags.push('MULTIPLE_ATTEMPTS_24H')
  }

  // Email descartável (padrões comuns)
  const disposableDomains = ['mailinator.com', 'tempmail.com', 'throwaway.email', '10minutemail.com', 'guerrillamail.com', 'yopmail.com']
  const emailDomain = input.customerEmail.split('@')[1]?.toLowerCase()
  if (emailDomain && disposableDomains.includes(emailDomain)) {
    flags.push('EMAIL_DISPOSABLE')
    autoReject = true
    autoRejectReason = 'Email descartável detectado'
  }

  // Primeira transação com valor alto (> R$1000)
  if (input.previousApplicationsCount === 0 && input.pixAmount > 1000) {
    flags.push('FIRST_TRANSACTION')
    flags.push('HIGH_VALUE_TRANSACTION')
  }

  // PIX key tipo aleatório com valor alto é OK, mas CPF da chave
  // diferente do CPF cadastrado (se o tipo for CPF)
  if (input.pixKeyType === 'cpf') {
    const pixCpf = input.pixKey.replace(/\D/g, '')
    const customerCpf = input.customerCpf.replace(/\D/g, '')
    if (pixCpf !== customerCpf) {
      flags.push('PIX_KEY_DIFFERENT_CPF')
    }
  }

  return { flags, autoReject, autoRejectReason }
}

// ----------------------------------------------------------------
// Constrói o prompt textual para o Claude
// ----------------------------------------------------------------
function buildRiskPrompt(input: RiskInput, staticFlags: RiskFlag[]): string {
  const channel = input.channel === 'online_link' ? 'Online (link de pagamento Asaas)' : 'Presencial (maquininha Mercado Pago)'
  const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

  return `Analise o risco desta operação de cash-out (cartão → PIX) e retorne um JSON de scoring.

=== DADOS DA OPERAÇÃO ===
ID: ${input.applicationId}
Canal: ${channel}
Valor PIX (cliente recebe): R$ ${input.pixAmount.toFixed(2)}
Valor no cartão (cliente paga): R$ ${input.cardTotal.toFixed(2)}
Horário: ${input.timeOfDay}h, ${dayNames[input.dayOfWeek]}

=== DADOS DO CLIENTE ===
Nome: ${input.customerName}
CPF: ${input.customerCpf}
Email: ${input.customerEmail}
Telefone: ${input.customerPhone}
Chave PIX: ${input.pixKey} (tipo: ${input.pixKeyType})

=== CONTEXTO HISTÓRICO ===
Operações anteriores: ${input.previousApplicationsCount}
Rejeições anteriores: ${input.previousRejections}
KYC: ${input.kycRecommendation}
IP: ${input.ipAddress ?? 'não disponível'}

=== FLAGS IDENTIFICADAS (regras estáticas) ===
${staticFlags.length > 0 ? staticFlags.join(', ') : 'Nenhuma flag de regra estática'}

=== RESPOSTA ESPERADA (JSON) ===
{
  "score": 0-100,
  "level": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL",
  "flags": ["..."],
  "recommendation": "APPROVE"|"MANUAL_REVIEW"|"REJECT",
  "autoActionable": boolean,
  "reasoning": "2-4 frases em português explicando a decisão",
  "breakdown": {
    "identity": 0-100,
    "behavior": 0-100,
    "value": 0-100,
    "channel": 0-100
  }
}`
}

// ----------------------------------------------------------------
// Regras de negócio aplicadas sobre o score do modelo
// ----------------------------------------------------------------
function applyBusinessRules(result: RiskScoreResult, input: RiskInput): RiskScoreResult {
  const r = { ...result }

  // KYC pendente = sempre MANUAL_REVIEW no mínimo
  if (input.kycRecommendation === 'PENDING' && r.recommendation === 'APPROVE') {
    r.recommendation = 'MANUAL_REVIEW'
    r.autoActionable = false
  }

  // Score > 75 = nunca APPROVE
  if (r.score > 75 && r.recommendation === 'APPROVE') {
    r.recommendation = 'MANUAL_REVIEW'
  }

  // Score > 90 = sempre REJECT
  if (r.score > 90) {
    r.recommendation = 'REJECT'
    r.autoActionable = true
  }

  // Score < 20 + sem flags críticas = autoActionable APPROVE
  const criticalFlags: RiskFlag[] = ['REPEATED_REJECTIONS', 'CPF_PATTERN_SUSPICIOUS', 'EMAIL_DISPOSABLE', 'PIX_KEY_DIFFERENT_CPF']
  const hasCritical = r.flags.some(f => criticalFlags.includes(f))
  if (r.score < 20 && !hasCritical && r.recommendation === 'APPROVE') {
    r.autoActionable = true
  }

  return r
}

// ----------------------------------------------------------------
// Resultado de rejeição automática por regra estática
// ----------------------------------------------------------------
function buildStaticRejectResult(
  staticFlags: StaticRuleResult,
  start: number
): AIResult<RiskScoreResult> {
  return {
    success: true,
    data: {
      score: 100,
      level: 'CRITICAL',
      flags: staticFlags.flags,
      recommendation: 'REJECT',
      autoActionable: true,
      reasoning: staticFlags.autoRejectReason ?? 'Regra estática de rejeição automática acionada',
      breakdown: { identity: 100, behavior: 100, value: 50, channel: 50 },
    },
    meta: {
      model: 'static-rules',
      latencyMs: Date.now() - start,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
    },
  }
}

// ----------------------------------------------------------------
// Fallback conservador em caso de erro do LLM
// ----------------------------------------------------------------
function buildFallbackRiskResult(): RiskScoreResult {
  return {
    score: 50,
    level: 'MEDIUM',
    flags: [],
    recommendation: 'MANUAL_REVIEW',
    autoActionable: false,
    reasoning: 'Análise automática indisponível. Revisão manual obrigatória por segurança.',
    breakdown: { identity: 50, behavior: 50, value: 50, channel: 50 },
  }
}

// ----------------------------------------------------------------
// Helper de label para score
// ----------------------------------------------------------------
export function riskLevelLabel(level: RiskScoreResult['level']): string {
  return {
    LOW: 'Baixo',
    MEDIUM: 'Médio',
    HIGH: 'Alto',
    CRITICAL: 'Crítico',
  }[level]
}

export function riskLevelColor(level: RiskScoreResult['level']): string {
  return {
    LOW: '#22c55e',
    MEDIUM: '#f59e0b',
    HIGH: '#ef4444',
    CRITICAL: '#7f1d1d',
  }[level]
}
