import { format, parseISO } from 'date-fns'

// "20/10 às 13:42" — data e hora em que a solicitação foi pedida.
export function formatarPedidoEm(createdAt: string): string {
  return format(parseISO(createdAt), "dd/MM 'às' HH:mm")
}
