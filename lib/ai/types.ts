// ============================================================
// TrocoJá — AI Layer Types
// Todos os tipos compartilhados entre agentes e rotas de AI
// ============================================================

// ----------------------------------------------------------------
// Task identifiers — usados pelo router para selecionar o modelo
// ----------------------------------------------------------------
export type AITask =
  | 'kyc_full_analysis'      // KYC completo: extração + face match + consistência
  | 'kyc_document_extract'   // Apenas extração de dados do documento
  | 'kyc_face_match'         // Apenas comparação facial
  | 'risk_score'             // Análise de risco / anti-fraude
  | 'whatsapp_conversation'  // Agente conversacional do WhatsApp
  | 'staff_query'            // Copilot do painel staff (NL → dados)

export type ModelTier = 'premium' | 'standard'

// ----------------------------------------------------------------
// KYC
// ----------------------------------------------------------------
export type KYCDocumentType = 'RG' | 'CNH' | 'UNKNOWN'

export type KYCFlag =
  | 'DOCUMENT_EXPIRED'
  | 'LOW_IMAGE_QUALITY'
  | 'FACE_NOT_VISIBLE'
  | 'CPF_MISMATCH'
  | 'NAME_MISMATCH'
  | 'BIRTH_DATE_MISMATCH'
  | 'POSSIBLE_TAMPERED'
  | 'MULTIPLE_FACES'
  | 'FACE_MATCH_LOW'
  | 'DOCUMENT_NOT_READABLE'
  | 'SELFIE_BLUR'
  | 'GLASSES_DETECTED'
  | 'MASK_DETECTED'
  | 'DOCUMENT_NOT_BRAZILIAN'

export interface KYCDocumentData {
  documentType: KYCDocumentType
  name: string              // Nome completo extraído do documento
  cpf: string               // CPF no formato 000.000.000-00
  birthDate: string         // ISO date YYYY-MM-DD
  documentNumber: string    // RG ou CNH número
  expiryDate?: string       // ISO date — se aplicável
  issuingAuthority?: string // Órgão emissor
  issuingState?: string     // UF
  confidence: number        // 0–1: confiança geral da extração
}

export interface FaceMatchResult {
  match: boolean
  similarity: number    // 0–1: similaridade facial
  confidence: number    // 0–1: confiança do modelo na análise
  livenessScore: number // 0–1: score de detecção de vida (anti-spoofing básico)
  flags: KYCFlag[]
}

export interface DataConsistencyResult {
  nameMatch: boolean        // Nome extraído vs nome digitado pelo cliente
  cpfMatch: boolean         // CPF extraído vs CPF digitado
  birthDateMatch: boolean   // Data nascimento extraída vs digitada
  overallScore: number      // 0–1
  discrepancies: string[]   // Descrição textual de cada divergência encontrada
}

export interface KYCAnalysisResult {
  approved: boolean
  recommendation: 'APPROVE' | 'REVIEW' | 'REJECT'
  document: KYCDocumentData
  faceMatch: FaceMatchResult
  dataConsistency: DataConsistencyResult
  flags: KYCFlag[]
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  reasoning: string         // Explicação em português para o operador
  reviewNotes?: string      // Notas adicionais se recomendação = REVIEW
}

// ----------------------------------------------------------------
// Risk / Anti-Fraude
// ----------------------------------------------------------------
export type RiskFlag =
  | 'HIGH_VALUE_TRANSACTION'
  | 'UNUSUAL_HOURS'           // Fora do horário comercial
  | 'MULTIPLE_ATTEMPTS_24H'   // Várias tentativas no mesmo dia
  | 'REPEATED_REJECTIONS'     // Múltiplas rejeições anteriores
  | 'CPF_PATTERN_SUSPICIOUS'  // CPF com padrão suspeito (todos iguais, etc)
  | 'EMAIL_DISPOSABLE'        // Email temporário/descartável
  | 'PIX_KEY_DIFFERENT_CPF'   // Chave PIX não pertence ao CPF informado
  | 'VELOCITY_ALERT'          // Múltiplas operações em curto período
  | 'FIRST_TRANSACTION'       // Primeira operação (neutro mas relevante)
  | 'KYC_NOT_APPROVED'        // KYC reprovado ou pendente
  | 'INCONSISTENT_DEVICE'     // User-agent inconsistente

export interface RiskInput {
  applicationId: string
  pixAmount: number
  cardTotal: number
  channel: 'online_link' | 'machine_delivery'
  customerName: string
  customerCpf: string
  customerEmail: string
  customerPhone: string
  pixKey: string
  pixKeyType: string
  ipAddress?: string
  userAgent?: string
  timeOfDay: number               // Hora do dia 0–23
  dayOfWeek: number               // Dia da semana 0 (dom) – 6 (sáb)
  previousApplicationsCount: number
  previousRejections: number
  kycRecommendation: 'APPROVE' | 'REVIEW' | 'REJECT' | 'PENDING'
}

export interface RiskScoreResult {
  score: number                // 0–100 (100 = risco máximo)
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  flags: RiskFlag[]
  recommendation: 'APPROVE' | 'MANUAL_REVIEW' | 'REJECT'
  reasoning: string            // Justificativa em português para o operador
  breakdown: {                 // Detalhamento por dimensão
    identity: number           // 0–100: risco de identidade
    behavior: number           // 0–100: risco comportamental
    value: number              // 0–100: risco pelo valor
    channel: number            // 0–100: risco pelo canal
  }
  autoActionable: boolean      // true se recomendação é clara o suficiente para ação automática
}

// ----------------------------------------------------------------
// WhatsApp Conversational Agent
// ----------------------------------------------------------------
export type WhatsAppSessionState =
  | 'GREETING'
  | 'COLLECTING_PIX_AMOUNT'
  | 'COLLECTING_PAYMENT_TYPE'
  | 'SHOWING_SIMULATION'
  | 'SIMULATION_CONFIRMED'
  | 'COLLECTING_NAME'
  | 'COLLECTING_CPF'
  | 'COLLECTING_EMAIL'
  | 'COLLECTING_PHONE'
  | 'COLLECTING_PIX_KEY'
  | 'REGISTRATION_COMPLETE'
  | 'WAITING_DOCS_UPLOAD'
  | 'DOCS_UNDER_REVIEW'
  | 'CONTRACT_SENT'
  | 'CONTRACT_SIGNED'
  | 'PAYMENT_INSTRUCTIONS'
  | 'PAYMENT_CONFIRMED'
  | 'PIX_PROCESSING'
  | 'COMPLETED'
  | 'REJECTED'
  | 'HUMAN_ESCALATION'
  | 'SUPPORT'

export interface WhatsAppSession {
  sessionId: string           // phone number normalizado (5511...)
  state: WhatsAppSessionState
  data: {
    pixAmount?: number
    paymentType?: 'debit' | 'credit' | 'credit_installments'
    installments?: number
    cardTotal?: number
    feePct?: number
    name?: string
    cpf?: string
    email?: string
    phone?: string
    pixKey?: string
    pixKeyType?: string
    applicationId?: string
    simulationData?: Record<string, unknown>
  }
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string; ts: string }>
  lastActivity: string        // ISO timestamp
  attemptCount: number        // Contador de tentativas nesse estado
}

export interface WhatsAppAgentInput {
  session: WhatsAppSession
  incomingMessage: string
  messageType: 'text' | 'image' | 'document' | 'audio' | 'button_reply'
  mediaUrl?: string           // URL da mídia (para documentos/fotos)
}

export interface WhatsAppAgentResponse {
  messages: WhatsAppOutboundMessage[]  // Pode ser 1 ou mais mensagens
  nextState: WhatsAppSessionState
  sessionUpdate: Partial<WhatsAppSession['data']>
  sideEffects?: WhatsAppSideEffect[]
}

export interface WhatsAppOutboundMessage {
  type: 'text' | 'link_button' | 'list' | 'image'
  text: string
  buttons?: Array<{ id: string; title: string }>
  listSections?: Array<{
    title: string
    rows: Array<{ id: string; title: string; description?: string }>
  }>
  imageUrl?: string
  caption?: string
}

export type WhatsAppSideEffect =
  | { type: 'CREATE_APPLICATION'; payload: Record<string, unknown> }
  | { type: 'UPDATE_STATUS'; applicationId: string; newStatus: string }
  | { type: 'SEND_SIMULATION_LINK'; phone: string }
  | { type: 'ESCALATE_TO_HUMAN'; reason: string }
  | { type: 'STORE_SESSION'; session: WhatsAppSession }

// ----------------------------------------------------------------
// Staff Copilot
// ----------------------------------------------------------------
export interface StaffQuery {
  question: string
  operatorId: string
  role: 'operator' | 'admin'
  currentPage?: string
  activeFilters?: Record<string, string>
}

export interface StaffQueryResult {
  answer: string             // Resposta em linguagem natural
  data?: unknown             // Dados retornados (tabela, número, lista)
  dataType?: 'table' | 'number' | 'list' | 'text'
  suggestedActions?: Array<{ label: string; href: string }>
  sqlGenerated?: string      // Para debug/transparência — a query usada
  requiresConfirmation?: boolean
}

// ----------------------------------------------------------------
// Generic OpenRouter response wrapper
// ----------------------------------------------------------------
export interface AICallMeta {
  model: string
  latencyMs: number
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    estimatedCostUsd?: number
  }
}

export interface AIResult<T> {
  success: boolean
  data?: T
  error?: string
  meta: AICallMeta
}
