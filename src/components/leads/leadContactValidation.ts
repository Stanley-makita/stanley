const TELEFONE_MIN_DIGITOS = 10
const TELEFONE_MIN_DIGITOS_DISTINTOS = 3

function isTelefoneValido(telefone: string): boolean {
  const digitos = telefone.replace(/\D/g, '')
  if (digitos.length < TELEFONE_MIN_DIGITOS) return false
  if (new Set(digitos).size < TELEFONE_MIN_DIGITOS_DISTINTOS) return false
  return true
}

function isEmailValido(email: string): boolean {
  return email.includes('@')
}

export interface CamposContatoInput {
  telefone?: string | null
  email?: string | null
  data_nascimento?: string | null
}

export function getCamposContatoPendentes(input: CamposContatoInput) {
  const pendentes: string[] = []

  const telefone = input.telefone?.toString().trim() ?? ''
  const email = input.email?.toString().trim() ?? ''
  const dataNascimento = input.data_nascimento?.toString().trim() ?? ''

  if (!isTelefoneValido(telefone)) pendentes.push('telefone')
  if (!isEmailValido(email)) pendentes.push('email')
  if (!dataNascimento) pendentes.push('data_nascimento')

  return pendentes
}

// E-mail deixou de bloquear avanço de fase / abertura da aba Crédito a pedido
// da diretoria comercial (2026-09-23) — não é exigido pela consulta de
// restritivos. Continua aparecendo em getCamposContatoPendentes (destaque
// visual amarelo), só não entra mais na lista que efetivamente bloqueia.
export function getCamposContatoBloqueantesCredito(input: CamposContatoInput) {
  return getCamposContatoPendentes(input).filter(campo => campo !== 'email')
}

export function temContatoObrigatorioParaCredito(input: CamposContatoInput) {
  return getCamposContatoBloqueantesCredito(input).length === 0
}
