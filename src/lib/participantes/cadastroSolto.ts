import { nomesParecidos } from './donoDocumento'

export type AvaliacaoCadastroSolto = { pode: true } | { pode: false; motivo: 'em_proposta' | 'nome_diferente' }

/**
 * CPF recusado por já estar noutro cadastro: dá para juntar o outro neste sem a permissão de Mesclar?
 * Só quando o outro é um duplicado "solto" — nome parecido e fora de qualquer lead/negócio (casos reais
 * 23–27/10/2026: o OCR criava o 2º cadastro com o CPF e o titular nunca recebia o CPF). Cadastro em
 * proposta pode ser cliente de outra pessoa: aí só o Mesclar, com permissão.
 */
export function avaliarCadastroSolto(
  nomeAtual: string, dono: { nome: string; emProposta: boolean },
): AvaliacaoCadastroSolto {
  if (dono.emProposta) return { pode: false, motivo: 'em_proposta' }
  if (!nomesParecidos(nomeAtual, dono.nome)) return { pode: false, motivo: 'nome_diferente' }
  return { pode: true }
}
