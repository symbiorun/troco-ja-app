// ============================================================
// TrocoJá — Agente KYC
//
// Responsabilidade: analisar RG/CNH (frente + verso) + selfie,
// extrair dados, comparar face, validar consistência com os
// dados informados pelo cliente no cadastro.
//
// Modelo: google/gemini-2.5-pro-preview
// Motivo: melhor visão multimodal disponível, com excelente
// compreensão de documentos brasileiros (RG, CNH), incluindo
// variações de layout por estado emissor.
// ============================================================

import { callAI, imageUrlPart, textPart, ORMessage } from '../client'
import type {
  KYCAnalysisResult,
  KYCDocumentData,
  KYCFlag,
  FaceMatchResult,
  DataConsistencyResult,
  AIResult,
} from '../types'

// ----------------------------------------------------------------
// System Prompt
// ----------------------------------------------------------------
const KYC_SYSTEM_PROMPT = `Você é um sistema especializado em verificação de identidade (KYC) para uma fintech brasileira chamada TrocoJá.

Sua função é analisar documentos de identidade brasileiros (RG e CNH) e selfies para:
1. Extrair dados do documento com precisão máxima
2. Comparar a face do documento com a selfie apresentada
3. Avaliar a consistência dos dados com as informações declaradas
4. Identificar sinais de fraude, adulteração ou inconsistência

DOCUMENTOS SUPORTADOS:
- RG (Registro Geral) de qualquer estado brasileiro — formatos antigos e novos
- CNH (Carteira Nacional de Habilitação) — modelo antigo e modelo SENATRAN novo
- Não aceite: passaporte, carteira de trabalho, certidão de nascimento

DIRETRIZES DE ANÁLISE:
- Seja rigoroso mas justo. Uma divergência de acentuação (ex: "José" vs "Jose") NÃO é CPF mismatch
- Priorize a segurança: em caso de dúvida, recomende REVIEW ao invés de APPROVE
- Detecte: documentos expirados, fotos substituídas, dados adulterados, documentos de terceiros
- Livesness básico: verifique se a selfie é de uma pessoa real (não foto de foto, não tela)
- CPF deve ser extraído exatamente como aparece no documento (000.000.000-00 ou 000000000-00)
- Datas no formato ISO (YYYY-MM-DD)

CLASSIFICAÇÃO DE RISCO:
- LOW: tudo consistente, documento válido, face clara, dados batem
- MEDIUM: pequenas inconsistências ou qualidade marginal, mas provavelmente legítimo
- HIGH: divergências significativas, sinais de adulteração, face duvidosa

SAÍDA: Retorne EXCLUSIVAMENTE um objeto JSON válido, sem markdown, sem texto fora do JSON.`

// ----------------------------------------------------------------
// Função principal
// ----------------------------------------------------------------
export interface KYCInput {
  // URLs do Supabase Storage (signed URLs temporários)
  docFrontUrl: string
  docBackUrl: string
  selfieUrl: string
  // Dados declarados pelo cliente (para verificação de consistência)
  declaredName: string
  declaredCpf: string
  declaredBirthDate: string   // YYYY-MM-DD
}

export async function runKYCAnalysis(input: KYCInput): Promise<AIResult<KYCAnalysisResult>> {
  const start = Date.now()

  try {
    const messages: ORMessage[] = [
      { role: 'system', content: KYC_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          textPart(`Analise o documento e a selfie a seguir.

DADOS DECLARADOS PELO CLIENTE:
- Nome completo: ${input.declaredName}
- CPF: ${input.declaredCpf}
- Data de nascimento: ${input.declaredBirthDate}

IMAGENS:
1. Frente do documento (RG ou CNH):
`),
          imageUrlPart(input.docFrontUrl, 'high'),
          textPart('2. Verso do documento:'),
          imageUrlPart(input.docBackUrl, 'high'),
          textPart('3. Selfie do cliente:'),
          imageUrlPart(input.selfieUrl, 'high'),
          textPart(`
Retorne um JSON com exatamente esta estrutura:
{
  "approved": boolean,
  "recommendation": "APPROVE" | "REVIEW" | "REJECT",
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "flags": string[],
  "reasoning": "string em português, 2-4 frases explicando a decisão",
  "reviewNotes": "string|null — notas para o operador se recommendation=REVIEW",
  "document": {
    "documentType": "RG" | "CNH" | "UNKNOWN",
    "name": "string",
    "cpf": "string",
    "birthDate": "YYYY-MM-DD",
    "documentNumber": "string",
    "expiryDate": "YYYY-MM-DD|null",
    "issuingAuthority": "string|null",
    "issuingState": "string|null",
    "confidence": number
  },
  "faceMatch": {
    "match": boolean,
    "similarity": number,
    "confidence": number,
    "livenessScore": number,
    "flags": string[]
  },
  "dataConsistency": {
    "nameMatch": boolean,
    "cpfMatch": boolean,
    "birthDateMatch": boolean,
    "overallScore": number,
    "discrepancies": string[]
  }
}`),
        ],
      },
    ]

    const { data, model, usage, latencyMs } = await callAI<KYCAnalysisResult>(
      'kyc_full_analysis',
      messages,
      { jsonMode: true }
    )

    // Sanitização: garante que approved=true apenas se recommendation=APPROVE e riskLevel≠HIGH
    const sanitized = sanitizeKYCResult(data)

    return {
      success: true,
      data: sanitized,
      meta: { model, latencyMs, usage },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido no KYC',
      meta: {
        model: 'google/gemini-2.5-pro-preview',
        latencyMs: Date.now() - start,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      },
    }
  }
}

// ----------------------------------------------------------------
// Análise rápida apenas de documento (sem selfie)
// Para casos onde a selfie ainda não foi enviada
// ----------------------------------------------------------------
export async function extractDocumentData(
  docFrontUrl: string,
  docBackUrl: string
): Promise<AIResult<KYCDocumentData>> {
  const start = Date.now()

  try {
    const messages: ORMessage[] = [
      {
        role: 'system',
        content: `Você é um sistema de OCR especializado em documentos de identidade brasileiros (RG e CNH).
Extraia os dados com máxima precisão. Retorne APENAS JSON válido, sem markdown.`,
      },
      {
        role: 'user',
        content: [
          textPart('Extraia todos os dados deste documento de identidade brasileiro.'),
          imageUrlPart(docFrontUrl, 'high'),
          textPart('Verso do documento:'),
          imageUrlPart(docBackUrl, 'high'),
          textPart(`Retorne JSON:
{
  "documentType": "RG"|"CNH"|"UNKNOWN",
  "name": "string",
  "cpf": "000.000.000-00",
  "birthDate": "YYYY-MM-DD",
  "documentNumber": "string",
  "expiryDate": "YYYY-MM-DD|null",
  "issuingAuthority": "string|null",
  "issuingState": "string|null",
  "confidence": 0.0-1.0
}`),
        ],
      },
    ]

    const { data, model, usage, latencyMs } = await callAI<KYCDocumentData>(
      'kyc_document_extract',
      messages,
      { jsonMode: true }
    )

    return { success: true, data, meta: { model, latencyMs, usage } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro na extração',
      meta: {
        model: 'google/gemini-2.5-pro-preview',
        latencyMs: Date.now() - start,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      },
    }
  }
}

// ----------------------------------------------------------------
// Sanitização do resultado KYC
// Regras de negócio aplicadas sobre o output do modelo
// ----------------------------------------------------------------
function sanitizeKYCResult(raw: KYCAnalysisResult): KYCAnalysisResult {
  const result = { ...raw }

  // Regra: se riskLevel = HIGH, não pode ser APPROVE
  if (result.riskLevel === 'HIGH' && result.recommendation === 'APPROVE') {
    result.recommendation = 'REVIEW'
    result.approved = false
    result.reviewNotes = (result.reviewNotes ?? '') + ' [Sistema: rebaixado de APPROVE para REVIEW por risco HIGH]'
  }

  // Regra: se CPF ou nome não batem, não pode ser APPROVE automático
  if (!result.dataConsistency.cpfMatch || !result.dataConsistency.nameMatch) {
    if (result.recommendation === 'APPROVE') {
      result.recommendation = 'REVIEW'
      result.approved = false
    }
  }

  // Regra: face similarity < 0.7 = sempre REVIEW ou REJECT
  if (result.faceMatch.similarity < 0.7 && result.recommendation === 'APPROVE') {
    result.recommendation = 'REVIEW'
    result.approved = false
    if (!result.flags.includes('FACE_MATCH_LOW')) {
      result.flags.push('FACE_MATCH_LOW')
    }
  }

  // Regra: approved = true só se recommendation = APPROVE
  result.approved = result.recommendation === 'APPROVE'

  return result
}

// ----------------------------------------------------------------
// Helpers de formatação para exibição no dashboard
// ----------------------------------------------------------------
export function kycFlagToLabel(flag: KYCFlag): string {
  const labels: Record<KYCFlag, string> = {
    DOCUMENT_EXPIRED: 'Documento vencido',
    LOW_IMAGE_QUALITY: 'Imagem de baixa qualidade',
    FACE_NOT_VISIBLE: 'Face não visível no documento',
    CPF_MISMATCH: 'CPF divergente',
    NAME_MISMATCH: 'Nome divergente',
    BIRTH_DATE_MISMATCH: 'Data de nascimento divergente',
    POSSIBLE_TAMPERED: 'Possível adulteração detectada',
    MULTIPLE_FACES: 'Múltiplas faces detectadas',
    FACE_MATCH_LOW: 'Similaridade facial baixa',
    DOCUMENT_NOT_READABLE: 'Documento ilegível',
    SELFIE_BLUR: 'Selfie desfocada',
    GLASSES_DETECTED: 'Óculos detectado na selfie',
    MASK_DETECTED: 'Máscara detectada na selfie',
    DOCUMENT_NOT_BRAZILIAN: 'Documento não brasileiro',
  }
  return labels[flag] ?? flag
}

export function kycRecommendationColor(rec: KYCAnalysisResult['recommendation']): string {
  return { APPROVE: 'green', REVIEW: 'yellow', REJECT: 'red' }[rec]
}
