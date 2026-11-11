import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { NotificationService } from '@/lib/notificacoes/notificationService'
import { EMBED_PARTICIPANTES, nomeTitular, type ParticipacaoEmbed } from '@/lib/participantes/resumo'
import { decidirAvisoParado, diasCompletos } from '@/lib/processos/avisoParado'

// Aviso de negócio parado na fase (migration 352). Fases com `alerta_parado_dias` em
// Configurações > Fases: passou de X dias na mesma fase → avisa o operacional do negócio
// (sem operacional ativo, o comercial) no sininho + push; lembra a cada 5 dias.
// Último aviso por negócio em `processo_avisos_parado`.
//
// Cron: vercel.json, 1x/dia, mesma proteção CRON_SECRET dos outros crons.

export const maxDuration = 60

export async function GET(req: NextRequest) {
  return processar(req)
}

export async function POST(req: NextRequest) {
  return processar(req)
}

const LOTE = 200
function emLotes<T>(itens: T[]): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < itens.length; i += LOTE) lotes.push(itens.slice(i, i + LOTE))
  return lotes
}

async function processar(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const agora = new Date()

  const { data: fases, error: erroFases } = await supabase
    .from('fases')
    .select('id, nome, alerta_parado_dias')
    .eq('ativo', true)
    .not('alerta_parado_dias', 'is', null)
  if (erroFases) return NextResponse.json({ error: erroFases.message }, { status: 500 })
  if (!fases?.length) return NextResponse.json({ avisados: 0, motivo: 'nenhuma fase com aviso configurado' })

  const fasePorId = new Map(fases.map((f) => [f.id as string, f as { id: string; nome: string; alerta_parado_dias: number }]))

  const { data: processos, error: erroProc } = await supabase
    .from('processos')
    .select(`id, empresa_id, fase_atual_id, operacional_id, comercial_id, created_at, ${EMBED_PARTICIPANTES}`)
    .in('fase_atual_id', Array.from(fasePorId.keys()))
    .is('deleted_at', null)
    .is('concluido_em', null)
    .not('status_processo', 'in', '(cancelado,reprovado)')
  if (erroProc) return NextResponse.json({ error: erroProc.message }, { status: 500 })
  if (!processos?.length) return NextResponse.json({ avisados: 0 })

  const ids = processos.map((p) => p.id as string)

  // Entrada na fase atual = último registro do histórico com essa fase; sem histórico, criação do negócio.
  const entradaPorProcesso = new Map<string, { faseId: string; entrouEm: string }>()
  const avisoPorProcesso = new Map<string, { faseId: string; avisadoEm: string }>()
  for (const lote of emLotes(ids)) {
    const { data: hist, error: erroHist } = await supabase
      .from('processo_fases_historico')
      .select('processo_id, fase_id, entrou_em')
      .in('processo_id', lote)
      .order('entrou_em', { ascending: false })
    if (erroHist) return NextResponse.json({ error: erroHist.message }, { status: 500 })
    for (const h of hist ?? []) {
      const chave = `${h.processo_id}:${h.fase_id}`
      if (!entradaPorProcesso.has(chave)) entradaPorProcesso.set(chave, { faseId: h.fase_id, entrouEm: h.entrou_em })
    }

    const { data: avisos, error: erroAvisos } = await supabase
      .from('processo_avisos_parado')
      .select('processo_id, fase_id, avisado_em')
      .in('processo_id', lote)
    if (erroAvisos) return NextResponse.json({ error: erroAvisos.message }, { status: 500 })
    for (const a of avisos ?? []) avisoPorProcesso.set(a.processo_id, { faseId: a.fase_id, avisadoEm: a.avisado_em })
  }

  const idsUsuarios = Array.from(new Set(processos.flatMap((p) => [p.operacional_id, p.comercial_id]).filter(Boolean))) as string[]
  const ativos = new Set<string>()
  for (const lote of emLotes(idsUsuarios)) {
    const { data: us, error: erroUs } = await supabase.from('usuarios').select('id').in('id', lote).eq('ativo', true)
    if (erroUs) return NextResponse.json({ error: erroUs.message }, { status: 500 })
    for (const u of us ?? []) ativos.add(u.id)
  }

  let avisados = 0
  let semDestinatario = 0
  const falhas: string[] = []

  for (const p of processos) {
    const fase = fasePorId.get(p.fase_atual_id as string)
    if (!fase) continue
    const entrouEm = entradaPorProcesso.get(`${p.id}:${fase.id}`)?.entrouEm ?? (p.created_at as string)
    const decisao = decidirAvisoParado({
      limiteDias: fase.alerta_parado_dias,
      entrouEm,
      faseAtualId: fase.id,
      ultimoAviso: avisoPorProcesso.get(p.id as string) ?? null,
      agora,
    })
    if (!decisao) continue

    const destinatario =
      (p.operacional_id && ativos.has(p.operacional_id) ? p.operacional_id : null) ??
      (p.comercial_id && ativos.has(p.comercial_id) ? p.comercial_id : null)
    if (!destinatario) { semDestinatario++; continue }

    const cliente = nomeTitular((p as { participantes?: ParticipacaoEmbed[] | null }).participantes) ?? 'Negócio sem titular'
    const dias = diasCompletos(entrouEm, agora)
    const { error: erroNotif } = await NotificationService.notify({
      usuarioId: destinatario,
      tipo: 'processo_parado',
      titulo: decisao === 'lembrete' ? `Lembrete: negócio parado — ${cliente}` : `Negócio parado — ${cliente}`,
      mensagem: `${cliente} está há ${dias} dias na fase "${fase.nome}" (limite: ${fase.alerta_parado_dias} dias).`,
      entidade: 'processo',
      entidadeId: p.id as string,
      dadosJson: { fase_id: fase.id, dias_na_fase: dias, tipo_aviso: decisao },
      origem: 'cron-processos-parados',
      viaServiceRole: true,
    }, supabase)
    if (erroNotif) { falhas.push(p.id as string); continue }

    const { error: erroGrava } = await supabase
      .from('processo_avisos_parado')
      .upsert({ processo_id: p.id, empresa_id: p.empresa_id, fase_id: fase.id, avisado_em: agora.toISOString() }, { onConflict: 'processo_id' })
    if (erroGrava) console.error('[alerta-parados] falha ao gravar aviso', p.id, erroGrava)
    avisados++
  }

  return NextResponse.json({ avisados, semDestinatario, falhas: falhas.length })
}
