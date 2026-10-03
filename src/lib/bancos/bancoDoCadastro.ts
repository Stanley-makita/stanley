// Banco escolhido em texto (leads/lead_analises_credito.banco_pretendido) ↔ cadastro de Configurações › Bancos.
// Antes a aba Crédito usava uma lista fixa no código ("Caixa Econômica Federal", "Itaú", BTG, C6…) que não
// batia com o cadastro ("Caixa", "Itau", "Cashme"): a tabela mostrava o nome comprido e a conversão
// lead → negócio não achava o Itau ("itaú" ≠ "itau") — negócio nascia sem banco e sem comissão (03/10/2026).
type BancoCadastro = { id: string; nome: string }

const norm = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

export function bancoDoCadastro<B extends BancoCadastro>(texto: string | null | undefined, bancos: B[]): B | null {
  if (!texto?.trim()) return null
  const t = norm(texto)
  return bancos.find(b => norm(b.nome) === t)
    ?? bancos.find(b => t.includes(norm(b.nome)) || norm(b.nome).includes(t))
    ?? null
}

// Nome para exibir: o do cadastro quando bate; senão o texto como foi gravado.
export function nomeBancoExibicao(texto: string | null | undefined, bancos: BancoCadastro[]): string {
  return bancoDoCadastro(texto, bancos)?.nome ?? (texto ?? '')
}
