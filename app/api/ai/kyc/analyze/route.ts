// POST /api/ai/kyc/analyze
// Recebe URLs signed do Supabase Storage (doc frente, verso, selfie)
// + dados declarados pelo cliente e retorna análise KYC completa.
// Chamado pelo staff dashboard OU automaticamente após upload dos docs.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { runKYCAnalysis } from '@/lib/ai/agents/kyc'
import { buildAIAuditEntry } from '@/lib/ai/client'

const AnalyzeSchema = z.object({
  applicationId: z.string().uuid(),
  // URLs assinadas do Supabase Storage (válidas por 1h)
  docFrontUrl: z.string().url(),
  docBackUrl: z.string().url(),
  selfieUrl: z.string().url(),
  // Dados declarados pelo cliente
  declaredName: z.string().min(3),
  declaredCpf: z.string().min(11),
  declaredBirthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function POST(req: NextRequest) {
  try {
    // 1. Autenticação: apenas operador ou admin
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['operator', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    // 2. Validação do body
    const body = await req.json()
    const parsed = AnalyzeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 })
    }
    const input = parsed.data

    // 3. Verifica que a aplicação existe e está no status correto
    const admin = createAdminClient()
    const { data: app } = await admin
      .from('applications')
      .select('id, status, operator_id')
      .eq('id', input.applicationId)
      .single()

    if (!app) return NextResponse.json({ error: 'Aplicação não encontrada' }, { status: 404 })

    if (!['docs_pending', 'contract_pending', 'payment_pending'].includes(app.status)) {
      return NextResponse.json({
        error: 'Análise KYC não disponível neste status',
        currentStatus: app.status,
      }, { status: 422 })
    }

    // 4. Executa análise KYC
    const result = await runKYCAnalysis(input)

    // 5. Persiste resultado no Supabase
    const kycData = {
      application_id: input.applicationId,
      recommendation: result.data?.recommendation ?? 'REVIEW',
      risk_level: result.data?.riskLevel ?? 'MEDIUM',
      flags: result.data?.flags ?? [],
      document_data: result.data?.document ?? null,
      face_match: result.data?.faceMatch ?? null,
      data_consistency: result.data?.dataConsistency ?? null,
      reasoning: result.data?.reasoning ?? '',
      review_notes: result.data?.reviewNotes ?? null,
      model_used: result.meta.model,
      latency_ms: result.meta.latencyMs,
      cost_usd: result.meta.usage.estimatedCostUsd,
      analyzed_by: user.id,
      analyzed_at: new Date().toISOString(),
    }

    await admin.from('kyc_results').upsert(kycData, { onConflict: 'application_id' })

    // 6. Se recomendação = APPROVE, avança status para contract_pending (se ainda em docs_pending)
    if (result.data?.recommendation === 'APPROVE' && app.status === 'docs_pending') {
      await admin
        .from('applications')
        .update({ status: 'contract_pending', updated_at: new Date().toISOString() })
        .eq('id', input.applicationId)

      await admin.from('application_logs').insert({
        application_id: input.applicationId,
        event_type: 'kyc_approved',
        previous_status: 'docs_pending',
        new_status: 'contract_pending',
        changed_by: user.id,
        metadata: { source: 'ai_kyc', model: result.meta.model },
      })
    }

    // 7. Audit log de custo de IA
    const auditEntry = buildAIAuditEntry(
      'kyc_full_analysis',
      input.applicationId,
      result.meta.usage,
      result.meta.model,
      result.meta.latencyMs
    )
    await admin.from('audit_logs').insert(auditEntry)

    return NextResponse.json({
      success: result.success,
      result: result.data,
      meta: {
        model: result.meta.model,
        latencyMs: result.meta.latencyMs,
        estimatedCostUsd: result.meta.usage.estimatedCostUsd,
      },
    })
  } catch (error) {
    console.error('[/api/ai/kyc/analyze]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
