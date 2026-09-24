/**
 * Validação de CPF pelo dígito verificador (módulo 11).
 *
 * Existe porque "11 dígitos" não basta: um celular com DDD também tem 11 dígitos
 * (ex: 44984558945). Achado real (2026-09-24): `*cria cliente` com o telefone
 * solto na mensagem gravava o telefone como CPF da Pessoa e do Lead. Qualquer
 * caminho que decida "isso é um CPF" a partir de texto livre ou de OCR deve
 * passar por aqui, nunca só por `length === 11`.
 */
export function cpfValido(cpf: string | null | undefined): boolean {
  if (!cpf) return false
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11) return false
  if (/^(\d)\1{10}$/.test(d)) return false // 000.000.000-00, 111..., etc.

  const digito = (base: string, pesoInicial: number) => {
    let soma = 0
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i)
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }

  const dv1 = digito(d.slice(0, 9), 10)
  const dv2 = digito(d.slice(0, 10), 11)
  return dv1 === Number(d[9]) && dv2 === Number(d[10])
}

/** Só dígitos se for um CPF válido; null caso contrário. */
export function normalizarCpfValido(cpf: string | null | undefined): string | null {
  if (!cpf) return null
  const d = cpf.replace(/\D/g, '')
  return cpfValido(d) ? d : null
}
