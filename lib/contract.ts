// ============================================================
// TrocoJá — Utilitário de Geração de Contrato
//
// Preenche o template contrato-padrao.md com os dados reais
// da operação e retorna o texto pronto para exibição e
// armazenamento imutável no Supabase.
// ============================================================

import { createHash } from 'crypto'
import { formatBRL } from './utils'

export interface ContractVariables {
  // Operação
  idOperacao: string
  dataHora: string

  // Cliente
  nomeCompleto: string
  cpf: string

  // Financeiro
  valorPix: number
  valorTotalCartao: number
  tipoPagamento: string       // "Débito", "Crédito à vista", "Crédito parcelado em 12x"
  taxaEfetiva: string         // "4,98%"

  // PIX
  chavePix: string
  tipoChavePix: string        // "CPF", "Celular", "E-mail", "Chave aleatória"

  // Operadora
  nomeOperadora: string
  cnpjOperadora: string
  cidadeOperadora: string
  estadoOperadora: string
}

/**
 * Lê o template do contrato e preenche as variáveis.
 * Retorna o texto markdown preenchido + hash SHA-256 para integridade.
 */
export async function generateContract(vars: ContractVariables): Promise<{
  content: string
  hash: string
  templateVersion: string
}> {
  // Em produção: carregar do Supabase (tabela contracts, tipo 'standard_cash_out', is_active=true)
  // Para MVP: usar o arquivo estático
  const templateVersion = 'v1.0.0'

  // Carrega o template (server-side only)
  let template: string
  try {
    // Next.js 14 App Router: fs disponível em Server Components e Route Handlers
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const templatePath = join(process.cwd(), 'content', 'contrato-padrao.md')
    template = readFileSync(templatePath, 'utf-8')
  } catch {
    throw new Error('Template de contrato não encontrado. Configure content/contrato-padrao.md')
  }

  // Preenche todas as variáveis
  const filled = fillTemplate(template, {
    '{{ID_OPERACAO}}': vars.idOperacao,
    '{{DATA_HORA}}': vars.dataHora,
    '{{NOME_COMPLETO}}': vars.nomeCompleto,
    '{{CPF}}': vars.cpf,
    '{{VALOR_TOTAL_CARTAO}}': formatBRL(vars.valorTotalCartao),
    '{{TIPO_PAGAMENTO}}': vars.tipoPagamento,
    '{{VALOR_PIX}}': formatBRL(vars.valorPix),
    '{{CHAVE_PIX}}': vars.chavePix,
    '{{TIPO_CHAVE_PIX}}': vars.tipoChavePix,
    '{{TAXA_EFETIVA}}': vars.taxaEfetiva,
    '{{NOME_OPERADORA}}': vars.nomeOperadora,
    '{{CNPJ_OPERADORA}}': vars.cnpjOperadora,
    '{{CIDADE_OPERADORA}}': vars.cidadeOperadora,
    '{{ESTADO_OPERADORA}}': vars.estadoOperadora,
    // Hash será preenchido depois (após gerar o conteúdo base)
    '{{HASH_CONTRATO}}': 'CALCULANDO...',
  })

  // Calcula o hash SHA-256 do conteúdo preenchido (sem o placeholder do hash)
  const hash = createHash('sha256').update(filled, 'utf-8').digest('hex').slice(0, 16).toUpperCase()

  // Substitui o placeholder do hash pelo valor real
  const finalContent = filled.replace('CALCULANDO...', hash)

  return { content: finalContent, hash, templateVersion }
}

/**
 * Aplica substituições em lote no template.
 */
function fillTemplate(template: string, replacements: Record<string, string>): string {
  let result = template
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.replaceAll(placeholder, value)
  }
  return result
}

/**
 * Formata o tipo de pagamento para exibição no contrato.
 */
export function formatPaymentType(
  paymentMethod: 'debit' | 'credit' | 'credit_installments',
  installments?: number
): string {
  switch (paymentMethod) {
    case 'debit':
      return 'Débito'
    case 'credit':
      return 'Crédito à vista'
    case 'credit_installments':
      return `Crédito parcelado em ${installments ?? 12}x`
    default:
      return 'Cartão'
  }
}

/**
 * Formata o tipo de chave PIX para exibição no contrato.
 */
export function formatPixKeyType(type: string): string {
  const map: Record<string, string> = {
    cpf: 'CPF',
    phone: 'Celular',
    email: 'E-mail',
    random: 'Chave aleatória (EVP)',
    cnpj: 'CNPJ',
  }
  return map[type.toLowerCase()] ?? type
}

/**
 * Formata data e hora para exibição no contrato.
 * Ex: "09 de abril de 2026, às 14:32"
 */
export function formatContractDateTime(date: Date = new Date()): string {
  const months = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ]
  const day = String(date.getDate()).padStart(2, '0')
  const month = months[date.getMonth()]
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day} de ${month} de ${year}, às ${hours}:${minutes}`
}
