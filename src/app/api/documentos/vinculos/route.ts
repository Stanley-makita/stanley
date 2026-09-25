import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { autenticarRota, verificarDestino, participantesDaEntidade } from '@/lib/documentos/vinculosServidor'
import { separarDocumentosVinculaveis, calcularPastaIdDoVinculo, type DocVinculavel, type EntidadeVinculo } from '@/lib/documentos/vinculos'

/**
 * Documento da Pessoa → Lead/Negócio (spec 2026-09-25-documentos-pessoa-vinculo-design.md).
 * POST cria vínculos (nunca muda o dono do documento nem sobrescreve a pasta de um
 * vínculo que já existia); DELETE tira só o vínculo e registra no histórico.
 */
const TIPOS: EntidadeVinculo[] = ['lead', 'processo']
const LIMITE_LOTE = 50

function entidadeValida(tipo: unknown, id: unknown): tipo is EntidadeVinculo {
  return TIPOS.includes(tipo as EntidadeVinculo) && typeof id === 'string' && id.length > 0
}

export async function POST(request: NextRequest) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx
  const body = await request.json().catch(() => ({})) as { documento_ids?: unknown; entidade_tipo?: unknown; entidade_id?: unknown }
  const ids = Array.isArray(body.documento_ids) ? body.documento_ids.filter((x): x is string => typeof x === 'string') : []
  if (!entidadeValida(body.entidade_tipo, body.entidade_id) || ids.length === 0 || ids.length > LIMITE_LOTE) {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  }
  const entidadeTipo = body.entidade_tipo
  const entidadeId = body.entidade_id as string
  const empresaId = ctx.usuario.empresa_id

  const negado = await verificarDestino(ctx, entidadeTipo, entidadeId)
  if (negado) return negado

  const { data: docs, error: eDocs } = await supabase.from('documentos')
    .select('id, empresa_id, dominio, deleted_at, pessoa_id, classificacao_legado').in('id', ids)
  if (eDocs) return erro500('documentos', eDocs.message)
  const { aceitos, recusados } = separarDocumentosVinculaveis(ids, (docs ?? []) as DocVinculavel[], empresaId)
  if (aceitos.length === 0) return NextResponse.json({ vinculados: 0, ja_existiam: 0, recusados })

  const aceitosIds = aceitos.map(d => d.id)
  let participantes
  try {
    participantes = await participantesDaEntidade(entidadeTipo, entidadeId, empresaId)
  } catch (err) {
    return erro500('participantes', (err as Error).message)
  }
  const [pastas, tipos, vincLead] = await Promise.all([
    supabase.from('catalogo_pastas_processo').select('id, codigo'),
    supabase.from('catalogo_tipos_documento').select('codigo, pasta_sugerida_codigo'),
    supabase.from('documento_vinculos').select('documento_id, pasta_id')
      .eq('entidade_tipo', 'lead').in('documento_id', aceitosIds).not('pasta_id', 'is', null),
  ])
  const falha = pastas.error ?? tipos.error ?? vincLead.error
  if (falha) return erro500('catálogos', falha.message)

  const pastaIdPorCodigo = new Map((pastas.data ?? []).map(p => [p.codigo as string, p.id as string]))
  const codigoPorPastaId = new Map((pastas.data ?? []).map(p => [p.id as string, p.codigo as string]))
  const pastaDoTipoPorCodigo = new Map((tipos.data ?? []).map(t => [t.codigo as string, (t.pasta_sugerida_codigo as string | null) ?? null]))
  const pastaLeadPorDoc = new Map((vincLead.data ?? []).map(v => [v.documento_id as string, codigoPorPastaId.get(v.pasta_id as string) ?? null]))

  const linhas = aceitos.map(d => ({
    empresa_id: empresaId,
    documento_id: d.id,
    entidade_tipo: entidadeTipo,
    entidade_id: entidadeId,
    vinculado_por: ctx.usuario.id,
    pasta_id: calcularPastaIdDoVinculo({
      doc: d,
      compradorasIds: participantes.compradorasIds,
      vendedorasIds: participantes.vendedorasIds,
      pastaDoLeadCodigo: pastaLeadPorDoc.get(d.id) ?? null,
      pastaDoTipoPorCodigo,
      pastaIdPorCodigo,
    }),
  }))
  // ignoreDuplicates: vínculo que já existia fica como está (pasta escolhida pelo operador).
  const { data: inseridos, error: eUp } = await supabase.from('documento_vinculos')
    .upsert(linhas, { onConflict: 'documento_id,entidade_tipo,entidade_id', ignoreDuplicates: true })
    .select('documento_id')
  if (eUp) return erro500('vincular', eUp.message)
  const vinculados = (inseridos ?? []).length
  return NextResponse.json({ vinculados, ja_existiam: aceitos.length - vinculados, recusados })
}

export async function DELETE(request: NextRequest) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx
  const body = await request.json().catch(() => ({})) as { documento_id?: unknown; entidade_tipo?: unknown; entidade_id?: unknown }
  if (!entidadeValida(body.entidade_tipo, body.entidade_id) || typeof body.documento_id !== 'string') {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  }
  const entidadeTipo = body.entidade_tipo
  const entidadeId = body.entidade_id as string
  const documentoId = body.documento_id
  const empresaId = ctx.usuario.empresa_id

  const negado = await verificarDestino(ctx, entidadeTipo, entidadeId)
  if (negado) return negado

  const { data: removidos, error } = await supabase.from('documento_vinculos').delete()
    .eq('documento_id', documentoId).eq('entidade_tipo', entidadeTipo).eq('entidade_id', entidadeId).eq('empresa_id', empresaId)
    .select('id')
  if (error) return erro500('remover', error.message)
  if (!removidos || removidos.length === 0) return NextResponse.json({ error: 'Este documento não está vinculado aqui.' }, { status: 404 })

  // Histórico é secundário: falha aqui só loga, não desfaz a remoção.
  try {
    const { data: d } = await supabase.from('documentos').select('nome_original, nome_exibicao').eq('id', documentoId).maybeSingle()
    const nomeDoc = (d?.nome_exibicao ?? d?.nome_original ?? 'documento') as string
    const texto = `${ctx.usuario.nome} removeu o documento "${nomeDoc}" deste ${entidadeTipo === 'lead' ? 'lead' : 'negócio'} (o documento continua na pessoa).`
    const { error: eHist } = entidadeTipo === 'lead'
      ? await supabase.from('lead_historico').insert({ lead_id: entidadeId, empresa_id: empresaId, usuario_id: ctx.usuario.id, tipo: 'acao_operacional', descricao: texto })
      : await supabase.from('processo_comentarios').insert({ processo_id: entidadeId, empresa_id: empresaId, usuario_id: ctx.usuario.id, tipo: 'alteracao', texto })
    if (eHist) console.error('[documentos/vinculos] histórico não gravado:', eHist.message)
  } catch (err) {
    console.error('[documentos/vinculos] histórico não gravado:', err)
  }
  return NextResponse.json({ ok: true })
}

function erro500(etapa: string, msg: string) {
  console.error(`[documentos/vinculos] erro em ${etapa}:`, msg)
  return NextResponse.json({ error: 'Não foi possível concluir. Tente de novo.' }, { status: 500 })
}
