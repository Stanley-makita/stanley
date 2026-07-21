import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

async function enviarWhatsApp(telefone: string, texto: string, instanciaToken: string) {
  const telRaw = telefone.replace(/\D/g, '')
  const telEnvio = telRaw.length <= 11 && !telRaw.startsWith('55') ? `55${telRaw}` : telRaw

  const res = await fetch(`${process.env.UAZAPI_API_URL}/send/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token: instanciaToken },
    body: JSON.stringify({ number: telEnvio, text: texto, delay: 800 }),
  })
  if (!res.ok) throw new Error(`Uazapi ${res.status}: ${await res.text()}`)
  return res.json()
}

async function buscarInstanciaToken(empresaId: string): Promise<string> {
  const { data } = await supabase
    .from('instancias')
    .select('token')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .limit(1)
    .maybeSingle()
  return data?.token ?? process.env.UAZAPI_INSTANCE_TOKEN ?? ''
}

export async function POST(req: NextRequest) {
  // Protege com CRON_SECRET para evitar chamadas externas
  const authHeader = req.headers.get('authorization') ?? ''
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // Busca todos os follow-ups ativos com próxima notificação vencida
  const { data: followups, error } = await supabase
    .from('lead_followups')
    .select(`
      id,
      empresa_id,
      lead_id,
      responsavel_id,
      dias_sem_processo,
      proxima_notificacao,
      notificou_gestor,
      tipo,
      intervalo_dias,
      lead:leads!lead_id(nome, deleted_at, convertido_em, perdido_em, status_analise),
      responsavel:usuarios!responsavel_id(nome, telefone, telefone_whatsapp)
    `)
    .eq('status', 'ativo')
    .lte('proxima_notificacao', new Date().toISOString())

  if (error) {
    console.error('[followup/notificar] Erro ao buscar followups:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const resultados: { leadId: string; ok: boolean; erro?: string }[] = []

  for (const fu of followups ?? []) {
    const lead = fu.lead as unknown as {
      nome: string
      deleted_at: string | null
      convertido_em: string | null
      perdido_em: string | null
      status_analise: string | null
    } | null

    // Se o lead foi cancelado/arquivado/convertido/marcado como perdido, encerrar follow-up
    if (!lead || lead.deleted_at || lead.convertido_em || lead.perdido_em) {
      const motivo = lead?.perdido_em ? 'perdido' : lead?.deleted_at ? 'lead_cancelado' : 'processo_criado'
      await supabase
        .from('lead_followups')
        .update({ status: 'encerrado', motivo_encerramento: motivo, encerrado_em: new Date().toISOString() })
        .eq('id', fu.id)
      resultados.push({ leadId: fu.lead_id, ok: true })
      continue
    }

    try {
      const instanciaToken = await buscarInstanciaToken(fu.empresa_id)
      const intervalo = fu.intervalo_dias ?? 3
      const novoDias = fu.dias_sem_processo + intervalo
      const responsavel = fu.responsavel as unknown as { nome: string; telefone: string | null; telefone_whatsapp?: string | null } | null
      const telComercial = responsavel?.telefone_whatsapp ?? responsavel?.telefone
      const creditoAprovado = lead.status_analise === 'aprovado'
      const ehRecusadoRetry = fu.tipo === 'recusado_retry'

      // ── Notificação para o comercial ──
      if (telComercial) {
        const msgComercial = [
          `🔔 *Fonti — Acompanhamento de Lead*`,
          ``,
          ehRecusadoRetry
            ? `O crédito de *${lead.nome}* foi recusado e ainda está sem decisão.`
            : creditoAprovado
            ? `O cliente *${lead.nome}* possui crédito aprovado, mas ainda não tem Processo criado.`
            : `O cliente *${lead.nome}* está concluído, mas ainda não tem Processo criado.`,
          ``,
          ehRecusadoRetry
            ? `*${novoDias} dias* desde a recusa.`
            : `*${novoDias} dias* desde a conclusão.`,
          ``,
          ehRecusadoRetry
            ? `Vai tentar outro banco ou marcar o lead como perdido?`
            : `Você conseguiu contato?`,
          ``,
          `Responda:`,
          ehRecusadoRetry ? `*1* — Vou tentar outro banco` : `*1* — Sim (consegui contato)`,
          `*2* — Ainda não`,
          ehRecusadoRetry ? `*3* — Vou marcar como perdido` : `*3* — Cliente desistiu`,
        ].join('\n')

        await enviarWhatsApp(telComercial, msgComercial, instanciaToken)
      }

      // Notificação in-app (sino) pro comercial — mesmo lembrete do WhatsApp,
      // pra quem não estiver de olho no celular ver na Central de Notificações.
      if (fu.responsavel_id) {
        await supabase.from('notificacoes').insert({
          empresa_id:  fu.empresa_id,
          usuario_id:  fu.responsavel_id,
          tipo:        'lead_followup_lembrete',
          titulo:      ehRecusadoRetry ? 'Crédito recusado sem decisão' : 'Crédito aprovado sem Processo',
          mensagem:    ehRecusadoRetry
            ? `${lead.nome} — ${novoDias} dias desde a recusa. Tente outro banco ou marque como perdido.`
            : `${lead.nome} — ${novoDias} dias sem Processo criado.`,
          entidade:    'lead',
          entidade_id: fu.lead_id,
          severidade:  'warning',
          prioridade:  ehRecusadoRetry ? 'normal' : 'high',
          origem:      'followup_cron',
        })
      }

      // Registra evento no follow-up
      await supabase.from('lead_followup_eventos').insert({
        followup_id: fu.id,
        lead_id:     fu.lead_id,
        empresa_id:  fu.empresa_id,
        tipo:        'notificacao_enviada',
      })

      // Registra no histórico do lead
      await supabase.from('lead_historico').insert({
        lead_id:    fu.lead_id,
        empresa_id: fu.empresa_id,
        tipo:       'followup_notificacao',
        descricao:  `Follow-up automático enviado ao comercial ${responsavel?.nome ?? ''} — ${novoDias} dias${ehRecusadoRetry ? ' com crédito recusado' : ' sem Processo'}.`,
      })

      // Agenda próxima notificação daqui a `intervalo` dias
      const proxima = new Date(Date.now() + intervalo * 24 * 60 * 60 * 1000)
      await supabase
        .from('lead_followups')
        .update({
          dias_sem_processo:   novoDias,
          proxima_notificacao: proxima.toISOString(),
        })
        .eq('id', fu.id)

      // ── Escalonamento: após 10 dias, notifica o(s) gestor(es) — só quando o
      // crédito está de fato aprovado (tipo 'aprovado_pendente'). Recusado
      // (recusado_retry) nunca escala: só o comercial recebe lembrete, a cada
      // intervalo, indefinidamente, até tentar outro banco ou marcar perdido.
      if (novoDias >= 10 && !fu.notificou_gestor && creditoAprovado && !ehRecusadoRetry) {
        await escalonarParaGestores(fu.empresa_id, fu.lead_id, lead.nome, novoDias, instanciaToken)
        await supabase
          .from('lead_followups')
          .update({ notificou_gestor: true })
          .eq('id', fu.id)
        await supabase.from('lead_followup_eventos').insert({
          followup_id: fu.id,
          lead_id:     fu.lead_id,
          empresa_id:  fu.empresa_id,
          tipo:        'escalonamento_gestor',
        })
      }

      resultados.push({ leadId: fu.lead_id, ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[followup/notificar] Erro lead ${fu.lead_id}:`, msg)
      resultados.push({ leadId: fu.lead_id, ok: false, erro: msg })
    }
  }

  return NextResponse.json({ processados: resultados.length, resultados })
}

async function escalonarParaGestores(
  empresaId: string,
  leadId: string,
  nomeCliente: string,
  dias: number,
  instanciaToken: string,
) {
  // Busca todos os leads aprovados sem processo da empresa há >= 10 dias (consolidado)
  const { data: todosAtrasados } = await supabase
    .from('lead_followups')
    .select(`
      dias_sem_processo,
      lead:leads!lead_id(nome),
      responsavel:usuarios!responsavel_id(nome)
    `)
    .eq('empresa_id', empresaId)
    .eq('status', 'ativo')
    .gte('dias_sem_processo', 10)
    .order('dias_sem_processo', { ascending: false })

  // Destinatários do escalonamento: qualquer usuário com o toggle "Notificar
  // leads aprovados e não avançados" ligado (Configurações > Equipe) — não
  // mais restrito a perfil admin/gestor, para permitir apontar qualquer
  // pessoa (ex.: um líder do comercial específico) como destinatária.
  const gestores = await supabase
    .from('usuarios')
    .select('nome, telefone, telefone_whatsapp')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .is('deleted_at', null)
    .eq('notificar_leads_aprovados_pendentes', true)

  if (!gestores.data?.length) return

  // Agrupa por comercial para a mensagem consolidada
  const porComercial: Record<string, { nome: string; leads: { cliente: string; dias: number }[] }> = {}
  for (const fu of todosAtrasados ?? []) {
    const resp = fu.responsavel as unknown as { nome: string } | null
    const l    = fu.lead as unknown as { nome: string } | null
    if (!resp || !l) continue
    if (!porComercial[resp.nome]) {
      porComercial[resp.nome] = { nome: resp.nome, leads: [] }
    }
    porComercial[resp.nome].leads.push({ cliente: l.nome, dias: fu.dias_sem_processo })
  }

  const linhasMsg: string[] = [
    `⚠️ *Fonti — Leads aprovados sem Processo (≥10 dias)*`,
    ``,
  ]
  for (const [, dados] of Object.entries(porComercial)) {
    linhasMsg.push(`*Comercial: ${dados.nome}* — ${dados.leads.length} lead(s)`)
    for (const l of dados.leads) {
      linhasMsg.push(`  • ${l.cliente} — ${l.dias} dias`)
    }
    linhasMsg.push('')
  }
  const msgGestor = linhasMsg.join('\n').trim()

  for (const gestor of gestores.data) {
    const tel = gestor.telefone_whatsapp ?? gestor.telefone
    if (!tel) continue
    try {
      await enviarWhatsApp(tel, msgGestor, instanciaToken)
    } catch (err) {
      console.error(`[followup] Erro ao notificar gestor ${gestor.nome}:`, err)
    }
  }
}
