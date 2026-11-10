import { addHours, format, parse, isValid, startOfHour } from 'date-fns'
import { SLA_HORAS_PADRAO, type TipoSolicitacao } from '@/types/solicitacoes-operacionais'

/**
 * Prazo de término da solicitação (pedido da equipe, 10/11/2026): a tela sugere pelo tipo — horas fixas de
 * SLA_HORAS_PADRAO (Simulação 4h, Análise de crédito 24h, Engenharia 72h…), arredondado para a próxima hora
 * cheia — e quem cria pode mudar. O valor mostrado é o valor gravado (antes a tela mostrava uma conta e o banco
 * gravava outra, por sla_config_operacional).
 */
const FORMATO_INPUT = "yyyy-MM-dd'T'HH:mm"

export function prazoSugeridoParaInput(tipo: TipoSolicitacao, agora: Date = new Date()): string {
  const bruto = addHours(agora, SLA_HORAS_PADRAO[tipo] ?? 24)
  const cheio = bruto.getMinutes() === 0 && bruto.getSeconds() === 0 ? bruto : addHours(startOfHour(bruto), 1)
  return format(cheio, FORMATO_INPUT)
}

/**
 * Valor do <input type="datetime-local"> (hora local) → ISO. Vazio, inválido ou ano implausível → null
 * (o input nativo dispara onChange a cada dígito do ano — "0002-11-10" não pode virar prazo).
 */
export function prazoInputParaIso(valor: string, agora: Date = new Date()): string | null {
  if (!valor) return null
  const d = parse(valor, FORMATO_INPUT, agora)
  if (!isValid(d)) return null
  const ano = d.getFullYear()
  if (ano < agora.getFullYear() - 1 || ano > agora.getFullYear() + 5) return null
  return d.toISOString()
}
