export function getCamposContatoPendentes(input: { telefone?: string | null; email?: string | null }) {
  const pendentes: string[] = []

  const telefone = input.telefone?.toString().trim() ?? ''
  const email = input.email?.toString().trim() ?? ''

  if (!telefone) pendentes.push('telefone')
  if (!email) pendentes.push('email')

  return pendentes
}

export function temContatoObrigatorioParaCredito(input: { telefone?: string | null; email?: string | null }) {
  return getCamposContatoPendentes(input).length === 0
}
