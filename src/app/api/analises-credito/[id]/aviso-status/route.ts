import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { autenticarRota } from '@/lib/documentos/vinculosServidor'
import { titularDaProposta } from '@/lib/participantes/consultas'
import { bancoDoCadastro } from '@/lib/bancos/bancoDoCadastro'
import { NotificationService } from '@/lib/notificacoes/notificationService'
import { buscarInstanciaTokenEmpresa, enviarTextoUazapi } from '@/lib/workflows/uazapi-helpers'
import {
  ESPERA_AVISO_MS, ROTULO_STATUS_ANALISE, decidirAviso, montarMensagemAviso, statusAnaliseValido,
} from '@/lib/analisesCredito/avisoStatus'
import type { StatusAnaliseCredito } from '@/types/leads'

/**
 * Aviso ao comercial do cliente quando o status de uma análise de crédito muda
 * (pedido da equipe comercial, 03/10/2026). A tela grava a análise como sempre
 * (useAnalisesCredito) e depois chama esta rota com o status que acabou de gravar.
 * A rota responde na hora e, em segundo plano, espera 1 minuto: só avisa se esse
 * ainda for o status final e se for diferente do último avisado
 * (`lead_analises_credito.ultimo_status_avisado`, migration 342).
 *
 * Quem recebe: o comercial VINCULADO ao cliente — lead → `leads.responsavel_id`,
 * negócio → `processos.comercial_id`. Se quem mudou foi ele mesmo, não recebe.
 * Sempre notificação no sino; WhatsApp só se o usuário tiver telefone.
 */
export const maxDuration = 120

type Analise = {
  id: string
  empresa_id: string
  lead_id: string | null
  processo_id: string | null
  banco_pretendido: string | null
  status: StatusAnaliseCredito
  ultimo_status_avisado: StatusAnaliseCredito | null
}

const COLUNAS = 'id, empresa_id, lead_id, processo_id, banco_pretendido, status, ultimo_status_avisado'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx
  const { id } = params
  const body = await request.json().catch(() => ({})) as { status?: unknown }
  if (!statusAnaliseValido(body.status)) {
    return NextResponse.json({ error: 'Status inválido.' }, { status: 400 })
  }

  const { data: analise, error } = await supabase
    .from('lead_analises_credito').select('id, empresa_id').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!analise || analise.empresa_id !== ctx.usuario.empresa_id) {
    return NextResponse.json({ error: 'Análise não encontrada.' }, { status: 404 })
  }

  const statusPedido = body.status
  waitUntil(
    processarAviso(id, statusPedido, { id: ctx.usuario.id, nome: ctx.usuario.nome })
      .catch(err => console.error(`[analises-credito/aviso-status] análise ${id}:`, err)),
  )
  return NextResponse.json({ agendado: true }, { status: 202 })
}

async function processarAviso(analiseId: string, statusPedido: StatusAnaliseCredito, ator: { id: string; nome: string }) {
  await new Promise(r => setTimeout(r, ESPERA_AVISO_MS))

  const { data, error } = await supabase
    .from('lead_analises_credito').select(COLUNAS).eq('id', analiseId).maybeSingle()
  if (error) throw new Error(`análise: ${error.message}`)
  if (!data) return // apagada durante a espera
  const analise = data as Analise

  const comercialId = await comercialDoCliente(analise)
  const decisao = decidirAviso({
    statusPedido,
    statusAtual: analise.status,
    ultimoAvisado: analise.ultimo_status_avisado,
    comercialId,
    atorId: ator.id,
  })
  if (decisao.acao === 'ignorar') return

  // Reserva o aviso: só um pedido consegue marcar este status como avisado
  // (dois pedidos para o mesmo status nunca mandam duas mensagens).
  const { data: reservado, error: eRes } = await supabase
    .from('lead_analises_credito')
    .update({ ultimo_status_avisado: analise.status })
    .eq('id', analise.id)
    .eq('status', analise.status)
    .or(`ultimo_status_avisado.is.null,ultimo_status_avisado.neq.${analise.status}`)
    .select('id')
  if (eRes) throw new Error(`reservar aviso: ${eRes.message}`)
  if (!reservado?.length || decisao.acao === 'marcar_sem_enviar') return

  const [clienteNome, bancoNome, comercial] = await Promise.all([
    nomeDoCliente(analise),
    nomeDoBanco(analise),
    supabase.from('usuarios').select('nome, telefone, telefone_whatsapp').eq('id', comercialId!).maybeSingle(),
  ])

  const rotulo = ROTULO_STATUS_ANALISE[analise.status]
  await NotificationService.notify({
    usuarioId: comercialId!,
    tipo: 'analise_credito_status',
    titulo: `Análise de crédito: ${rotulo}`,
    mensagem: [clienteNome, bancoNome].filter(Boolean).join(' — '),
    entidade: analise.lead_id ? 'lead' : 'processo',
    entidadeId: (analise.lead_id ?? analise.processo_id)!,
    severidade: analise.status === 'aprovado' ? 'success' : analise.status === 'recusado' ? 'error' : 'info',
    origem: 'analise_credito_status',
    dadosJson: { analise_id: analise.id, status: analise.status, alterado_por: ator.nome },
    viaServiceRole: true,
  }, supabase)

  const tel = comercial.data?.telefone_whatsapp ?? comercial.data?.telefone
  if (!tel) return
  const token = await buscarInstanciaTokenEmpresa(supabase, analise.empresa_id)
  await enviarTextoUazapi(tel, montarMensagemAviso({ clienteNome, bancoNome, status: analise.status, alteradoPor: ator.nome }), token)
}

async function comercialDoCliente(a: Analise): Promise<string | null> {
  if (a.lead_id) {
    const { data, error } = await supabase.from('leads').select('responsavel_id').eq('id', a.lead_id).maybeSingle()
    if (error) throw new Error(`lead: ${error.message}`)
    return (data?.responsavel_id as string | null) ?? null
  }
  const { data, error } = await supabase.from('processos').select('comercial_id').eq('id', a.processo_id!).maybeSingle()
  if (error) throw new Error(`processo: ${error.message}`)
  return (data?.comercial_id as string | null) ?? null
}

// Nome pelo titular da proposta (participacoes); se faltar, o nome gravado no lead.
async function nomeDoCliente(a: Analise): Promise<string> {
  const ref = a.lead_id ? { tipo: 'lead' as const, id: a.lead_id } : { tipo: 'processo' as const, id: a.processo_id! }
  const titular = await titularDaProposta(supabase, ref).catch(() => null)
  if (titular?.nome) return titular.nome
  if (a.lead_id) {
    const { data } = await supabase.from('leads').select('nome').eq('id', a.lead_id).maybeSingle()
    if (data?.nome) return data.nome as string
  }
  return 'Cliente'
}

async function nomeDoBanco(a: Analise): Promise<string | null> {
  if (!a.banco_pretendido?.trim()) return null
  const { data } = await supabase.from('bancos').select('id, nome')
  return bancoDoCadastro(a.banco_pretendido, (data ?? []) as { id: string; nome: string }[])?.nome ?? a.banco_pretendido
}
