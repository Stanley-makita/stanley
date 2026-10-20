import type { SolicitacaoMensagem, SolicitacaoOperacional } from '@/types/solicitacoes-operacionais'

type Partes = Pick<SolicitacaoOperacional, 'solicitante' | 'responsavel'>

// Nome de quem escreveu uma mensagem da solicitação. Qualquer usuário da empresa pode
// responder; quando não é nem quem pediu nem o responsável, o nome deixa isso claro.
export function nomeAutorMensagem(m: Pick<SolicitacaoMensagem, 'autor_id' | 'autor'>, s: Partes, usuarioId?: string): string {
  const ehResponsavel = m.autor_id === s.responsavel?.id
  const ehSolicitante = m.autor_id === s.solicitante?.id
  const nome = ehResponsavel ? s.responsavel!.nome
    : ehSolicitante ? s.solicitante!.nome
      : (m.autor?.nome ?? 'Usuário')
  const terceiro = !ehResponsavel && !ehSolicitante && s.responsavel?.nome
    ? `${nome} (no lugar de ${s.responsavel.nome.split(' ')[0]})`
    : nome
  return m.autor_id === usuarioId ? `${terceiro} (você)` : terceiro
}
