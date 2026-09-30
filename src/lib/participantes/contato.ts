type Telefone = { telefone: string | null; principal: boolean | null; ativo: boolean | null }

/** Telefone principal ativo da Pessoa (pessoa_telefones); sem principal, o 1º ativo. */
export function telefonePrincipalAtivo(tels: Telefone[] | null | undefined): string | null {
  const ativos = (tels ?? []).filter(t => t.ativo && t.telefone?.trim())
  return (ativos.find(t => t.principal) ?? ativos[0])?.telefone?.trim() ?? null
}
