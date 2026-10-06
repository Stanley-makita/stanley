import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'

// Modal de validade (crédito, matrícula, engenharia): o usuário digita por
// quantos dias vale e a data de vencimento é calculada a partir de uma data
// base — ou escolhe a data no calendário e os dias são recalculados.
// Crédito: base = Data da Aprovação, máximo 180 dias (decisão do Marcio,
// 06/10/2026). Matrícula/Engenharia: base = hoje, sem máximo.

export const MAX_DIAS_VALIDADE_CREDITO = 180

/** 'yyyy-MM-dd' de hoje no fuso local. */
export function hojeISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/** Data de vencimento ('yyyy-MM-dd') = base + dias. */
export function dataPorDias(baseISO: string, dias: number): string {
  return format(addDays(parseISO(baseISO), dias), 'yyyy-MM-dd')
}

/** Dias entre a base e a data escolhida (negativo se a data for antes da base). */
export function diasEntre(baseISO: string, dataISO: string): number {
  return differenceInCalendarDays(parseISO(dataISO), parseISO(baseISO))
}

/** Mensagem de erro do campo de dias, ou null se ok. */
export function erroDiasValidade(dias: number | null, maxDias?: number): string | null {
  if (dias === null) return null
  if (dias < 1) return 'A validade precisa terminar depois da data base.'
  if (maxDias && dias > maxDias) return `Máximo de ${maxDias} dias.`
  return null
}
