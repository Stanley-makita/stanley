// Data de emissão do contrato informada pela equipe (checklist "Contrato Emitido" e card do
// negócio). O contrato pode ser emitido hoje no sistema com data de outro dia (ex.: 15/11) —
// a equipe só considera emitido na data informada, que é a que vai para relatórios e comissão.

/** Hoje como AAAA-MM-DD no fuso do navegador (não UTC: depois das 21h, UTC já é amanhã). */
export function hojeLocalIso(agora: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`
}

/**
 * Erro de validação ou null. Aceita de 1 ano atrás até 6 meses à frente — fora disso é
 * quase sempre ano digitado pela metade no <input type="date"> (ver CLAUDE.md).
 */
export function erroDataEmissao(valor: string, hoje: Date = new Date()): string | null {
  if (!valor) return 'Informe a data de emissão.'
  const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return 'Data inválida.'
  const data = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(data.getTime()) || data.getDate() !== Number(m[3])) return 'Data inválida.'
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const min = new Date(base); min.setFullYear(min.getFullYear() - 1)
  const max = new Date(base); max.setMonth(max.getMonth() + 6)
  if (data < min || data > max) return 'Data inválida — confira o ano.'
  return null
}
