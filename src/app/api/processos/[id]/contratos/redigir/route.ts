import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { gerarMinutaPorIA } from '@/lib/contratos/gerarMinutaPorIA'
import type { ResumoNegociacao } from '@/lib/contratos/entenderNegociacao'
import type { PlanoContrato } from '@/lib/contratos/planejarContrato'
import type { Processo } from '@/types/processos'

export const maxDuration = 120

// Fase 4 v3 (geração inicial) — esta rota recebe DELIBERADAMENTE só
// `{ contratoId }`. O motor interno (redigirContrato.ts) já está preparado
// para rodadas de revisão conversacional (minutaAnterior + pedido do
// operador), mas essa capacidade não é exposta aqui: a Fase 4.5 (Assistente
// Conversacional) ainda não tem UI, histórico de conversa nem controles de
// revisão — só o motor. Não aceitar esses campos no corpo da requisição é a
// forma mais simples de garantir que esse caminho não fique acionável antes
// da hora, mesmo que alguém tente chamar a API diretamente.

async function resolveEmpresaId(token: string): Promise<string | null> {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('auth_user_id', user.id)
    .single()
  return usuario?.empresa_id ?? null
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const empresaId = await resolveEmpresaId(token)
  if (!empresaId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const contratoId = typeof body?.contratoId === 'string' ? body.contratoId : null
  if (!contratoId) return NextResponse.json({ error: 'contratoId é obrigatório.' }, { status: 400 })

  const { data: contrato } = await supabase
    .from('processo_contratos')
    .select('id, tipo_modelo, resumo_negociacao_json, plano_contrato_json')
    .eq('id', contratoId)
    .eq('processo_id', params.id)
    .eq('empresa_id', empresaId)
    .maybeSingle()

  if (!contrato) return NextResponse.json({ error: 'Rascunho de contrato não encontrado' }, { status: 404 })
  if (contrato.tipo_modelo !== 'compra_venda') {
    return NextResponse.json({ error: 'A redação por IA ainda só está disponível para Compra e Venda.' }, { status: 400 })
  }
  if (!contrato.resumo_negociacao_json || !contrato.plano_contrato_json) {
    return NextResponse.json({ error: 'Confirme o entendimento e o plano do contrato antes de redigir.' }, { status: 400 })
  }

  const { data: processo } = await supabase
    .from('processos')
    .select('*, banco:bancos!banco_id(nome)')
    .eq('id', params.id)
    .eq('empresa_id', empresaId)
    .maybeSingle()
  if (!processo) return NextResponse.json({ error: 'Negócio não encontrado' }, { status: 404 })

  // instrucoesLivres viaja como chave irmã dentro do mesmo JSONB que
  // useConfirmarEntendimento já grava (sem migration nova — ver
  // useProcessoContrato.ts). Campo interno, não faz parte do tipo público
  // ResumoNegociacao usado em todo o resto do sistema.
  const resumoPersistido = contrato.resumo_negociacao_json as ResumoNegociacao & { _instrucoesLivres?: string | null }
  const { _instrucoesLivres, ...resumo } = resumoPersistido

  try {
    const resultado = await gerarMinutaPorIA({
      tipoContrato: contrato.tipo_modelo,
      resumo: resumo as ResumoNegociacao,
      plano: contrato.plano_contrato_json as PlanoContrato,
      instrucoesLivres: _instrucoesLivres ?? null,
      processo: processo as unknown as Processo,
    })
    return NextResponse.json(resultado)
  } catch (err) {
    console.error('[contratos/redigir] erro ao redigir contrato:', err)
    return NextResponse.json({ error: 'Não foi possível redigir o contrato. Tente novamente.' }, { status: 500 })
  }
}
