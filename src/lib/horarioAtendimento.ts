import type { BotConfig } from './bot/bot-config'

export function estaEmHorarioAtendimento(): boolean {
  const agora = new Date()
  const brasilia = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))

  const diaSemana = brasilia.getDay()
  const horaDecimal = brasilia.getHours() + brasilia.getMinutes() / 60

  const horaInicio = Number(process.env.ATENDIMENTO_HORA_INICIO ?? '8')
  const horaFim    = Number(process.env.ATENDIMENTO_HORA_FIM    ?? '18')
  const diasAtivos = (process.env.ATENDIMENTO_DIAS ?? '1,2,3,4,5')
    .split(',').map(Number)

  return diasAtivos.includes(diaSemana) && horaDecimal >= horaInicio && horaDecimal < horaFim
}

// Versão baseada nas configurações dinâmicas do banco (preferida sobre env vars)
export function estaEmHorarioConfig(config: BotConfig): boolean {
  const agora = new Date()
  const brasilia = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))

  const diaSemana = brasilia.getDay()
  const horaDecimal = brasilia.getHours() + brasilia.getMinutes() / 60

  return (
    config.dias_atendimento.includes(diaSemana) &&
    horaDecimal >= config.horario_inicio &&
    horaDecimal < config.horario_fim
  )
}
