import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { autenticarRota } from '@/lib/documentos/vinculosServidor'
import { titularDaProposta } from '@/lib/participantes/consultas'
import { NotificationService } from '@/lib/notificacoes/notificationService'
import { buscarInstanciaTokenEmpresa, enviarTextoUazapi } from '@/lib/workflows/uazapi-helpers'
import { registrarAvisoWhatsappComercial } from '@/lib/historico/registrarAvisoComercial'
import {
  ESPERA_AVISO_MS, STATUS_ENCERRADOS, decidirAvisoSolicitacao, destinatariosDoAviso,
  montarMensagemAvisoSolicitacao, type MensagemNova,
} from '@/lib/solicitacoes/avisoWhatsapp'
import { STATUS_LABELS, TIPO_LABELS, type StatusSolicitacao, type TipoSolicitacao } from '@/types/solicitacoes-operacionais'

/**
 * Aviso por WhatsApp das respostas de uma solicitação (pedido da equipe, 20/10/2026).
 * A tela grava a resposta/mensagem como sempre (RPCs responder_solicitacao /
 * enviar_mensagem_solicitacao) e depois chama esta rota. A rota responde na hora e, em
 * segundo plano, espera 1 minuto: se chegou mensagem nova nesse meio tempo, o pedido
 * dela cuida do aviso (várias mensagens seguidas = um aviso só).
 *
 * Quem recebe: quem PEDIU (`solicitante_id`) e o comercial do cliente — lead →
 * `leads.responsavel_id`, negócio → `processos.comercial_id` —, uma vez só quando forem a
 * mesma pessoa, e só com as mensagens que não escreveu. Para depois de avisar
 * Concluído/Cancelado. Controle em `aviso_whatsapp_ate`/`aviso_status_avisado` (migration 343).
 */
export const maxDuration = 120

type Solicitacao = {
  id: string
  empresa_id: string
  tipo: TipoSolicitacao
  status: StatusSolicitacao
  titulo: string
  lead_id: string | null
  processo_id: string | null
  solicitante_id: string
  responsavel_id: string | null
  aviso_whatsapp_ate: string | null
  aviso_status_avisado: string | null
}

const COLUNAS = 'id, empresa_id, tipo, status, titulo, lead_id, processo_id, solicitante_id, responsavel_id, aviso_whatsapp_ate, aviso_status_avisado'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx
  const { id } = params

  const { data: sol, error } = await supabase
    .from('solicitacoes_operacionais').select('id, empresa_id').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!sol || sol.empresa_id !== ctx.usuario.empresa_id) {
    return NextResponse.json({ error: 'Solicitação não encontrada.' }, { status: 404 })
  }

  waitUntil(
    processarAviso(id).catch(err => console.error(`[solicitacoes/aviso] solicitação ${id}:`, err)),
  )
  return NextResponse.json({ agendado: true }, { status: 202 })
}

async function processarAviso(solicitacaoId: string) {
  await new Promise(r => setTimeout(r, ESPERA_AVISO_MS))

  const { data, error } = await supabase
    .from('solicitacoes_operacionais').select(COLUNAS).eq('id', solicitacaoId).is('deleted_at', null).maybeSingle()
  if (error) throw new Error(`solicitação: ${error.message}`)
  if (!data) return
  const s = data as Solicitacao

  let qMsgs = supabase
    .from('solicitacao_mensagens').select('autor_id, texto, created_at')
    .eq('solicitacao_id', s.id).order('created_at', { ascending: true })
  if (s.aviso_whatsapp_ate) qMsgs = qMsgs.gt('created_at', s.aviso_whatsapp_ate)
  const { data: msgs, error: eMsgs } = await qMsgs
  if (eMsgs) throw new Error(`mensagens: ${eMsgs.message}`)
  const mensagensNovas = (msgs ?? []) as MensagemNova[]

  const decisao = decidirAvisoSolicitacao({ mensagensNovas, statusAvisado: s.aviso_status_avisado, agora: Date.now() })
  if (decisao.acao === 'ignorar') return

  // Reserva o aviso: só um pedido consegue avançar a marca até a última mensagem
  // (dois pedidos para as mesmas mensagens nunca mandam duas vezes).
  const ultima = mensagensNovas[mensagensNovas.length - 1].created_at
  let reserva = supabase
    .from('solicitacoes_operacionais')
    .update({ aviso_whatsapp_ate: ultima, aviso_status_avisado: s.status })
    .eq('id', s.id)
  reserva = s.aviso_whatsapp_ate ? reserva.lt('aviso_whatsapp_ate', ultima) : reserva.is('aviso_whatsapp_ate', null)
  const { data: reservado, error: eRes } = await reserva.select('id')
  if (eRes) throw new Error(`reservar aviso: ${eRes.message}`)
  if (!reservado?.length) return

  const comercialId = await comercialDoCliente(s)
  const destinatarios = destinatariosDoAviso([s.solicitante_id, comercialId], mensagensNovas)
  if (destinatarios.length === 0) return

  const idsUsuarios = Array.from(new Set([
    s.solicitante_id, s.responsavel_id, ...destinatarios.map(d => d.usuarioId), ...mensagensNovas.map(m => m.autor_id),
  ].filter((v): v is string => !!v)))
  const [{ data: usuarios, error: eUs }, clienteNome] = await Promise.all([
    supabase.from('usuarios').select('id, nome, telefone, telefone_whatsapp').in('id', idsUsuarios),
    nomeDoCliente(s),
  ])
  if (eUs) throw new Error(`usuários: ${eUs.message}`)
  const porId = new Map((usuarios ?? []).map(u => [u.id as string, u]))
  const primeiroNome = (id: string | null) => (id && (porId.get(id)?.nome as string | undefined)?.split(' ')[0]) || null

  const encerrada = STATUS_ENCERRADOS.includes(s.status)
  const token = await buscarInstanciaTokenEmpresa(supabase, s.empresa_id)

  for (const d of destinatarios) {
    // Comercial do cliente que não é parte da solicitação não recebe sino pela RPC:
    // ganha a notificação aqui, junto com o WhatsApp.
    if (d.usuarioId !== s.solicitante_id && d.usuarioId !== s.responsavel_id) {
      await NotificationService.notify({
        usuarioId: d.usuarioId,
        tipo: 'solicitacao_retorno',
        titulo: `Solicitação: ${STATUS_LABELS[s.status]}`,
        mensagem: [TIPO_LABELS[s.tipo], clienteNome].filter(Boolean).join(' — '),
        entidade: 'solicitacao',
        entidadeId: s.id,
        origem: 'solicitacao_aviso',
        viaServiceRole: true,
      }, supabase)
    }

    const u = porId.get(d.usuarioId)
    const tel = (u?.telefone_whatsapp ?? u?.telefone) as string | null | undefined
    if (!tel) continue
    const texto = montarMensagemAvisoSolicitacao({
      tipoRotulo: TIPO_LABELS[s.tipo] ?? s.tipo,
      clienteNome,
      solicitanteNome: primeiroNome(s.solicitante_id),
      responsavelNome: primeiroNome(s.responsavel_id),
      statusRotulo: STATUS_LABELS[s.status] ?? s.status,
      encerrada,
      mensagens: d.mensagens.map(m => ({
        autorNome: primeiroNome(m.autor_id) ?? 'Usuário',
        texto: m.texto,
        hora: horaSaoPaulo(m.created_at),
      })),
    })
    const enviado = await enviarTextoUazapi(tel, texto, token)
    if (enviado) {
      await registrarAvisoWhatsappComercial(supabase, {
        empresaId: s.empresa_id,
        leadId: s.lead_id,
        processoId: s.processo_id,
        comercial: { id: d.usuarioId, nome: (u?.nome as string | undefined) ?? null },
        assunto: `solicitação ${TIPO_LABELS[s.tipo] ?? s.tipo} — ${d.mensagens.length} ${d.mensagens.length > 1 ? 'novas respostas' : 'nova resposta'}, status ${STATUS_LABELS[s.status] ?? s.status}`,
      })
    }
  }
}

function horaSaoPaulo(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

async function comercialDoCliente(s: Solicitacao): Promise<string | null> {
  if (s.processo_id) {
    const { data, error } = await supabase.from('processos').select('comercial_id').eq('id', s.processo_id).maybeSingle()
    if (error) throw new Error(`processo: ${error.message}`)
    return (data?.comercial_id as string | null) ?? null
  }
  if (s.lead_id) {
    const { data, error } = await supabase.from('leads').select('responsavel_id').eq('id', s.lead_id).maybeSingle()
    if (error) throw new Error(`lead: ${error.message}`)
    return (data?.responsavel_id as string | null) ?? null
  }
  return null
}

// Nome pelo titular da proposta (participacoes); se faltar, o nome gravado no lead.
async function nomeDoCliente(s: Solicitacao): Promise<string | null> {
  const ref = s.processo_id ? { tipo: 'processo' as const, id: s.processo_id }
    : s.lead_id ? { tipo: 'lead' as const, id: s.lead_id } : null
  if (!ref) return null
  const titular = await titularDaProposta(supabase, ref).catch(() => null)
  if (titular?.nome) return titular.nome
  if (s.lead_id) {
    const { data } = await supabase.from('leads').select('nome').eq('id', s.lead_id).maybeSingle()
    if (data?.nome) return data.nome as string
  }
  return null
}
