/**
 * Quem precisa ter o ponteiro de cônjuge (pessoas.conjuge_pessoa_id) zerado e quem liga com quem,
 * a partir dos ponteiros atuais. Puro (testável); a rota POST /api/pessoas/[id]/conjuge aplica.
 */
export function planoCasamento(
  atual: { conjugeAtualDe: Record<string, string | null> },
  pessoaId: string,
  conjugeId: string | null,
): { encerrar: string[]; ligar: [string, string] | null } {
  if (conjugeId === pessoaId) throw new Error('Não dá para registrar o casamento com a mesma pessoa.')
  const encerrar = new Set<string>()
  const conj = (id: string) => atual.conjugeAtualDe[id] ?? null
  const antigoDaPessoa = conj(pessoaId)
  if (antigoDaPessoa && antigoDaPessoa !== conjugeId) { encerrar.add(pessoaId); encerrar.add(antigoDaPessoa) }
  if (conjugeId) {
    const antigoDoConjuge = conj(conjugeId)
    if (antigoDoConjuge && antigoDoConjuge !== pessoaId) { encerrar.add(conjugeId); encerrar.add(antigoDoConjuge) }
    return { encerrar: Array.from(encerrar), ligar: [pessoaId, conjugeId] }
  }
  if (antigoDaPessoa) { encerrar.add(pessoaId); encerrar.add(antigoDaPessoa) }
  return { encerrar: Array.from(encerrar), ligar: null }
}
