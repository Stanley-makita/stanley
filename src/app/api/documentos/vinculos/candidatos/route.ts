import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { autenticarRota, verificarDestino, participantesDaEntidade } from '@/lib/documentos/vinculosServidor'
import { filtrarCandidatosParaTrazer, type EntidadeVinculo } from '@/lib/documentos/vinculos'

interface DocCandidato {
  id: string
  pessoa_id: string
  nome_original: string
  nome_exibicao: string | null
  classificacao_legado: string | null
  recebido_em: string
}

/** "Trazer das pessoas": acervo das pessoas do lead/negócio que ainda não está vinculado aqui. */
export async function GET(request: NextRequest) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx
  const q = request.nextUrl.searchParams
  const entidadeTipo = q.get('entidade_tipo') as EntidadeVinculo
  const entidadeId = q.get('entidade_id') ?? ''
  if (!['lead', 'processo'].includes(entidadeTipo) || !entidadeId) {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  }
  const empresaId = ctx.usuario.empresa_id
  const negado = await verificarDestino(ctx, entidadeTipo, entidadeId)
  if (negado) return negado

  const falhou = (msg: string) => {
    console.error('[documentos/vinculos/candidatos]', msg)
    return NextResponse.json({ error: 'Não foi possível carregar os documentos.' }, { status: 500 })
  }

  let participantes
  try {
    participantes = await participantesDaEntidade(entidadeTipo, entidadeId, empresaId)
  } catch (err) {
    return falhou((err as Error).message)
  }
  if (participantes.pessoaIds.length === 0) return NextResponse.json({ pessoas: [] })

  const [{ data: docs, error: e1 }, { data: pessoas, error: e2 }] = await Promise.all([
    supabase.from('documentos')
      .select('id, pessoa_id, nome_original, nome_exibicao, classificacao_legado, recebido_em')
      .eq('empresa_id', empresaId).eq('dominio', 'acervo_documental').is('deleted_at', null)
      .in('pessoa_id', participantes.pessoaIds).order('recebido_em', { ascending: false }),
    supabase.from('pessoas').select('id, nome').in('id', participantes.pessoaIds),
  ])
  if (e1 || e2) return falhou((e1 ?? e2)!.message)
  const listaDocs = (docs ?? []) as DocCandidato[]
  if (listaDocs.length === 0) return NextResponse.json({ pessoas: [] })

  const { data: vinculos, error: e3 } = await supabase.from('documento_vinculos')
    .select('documento_id, entidade_tipo, entidade_id').in('documento_id', listaDocs.map(d => d.id))
  if (e3) return falhou(e3.message)

  const idsJaAqui = new Set((vinculos ?? [])
    .filter(v => v.entidade_tipo === entidadeTipo && v.entidade_id === entidadeId).map(v => v.documento_id as string))
  // Lead: documento do titular sem vínculo de lead já aparece na aba (em "Sem pasta") — não repetir.
  const comVinculoLead = new Set((vinculos ?? [])
    .filter(v => v.entidade_tipo === 'lead' || v.entidade_tipo === 'lead_historico').map(v => v.documento_id as string))
  const idsOcultos = new Set(entidadeTipo === 'lead'
    ? listaDocs.filter(d => d.pessoa_id === participantes.titularLeadPessoaId && !comVinculoLead.has(d.id)).map(d => d.id)
    : [])

  const candidatos = filtrarCandidatosParaTrazer(listaDocs, idsJaAqui, idsOcultos)
  const nomePessoa = new Map((pessoas ?? []).map(p => [p.id as string, p.nome as string]))
  const resposta = participantes.pessoaIds
    .map(pid => ({
      pessoa_id: pid,
      nome: nomePessoa.get(pid) ?? 'Pessoa',
      documentos: candidatos.filter(c => c.pessoa_id === pid).map(c => ({
        id: c.id, nome: c.nome_exibicao ?? c.nome_original, classificacao: c.classificacao_legado, recebido_em: c.recebido_em,
      })),
    }))
    .filter(p => p.documentos.length > 0)
  return NextResponse.json({ pessoas: resposta })
}
