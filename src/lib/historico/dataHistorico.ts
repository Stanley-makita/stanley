import { differenceInCalendarDays, format } from 'date-fns'

// Data de um evento do Histórico (Captação e Negócio): data/hora exata + há quantos dias
// — "14/06/2026 14:00 · 6 dias" (pedido 20/10/2026; antes era só "há cerca de 6 horas").
export function formatarDataHistorico(iso: string, agora: Date = new Date()): string {
  const data = new Date(iso)
  const dias = differenceInCalendarDays(agora, data)
  const contagem = dias <= 0 ? 'hoje' : dias === 1 ? '1 dia' : `${dias} dias`
  return `${format(data, 'dd/MM/yyyy HH:mm')} · ${contagem}`
}
