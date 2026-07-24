// Números brasileiros de celular podem chegar com ou sem o "9" extra depois do DDD,
// dependendo de onde foram cadastrados (lead antigo, digitação manual) vs como a
// Uazapi sempre manda (com o "9"). Usado tanto ao iniciar conversa manualmente
// quanto ao casar a resposta do cliente no webhook — os dois lados precisam
// reconhecer as duas variantes do mesmo número.
export function variantesTelefoneBR(telefone: string): string[] {
  const digits = telefone.replace(/\D/g, '')
  const semDDI = digits.startsWith('55') ? digits.slice(2) : digits
  const ddd = semDDI.slice(0, 2)
  const resto = semDDI.slice(2)
  const variantes = new Set<string>([`55${ddd}${resto}`])
  if (resto.length === 9 && resto.startsWith('9')) {
    variantes.add(`55${ddd}${resto.slice(1)}`)
  } else if (resto.length === 8) {
    variantes.add(`55${ddd}9${resto}`)
  }
  return Array.from(variantes)
}
