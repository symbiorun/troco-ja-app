/**
 * Testes básicos para lib/contract.ts
 * Executa com: npx tsx lib/__tests__/contract.test.ts
 *
 * Usa node:test + node:assert (sem dependências extras)
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateContract,
  formatPaymentType,
  formatPixKeyType,
  formatContractDateTime,
} from '../contract'

const BASE_VARS = {
  idOperacao: '550e8400-e29b-41d4-a716-446655440000',
  dataHora: '10 de abril de 2026, às 14:30',
  nomeCompleto: 'João da Silva',
  cpf: '12345678901',
  valorPix: 500,
  valorTotalCartao: 543.75,
  tipoPagamento: 'Débito',
  taxaEfetiva: '4,98%',
  chavePix: '123.456.789-01',
  tipoChavePix: 'CPF',
  nomeOperadora: 'TrocoJá Serviços',
  cnpjOperadora: '00.000.000/0001-00',
  cidadeOperadora: 'São Paulo',
  estadoOperadora: 'SP',
}

// ─── generateContract ────────────────────────────────────────────────────────

test('generateContract — deve substituir todas as variáveis (sem {{PLACEHOLDER}})', async () => {
  let result
  try {
    result = await generateContract(BASE_VARS)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Template de contrato não encontrado')) {
      console.log('  ⚠️  Template não encontrado localmente — teste ignorado (esperado em CI)')
      return
    }
    throw err
  }

  const hasPlaceholder = /\{\{[A-Z_]+\}\}/.test(result.content)
  assert.equal(hasPlaceholder, false,
    `Output ainda contém placeholders: ${result.content.match(/\{\{[A-Z_]+\}\}/g)?.join(', ')}`)
  console.log('  ✅ Nenhum placeholder encontrado no output')
})

test('generateContract — deve retornar hash de 16 caracteres hex em maiúsculas', async () => {
  let result
  try {
    result = await generateContract(BASE_VARS)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Template de contrato não encontrado')) {
      console.log('  ⚠️  Template não encontrado — teste ignorado')
      return
    }
    throw err
  }

  assert.match(result.hash, /^[A-F0-9]{16}$/, `Hash inválido: ${result.hash}`)
  console.log(`  ✅ Hash válido: ${result.hash}`)
})

test('generateContract — hashes diferentes para contratos com dados diferentes', async () => {
  const vars2 = { ...BASE_VARS, nomeCompleto: 'Maria Oliveira', cpf: '98765432100' }
  let r1, r2
  try {
    ;[r1, r2] = await Promise.all([generateContract(BASE_VARS), generateContract(vars2)])
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Template de contrato não encontrado')) {
      console.log('  ⚠️  Template não encontrado — teste ignorado')
      return
    }
    throw err
  }

  assert.notEqual(r1.hash, r2.hash, 'Hashes devem ser diferentes para contratos distintos')
  console.log(`  ✅ Hashes distintos: ${r1.hash} ≠ ${r2.hash}`)
})

test('generateContract — deve lançar erro se template não encontrado', async () => {
  const origCwd = process.cwd
  process.cwd = () => '/non/existent/path'
  try {
    await assert.rejects(
      () => generateContract(BASE_VARS),
      /Template de contrato não encontrado/
    )
    console.log('  ✅ Erro lançado corretamente para template ausente')
  } finally {
    process.cwd = origCwd
  }
})

// ─── formatPaymentType ───────────────────────────────────────────────────────

test('formatPaymentType — debit → Débito', () => {
  assert.equal(formatPaymentType('debit'), 'Débito')
})

test('formatPaymentType — credit → Crédito à vista', () => {
  assert.equal(formatPaymentType('credit'), 'Crédito à vista')
})

test('formatPaymentType — credit_installments → Crédito parcelado em 12x', () => {
  assert.equal(formatPaymentType('credit_installments', 12), 'Crédito parcelado em 12x')
})

// ─── formatPixKeyType ────────────────────────────────────────────────────────

test('formatPixKeyType — cpf → CPF', () => {
  assert.equal(formatPixKeyType('cpf'), 'CPF')
})

test('formatPixKeyType — phone → Celular', () => {
  assert.equal(formatPixKeyType('phone'), 'Celular')
})

test('formatPixKeyType — random → Chave aleatória (EVP)', () => {
  assert.equal(formatPixKeyType('random'), 'Chave aleatória (EVP)')
})

// ─── formatContractDateTime ──────────────────────────────────────────────────

test('formatContractDateTime — formata data corretamente em português', () => {
  const date = new Date(2026, 3, 10, 14, 30) // 10/04/2026 14:30 local time
  const result = formatContractDateTime(date)
  assert.match(result, /10 de abril de 2026/)
  assert.match(result, /14:30/)
  console.log(`  ✅ Data formatada: ${result}`)
})
