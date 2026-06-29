const TELEFONE_MIN_DIGITOS = 10

function isTelefoneValido(telefone: string): boolean {
  const digitos = telefone.replace(/\D/g, '')
  if (digitos.length < TELEFONE_MIN_DIGITOS) return false
  // Rejeita todos os dígitos iguais: 00000000000, 11111111111, etc.
  if (/^(.)\1+$/.test(digitos)) return false
  return true
}

export function getCamposContatoPendentes(input: { telefone?: string | null; email?: string | null }) {
  const pendentes: string[] = []

  const telefone = input.telefone?.toString().trim() ?? ''
  const email = input.email?.toString().trim() ?? ''

  if (!isTelefoneValido(telefone)) pendentes.push('telefone')
  if (!email) pendentes.push('email')

  return pendentes
}

export function temContatoObrigatorioParaCredito(input: { telefone?: string | null; email?: string | null }) {
  return getCamposContatoPendentes(input).length === 0
}
