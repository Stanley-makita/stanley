import type { SupabaseClient } from '@supabase/supabase-js'

export interface BotConfig {
  nome_agente: string
  mensagem_sazonal: string | null
  horario_inicio: number
  horario_fim: number
  dias_atendimento: number[]
  mensagem_fora_horario: string | null
  produtos_ativos: string[]
}

export const BOT_CONFIG_DEFAULTS: BotConfig = {
  nome_agente: 'Fonti',
  mensagem_sazonal: null,
  horario_inicio: 8,
  horario_fim: 18,
  dias_atendimento: [1, 2, 3, 4, 5],
  mensagem_fora_horario: null,
  produtos_ativos: ['Financiamento Imobiliário', 'CGI', 'Consórcio', 'Contrato'],
}

export async function carregarBotConfig(
  supabase: SupabaseClient,
  empresa_id: string,
): Promise<BotConfig> {
  try {
    const { data } = await supabase
      .from('bot_config')
      .select('*')
      .eq('empresa_id', empresa_id)
      .maybeSingle()

    if (!data) return { ...BOT_CONFIG_DEFAULTS }

    return {
      nome_agente:           data.nome_agente           ?? BOT_CONFIG_DEFAULTS.nome_agente,
      mensagem_sazonal:      data.mensagem_sazonal       ?? null,
      horario_inicio:        data.horario_inicio         ?? BOT_CONFIG_DEFAULTS.horario_inicio,
      horario_fim:           data.horario_fim            ?? BOT_CONFIG_DEFAULTS.horario_fim,
      dias_atendimento:      data.dias_atendimento       ?? BOT_CONFIG_DEFAULTS.dias_atendimento,
      mensagem_fora_horario: data.mensagem_fora_horario  ?? null,
      produtos_ativos:       data.produtos_ativos        ?? BOT_CONFIG_DEFAULTS.produtos_ativos,
    }
  } catch {
    return { ...BOT_CONFIG_DEFAULTS }
  }
}
