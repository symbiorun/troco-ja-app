// POST /api/ai/staff/query
// Copilot de linguagem natural para o painel staff.
// Recebe pergunta em texto livre, retorna resposta + dados.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { runStaffCopilot } from '@/lib/ai/agents/staff-copilot'

const QuerySchema = z.object({
  question: z.string().min(5).max(500),
  currentPage: z.string().optional(),
  activeFilters: z.record(z.string()).optional(),
})

export async function POST(req: NextRequest) {
  try {
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

    const body = await req.json()
    const parsed = QuerySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    const result = await runStaffCopilot({
      question: parsed.data.question,
      operatorId: user.id,
      role: profile.role as 'operator' | 'admin',
      currentPage: parsed.data.currentPage,
      activeFilters: parsed.data.activeFilters,
    })

    return NextResponse.json({
      success: result.success,
      answer: result.data?.answer,
      data: result.data?.data,
      dataType: result.data?.dataType,
      suggestedActions: result.data?.suggestedActions,
      meta: {
        model: result.meta.model,
        latencyMs: result.meta.latencyMs,
      },
    })
  } catch (error) {
    console.error('[/api/ai/staff/query]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
