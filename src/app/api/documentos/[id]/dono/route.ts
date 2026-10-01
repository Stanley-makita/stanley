import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { autenticarRota, verificarDestino, participantesDaEntidade } from '@/lib/documentos/vinculosServidor'
import type { EntidadeVinculo } from '@/lib/documentos/vinculos'

/**
 * "Mover para participante" (Participantes V2, spec §3): troca o dono (`documentos.pessoa_id`) de um
 * documento da proposta para outro participante dela — ex.: RG do Afrânio que chegou no Heitor.
 * Só entre participantes do lead/negócio de onde o usuário pede, com permissão de editá-lo. Garante o
 * vínculo do documento com esse lead/negócio (o Lead mostra os documentos vinculados + os do
 * titular; sem o vínculo o documento sumiria da tela ao sair do titular).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx
  const body = await request.json().catch(() => ({})) as { entidade_tipo?: unknown; entidade_id?: unknown; pessoa_id?: unknown }
  const entidadeTipo = body.entidade_tipo as EntidadeVinculo
  if (!['lead', 'processo'].includes(entidadeTipo) || typeof body.entidade_id !== 'string' || typeof body.pessoa_id !== 'string') {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  }
  const entidadeId = body.entidade_id
  const pessoaDestino = body.pessoa_id
  const empresaId = ctx.usuario.empresa_id
  const documentoId = params.id

  const negado = await verificarDestino(ctx, entidadeTipo, entidadeId)
  if (negado) return negado

  const { data: doc, error: eDoc } = await supabase.from('documentos')
    .select('id, empresa_id, dominio, deleted_at, pessoa_id, nome_original, nome_exibicao')
    .eq('id', documentoId).eq('empresa_id', empresaId).maybeSingle()
  if (eDoc) return erro500('documento', eDoc.message)
  if (!doc || doc.deleted_at) return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 })
  if (doc.dominio !== 'acervo_documental' || !doc.pessoa_id) {
    return NextResponse.json({ error: 'Documento de trabalho do negócio não tem dono para trocar.' }, { status: 400 })
  }

  let pessoaIds: string[]
  try {
    pessoaIds = (await participantesDaEntidade(entidadeTipo, entidadeId, empresaId)).pessoaIds
  } catch (err) {
    return erro500('participantes', (err as Error).message)
  }
  if (!pessoaIds.includes(pessoaDestino)) {
    return NextResponse.json({ error: 'A pessoa escolhida não participa desta proposta.' }, { status: 422 })
  }
  if (doc.pessoa_id === pessoaDestino) return NextResponse.json({ ok: true, alterado: false })

  // O documento tem que ser desta proposta: de um participante dela, ou já vinculado a ela.
  if (!pessoaIds.includes(doc.pessoa_id as string)) {
    const { data: vinc, error: eV } = await supabase.from('documento_vinculos').select('id')
      .eq('documento_id', documentoId).eq('entidade_tipo', entidadeTipo).eq('entidade_id', entidadeId).maybeSingle()
    if (eV) return erro500('vínculo', eV.message)
    if (!vinc) return NextResponse.json({ error: 'Este documento não é desta proposta.' }, { status: 422 })
  }

  const { data: movido, error: eUp } = await supabase.from('documentos')
    .update({ pessoa_id: pessoaDestino }).eq('id', documentoId).eq('empresa_id', empresaId).select('id')
  if (eUp) return erro500('mover', eUp.message)
  if (!movido?.length) return NextResponse.json({ error: 'Não foi possível mover o documento.' }, { status: 500 })

  const { error: eVinc } = await supabase.from('documento_vinculos').upsert(
    { empresa_id: empresaId, documento_id: documentoId, entidade_tipo: entidadeTipo, entidade_id: entidadeId, vinculado_por: ctx.usuario.id },
    { onConflict: 'documento_id,entidade_tipo,entidade_id', ignoreDuplicates: true },
  )
  if (eVinc) console.error('[documentos/dono] vínculo não garantido:', eVinc.message)

  // Histórico é secundário: falha só loga.
  try {
    const { data: nomes } = await supabase.from('pessoas').select('id, nome').in('id', [doc.pessoa_id as string, pessoaDestino])
    const nomeDe = (id: string) => (nomes ?? []).find(p => p.id === id)?.nome ?? 'outra pessoa'
    const nomeDoc = (doc.nome_exibicao ?? doc.nome_original ?? 'documento') as string
    const texto = `${ctx.usuario.nome} moveu o documento "${nomeDoc}" de ${nomeDe(doc.pessoa_id as string)} para ${nomeDe(pessoaDestino)}.`
    const { error: eHist } = entidadeTipo === 'lead'
      ? await supabase.from('lead_historico').insert({ lead_id: entidadeId, empresa_id: empresaId, usuario_id: ctx.usuario.id, tipo: 'acao_operacional', descricao: texto })
      : await supabase.from('processo_comentarios').insert({ processo_id: entidadeId, empresa_id: empresaId, usuario_id: ctx.usuario.id, tipo: 'alteracao', texto })
    if (eHist) console.error('[documentos/dono] histórico não gravado:', eHist.message)
  } catch (err) {
    console.error('[documentos/dono] histórico não gravado:', err)
  }
  return NextResponse.json({ ok: true, alterado: true })
}

function erro500(etapa: string, msg: string) {
  console.error(`[documentos/dono] erro em ${etapa}:`, msg)
  return NextResponse.json({ error: 'Não foi possível concluir. Tente de novo.' }, { status: 500 })
}
