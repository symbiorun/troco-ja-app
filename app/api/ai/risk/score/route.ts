// POST /api/ai/risk/score
// Executa análise de risco de uma aplicação antes da aprovação.
// Chamado automaticamente quando operador abre o modal de detalhes
// de uma operação com status payment_confirmed.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { runRiskAnalysis } from '@/lib/ai/agents/risk'
import { buildAIAuditEntry } from '@/lib/ai/client'
import type { RiskInput } from '@/lib/ai/types'
import { logger } from '@/lib/logger'

const ScoreSchema = z.object({
  applicationId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  try {
    // 1. Auth: apenas operador ou admin
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

    // 2. Validação
    const body = await req.json()
    const parsed = ScoreSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'applicationId inválido' }, { status: 400 })
    }

    const admin = createAdminClient()

    // 3. Busca dados completos da aplicação
    const { data: app } = await admin
      .from('applications')
      .select(`
        id, status, pix_amount, card_total, fee_pct, channel,
        customer_name, customer_cpf, customer_email, customer_phone,
        pix_key, pix_key_type, operator_id, created_at
      `)
      .eq('id', parsed.data.applicationId)
      .single()

    if (!app) return NextResponse.json({ error: 'Aplicação não encontrada' }, { status: 404 })

    // 4. Busca histórico do cliente (operações e rejeições)
    const { count: previousCount } = await admin
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('customer_cpf', app.customer_cpf)
      .neq('id', app.id)

    const { count: rejectionCount } = await admin
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('customer_cpf', app.customer_cpf)
      .eq('status', 'rejected')

    // 5. Busca resultado do KYC se disponível
    const { data: kycResult } = await admin
      .from('kyc_results')
      .select('recommendation')
      .eq('application_id', app.id)
      .maybeSingle()

    // 6. Monta input para o agente de risco
    const createdAt = new Date(app.created_at)
    const riskInput: RiskInput = {
      applicationId: app.id,
      pixAmount: app.pix_amount,
      cardTotal: app.card_total,
      channel: app.channel as 'online_link' | 'machine_delivery',
      customerName: app.customer_name,
      customerCpf: app.customer_cpf,
      customerEmail: app.customer_email,
      customerPhone: app.customer_phone,
      pixKey: app.pix_key,
      pixKeyType: app.pix_key_type,
      ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
      userAgent: req.headers.get('user-agent') ?? undefined,
      timeOfDay: createdAt.getHours(),
      dayOfWeek: createdAt.getDay(),
      previousApplicationsCount: previousCount ?? 0,
      previousRejections: rejectionCount ?? 0,
      kycRecommendation: kycResult?.recommendation ?? 'PENDING',
    }

    // 7. Executa análise
    const result = await runRiskAnalysis(riskInput)

    // 8. Persiste resultado
    await admin.from('risk_scores').upsert({
      application_id: app.id,
      score: result.data?.score ?? 50,
      level: result.data?.level ?? 'MEDIUM',
      recommendation: result.data?.recommendation ?? 'MANUAL_REVIEW',
      flags: result.data?.flags ?? [],
      breakdown: result.data?.breakdown ?? {},
      reasoning: result.data?.reasoning ?? '',
      auto_actionable: result.data?.autoActionable ?? false,
      model_used: result.meta.model,
      latency_ms: result.meta.latencyMs,
      analyzed_by: user.id,
      analyzed_at: new Date().toISOString(),
    }, { onConflict: 'application_id' })

    // 9. Audit log
    await admin.from('audit_logs').insert(
      buildAIAuditEntry('risk_score', app.id, result.meta.usage, result.meta.model, result.meta.latencyMs)
    )

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
    logger.error('[/api/ai/risk/score]', { error: String(error) })
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
