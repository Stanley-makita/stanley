import { differenceInYears, differenceInMonths } from 'date-fns'

// Próxima ocorrência anual de uma data (aniversário de nascimento ou de
// empresa) a partir de uma data de referência — usado tanto em
// AniversariosTab quanto no detalhe do funcionário, pra não duplicar a
// lógica de "já passou esse ano? soma 1 ano".
export function proximaOcorrenciaAnual(dataBase: Date, refDate: Date = new Date()): Date {
  const proxima = new Date(refDate.getFullYear(), dataBase.getMonth(), dataBase.getDate())
  if (proxima < refDate) proxima.setFullYear(refDate.getFullYear() + 1)
  return proxima
}

export function formatarTempoDeEmpresa(dataAdmissao: Date, refDate: Date = new Date()): string {
  const anos = differenceInYears(refDate, dataAdmissao)
  const meses = differenceInMonths(refDate, dataAdmissao) % 12
  if (anos === 0 && meses === 0) return 'Menos de 1 mês'
  const partes: string[] = []
  if (anos > 0) partes.push(`${anos} ${anos === 1 ? 'ano' : 'anos'}`)
  if (meses > 0) partes.push(`${meses} ${meses === 1 ? 'mês' : 'meses'}`)
  return partes.join(' e ')
}
