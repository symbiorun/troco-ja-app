// ============================================================
// TrocoJá — Agente Copilot do Painel Staff
//
// Responsabilidade: responder perguntas em linguagem natural
// dos operadores/admins sobre os dados do negócio, sem que
// precisem escrever SQL ou navegar por múltiplos filtros.
//
// Modelo: google/gemini-2.5-flash-preview
// Motivo: ferramenta interna, latência importa para UX,
// custo secundário. Flash tem excelente NL→estrutura.
// ============================================================

import { callAI, ORMessage } from '../client'
import type { StaffQuery, StaffQueryResult, AIResult } from '../types'
import { createAdminClient } from '@/lib/supabase/server'

// ----------------------------------------------------------------
// System Prompt
// ----------------------------------------------------------------
const COPILOT_SYSTEM_PROMPT = `Você é o assistente de dados do painel de operadores do TrocoJá.

Você tem acesso ao schema do banco de dados Supabase (PostgreSQL) e pode ajudar operadores a:
- Consultar dados de operações, clientes e pagamentos
- Calcular métricas de negócio (receita, volume, taxa de aprovação)
- Identificar anomalias e tendências
- Responder perguntas sobre o status de aplicações específicas

SCHEMA RELEVANTE:
- applications: id, status, pix_amount, card_total, fee_pct, channel, customer_name, customer_cpf,
  customer_email, customer_phone, pix_key, pix_key_type, operator_id, created_at, updated_at
- payments: id, application_id, status, amount, checkout_url, paid_at, external_id (Asaas)
- profiles: id, full_name, role (client|operator|admin), email
- application_logs: id, application_id, event_type, previous_status, new_status, changed_by, created_at
- admin_configs: key, value (taxas e configurações do sistema)
- audit_logs: id, event_type, entity_id, metadata, created_at

FUNÇÕES DISPONÍVEIS:
Você pode sugerir queries SQL (PostgreSQL) que serão executadas no Supabase.
Use funções de agregação, DATE_TRUNC, EXTRACT, etc conforme necessário.

REGRAS:
- Nunca sugira queries que modifiquem dados (INSERT, UPDATE, DELETE)
- Respeite o role do operador: operators veem apenas suas aplicações (operator_id = seu ID)
- Admins veem tudo
- Seja específico e direto nas respostas
- Se não puder responder, explique o motivo

SAÍDA: JSON válido apenas.`

// ----------------------------------------------------------------
// Exemplos de perguntas e queries esperadas (few-shot)
// ----------------------------------------------------------------
const FEW_SHOT_EXAMPLES = `
Exemplos de consultas e respostas:

Pergunta: "Quantas operações aprovei hoje?"
SQL: SELECT COUNT(*) FROM applications WHERE operator_id = '{operatorId}' AND DATE(created_at) = CURRENT_DATE AND status IN ('completed','pix_sent','pix_ready_to_send')

Pergunta: "Qual meu volume total este mês?"
SQL: SELECT SUM(pix_amount), SUM(card_total - pix_amount) as lucro FROM applications WHERE operator_id = '{operatorId}' AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE) AND status = 'completed'

Pergunta: "Quais operações estão pendentes de revisão de PIX?"
SQL: SELECT id, customer_name, pix_amount, pix_key, created_at FROM applications WHERE operator_id = '{operatorId}' AND status = 'pix_divergence_review' ORDER BY created_at ASC

Pergunta: "Taxa de aprovação da última semana?"
SQL: SELECT COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / COUNT(*) as taxa_aprovacao FROM applications WHERE operator_id = '{operatorId}' AND created_at >= CURRENT_DATE - INTERVAL '7 days'
`

// ----------------------------------------------------------------
// Função principal
// ----------------------------------------------------------------
export async function runStaffCopilot(query: StaffQuery): Promise<AIResult<StaffQueryResult>> {
  const start = Date.now()

  try {
    const messages: ORMessage[] = [
      { role: 'system', content: COPILOT_SYSTEM_PROMPT + '\n\n' + FEW_SHOT_EXAMPLES },
      {
        role: 'user',
        content: buildCopilotPrompt(query),
      },
    ]

    const { data: aiResponse, model, usage, latencyMs } = await callAI<{
      sqlQuery?: string
      directAnswer?: string
      requiresData: boolean
      dataType?: 'table' | 'number' | 'list' | 'text'
      suggestedActions?: Array<{ label: string; href: string }>
    }>('staff_query', messages, { jsonMode: true })

    let result: StaffQueryResult

    if (aiResponse.requiresData && aiResponse.sqlQuery) {
      // Executa a query no Supabase
      const queryResult = await executeReadOnlyQuery(
        aiResponse.sqlQuery,
        query.operatorId,
        query.role
      )

      result = {
        answer: await formatQueryResult(queryResult, query.question, model),
        data: queryResult,
        dataType: aiResponse.dataType ?? 'table',
        suggestedActions: aiResponse.suggestedActions,
        sqlGenerated: aiResponse.sqlQuery,
      }
    } else {
      result = {
        answer: aiResponse.directAnswer ?? 'Não foi possível processar sua pergunta.',
        dataType: 'text',
        suggestedActions: aiResponse.suggestedActions,
      }
    }

    return {
      success: true,
      data: result,
      meta: { model, latencyMs, usage },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro no copilot',
      data: {
        answer: 'Não consegui processar sua pergunta agora. Tente reformular ou use os filtros do painel.',
      },
      meta: {
        model: 'google/gemini-2.5-flash-preview',
        latencyMs: Date.now() - start,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      },
    }
  }
}

// ----------------------------------------------------------------
// Constrói o prompt textual
// ----------------------------------------------------------------
function buildCopilotPrompt(query: StaffQuery): string {
  return `Pergunta do operador: "${query.question}"

Contexto:
- Role: ${query.role}
- Operator ID: ${query.operatorId}
- Página atual: ${query.currentPage ?? 'dashboard'}
- Filtros ativos: ${JSON.stringify(query.activeFilters ?? {})}

Retorne JSON:
{
  "requiresData": boolean,
  "sqlQuery": "SELECT ... (substitua {operatorId} pelo valor real se role=operator, sem filtro se admin)" | null,
  "directAnswer": "resposta direta sem SQL" | null,
  "dataType": "table" | "number" | "list" | "text",
  "suggestedActions": [
    { "label": "Ver detalhes", "href": "/staff/dashboard?filter=..." }
  ] | null
}

IMPORTANTE:
- Se role = "operator", sempre filtre WHERE operator_id = '${query.operatorId}'
- Se role = "admin", pode consultar todos os dados
- Substitua {operatorId} pelo UUID real do operador
- Use apenas SELECT (nunca INSERT/UPDATE/DELETE)
- Para queries de contagem simples, retorne número formatado em directAnswer`
}

// ----------------------------------------------------------------
// Execução segura de query no Supabase (apenas SELECT)
// ----------------------------------------------------------------
async function executeReadOnlyQuery(
  sql: string,
  operatorId: string,
  role: 'operator' | 'admin'
): Promise<unknown> {
  // Sanitização básica: garante que é apenas SELECT
  const cleanSql = sql.trim().toLowerCase()
  if (!cleanSql.startsWith('select')) {
    throw new Error('Apenas queries SELECT são permitidas')
  }

  // Proibe keywords perigosas
  const dangerous = ['insert', 'update', 'delete', 'drop', 'create', 'alter', 'truncate', 'grant', 'revoke']
  for (const keyword of dangerous) {
    if (cleanSql.includes(keyword)) {
      throw new Error(`Query contém operação proibida: ${keyword}`)
    }
  }

  // Substitui placeholder {operatorId} com o valor real
  const finalSql = sql.replace(/\{operatorId\}/g, operatorId)

  // Para operadores, garante que a query sempre tem filtro de operatorId
  if (role === 'operator' && !finalSql.toLowerCase().includes('operator_id')) {
    throw new Error('Query de operador deve conter filtro operator_id')
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('execute_read_query', { sql: finalSql })

  if (error) throw new Error(`Erro na query: ${error.message}`)
  return data
}

// ----------------------------------------------------------------
// Formata o resultado da query em linguagem natural
// ----------------------------------------------------------------
async function formatQueryResult(
  data: unknown,
  originalQuestion: string,
  model: string
): Promise<string> {
  if (!data) return 'Nenhum dado encontrado.'

  // Se for número simples
  if (typeof data === 'number') {
    return `${data}`
  }

  // Se for array com 1 item e 1 campo (COUNT, SUM, etc)
  if (Array.isArray(data) && data.length === 1 && Object.keys(data[0]).length === 1) {
    const val = Object.values(data[0])[0]
    return String(val)
  }

  // Para resultados mais complexos, retorna JSON formatado
  // (o frontend renderizará como tabela)
  return `${Array.isArray(data) ? data.length : 1} resultado(s) encontrado(s).`
}
