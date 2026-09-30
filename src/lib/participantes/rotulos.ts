import type { PapelParticipacao } from './tipos'

type Participante = { pessoaId: string; nome: string; papel: PapelParticipacao }
type Rel = { pessoa_a_id: string; pessoa_b_id: string }

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome

/**
 * Rótulo da sub-aba: "Principal" (titular); "Cônjuge de <1º nome>" quando casado com um
 * participante que vem ANTES na proposta (`todos` na ordem das sub-abas: titular primeiro) — do
 * casal, o primeiro mantém o papel; senão "Coparticipante" ou "Cônjuge". O papel continua o
 * gravado; o rótulo só lê o casamento.
 */
export function rotuloParticipante(p: Participante, todos: Participante[], rels: Rel[]): string {
  if (p.papel === 'titular') return 'Principal'
  const minhaPosicao = todos.findIndex(t => t.pessoaId === p.pessoaId)
  for (const r of rels) {
    const outro = r.pessoa_a_id === p.pessoaId ? r.pessoa_b_id : r.pessoa_b_id === p.pessoaId ? r.pessoa_a_id : null
    const posPar = outro ? todos.findIndex(t => t.pessoaId === outro) : -1
    if (posPar >= 0 && (minhaPosicao < 0 || posPar < minhaPosicao)) return `Cônjuge de ${primeiroNome(todos[posPar].nome)}`
  }
  return p.papel === 'conjuge_anuente' ? 'Cônjuge' : 'Coparticipante'
}
