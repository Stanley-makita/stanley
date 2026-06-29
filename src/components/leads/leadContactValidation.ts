const TELEFONE_MIN_DIGITOS = 10
const TELEFONE_MIN_DIGITOS_DISTINTOS = 3

function isTelefoneValido(telefone: string): boolean {
  const digitos = telefone.replace(/\D/g, '')
  if (digitos.length < TELEFONE_MIN_DIGITOS) return false
  // Exige pelo menos 3 dígitos distintos — rejeita 11111111111, 22222333333, etc.
  if (new Set(digitos).size < TELEFONE_MIN_DIGITOS_DISTINTOS) return false
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
