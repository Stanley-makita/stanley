import type { SupabaseClient } from '@supabase/supabase-js'

type Resposta = 'sim' | 'ainda_nao' | 'desistiu'

function detectarResposta(texto: string): Resposta | null {
  const t = texto.trim().toLowerCase()
  if (t === '1' || t === 'sim' || t === 'sim, consegui' || t.startsWith('sim ')) return 'sim'
  if (t === '2' || t === 'ainda não' || t === 'ainda nao' || t.startsWith('ainda n')) return 'ainda_nao'
  if (t === '3' || t === 'desistiu' || t === 'cliente desistiu' || t.includes('desist')) return 'desistiu'
  return null
}

/**
 * Processa respostas de follow-up de leads aprovados.
 * Chamado quando um usuário interno envia "1", "2" ou "3" ao bot.
 * Retorna string de confirmação ou null se não há follow-up aguardando resposta.
 */
export async function processarRespostaFollowup(
  texto: string,
  usuarioId: string,
  usuarioNome: string,
  empresaId: string,
  supabase: SupabaseClient,
): Promise<string | null> {
  const resposta = detectarResposta(texto)
  if (!resposta) return null

  // Busca follow-ups ativos deste comercial onde já foi enviada notificação
  // (proxima_notificacao > now() → notificação foi enviada e aguarda próximo ciclo)
  const { data: followups } = await supabase
    .from('lead_followups')
    .select(`
      id,
      lead_id,
      empresa_id,
      dias_sem_processo,
      lead:leads!lead_id(nome)
    `)
    .eq('empresa_id', empresaId)
    .eq('responsavel_id', usuarioId)
    .eq('status', 'ativo')
    .gt('proxima_notificacao', new Date().toISOString())
    .gt('dias_sem_processo', 0)

  if (!followups?.length) return null

  const linhasConf: string[] = ['✅ *Resposta registrada*', '']

  for (const fu of followups) {
    const nomeCliente = (fu.lead as unknown as { nome: string } | null)?.nome ?? 'Cliente'

    if (resposta === 'sim') {
      // Registra resposta, reinicia contador para +3 dias
      const proxima = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      await supabase
        .from('lead_followups')
        .update({ ultima_resposta: 'sim', proxima_notificacao: proxima.toISOString() })
        .eq('id', fu.id)

      await supabase.from('lead_followup_eventos').insert({
        followup_id: fu.id,
        lead_id:     fu.lead_id,
        empresa_id:  fu.empresa_id,
        tipo:        'resposta_sim',
        usuario_id:  usuarioId,
      })

      await supabase.from('lead_historico').insert({
        lead_id:    fu.lead_id,
        empresa_id: fu.empresa_id,
        usuario_id: usuarioId,
        tipo:       'followup_resposta',
        descricao:  `${usuarioNome} confirmou contato com o cliente. Próximo follow-up em 3 dias.`,
      })

      linhasConf.push(`• *${nomeCliente}* — contato confirmado. Próximo lembrete em 3 dias.`)
    }

    if (resposta === 'ainda_nao') {
      const proxima = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      await supabase
        .from('lead_followups')
        .update({ ultima_resposta: 'ainda_nao', proxima_notificacao: proxima.toISOString() })
        .eq('id', fu.id)

      await supabase.from('lead_followup_eventos').insert({
        followup_id: fu.id,
        lead_id:     fu.lead_id,
        empresa_id:  fu.empresa_id,
        tipo:        'resposta_ainda_nao',
        usuario_id:  usuarioId,
      })

      await supabase.from('lead_historico').insert({
        lead_id:    fu.lead_id,
        empresa_id: fu.empresa_id,
        usuario_id: usuarioId,
        tipo:       'followup_resposta',
        descricao:  `${usuarioNome}: ainda sem contato com o cliente. Próximo lembrete em 3 dias.`,
      })

      linhasConf.push(`• *${nomeCliente}* — registrado. Novo lembrete em 3 dias.`)
    }

    if (resposta === 'desistiu') {
      await supabase
        .from('lead_followups')
        .update({
          status:               'encerrado',
          motivo_encerramento:  'cliente_desistiu',
          ultima_resposta:      'desistiu',
          encerrado_em:         new Date().toISOString(),
        })
        .eq('id', fu.id)

      await supabase.from('lead_followup_eventos').insert({
        followup_id: fu.id,
        lead_id:     fu.lead_id,
        empresa_id:  fu.empresa_id,
        tipo:        'resposta_desistiu',
        usuario_id:  usuarioId,
      })

      await supabase.from('lead_historico').insert({
        lead_id:    fu.lead_id,
        empresa_id: fu.empresa_id,
        usuario_id: usuarioId,
        tipo:       'followup_encerrado',
        descricao:  `${usuarioNome}: cliente desistiu. Acompanhamento encerrado.`,
      })

      linhasConf.push(`• *${nomeCliente}* — acompanhamento encerrado (cliente desistiu).`)
    }
  }

  return linhasConf.join('\n')
}
