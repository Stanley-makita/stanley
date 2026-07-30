import { type Acao } from '@/types/auth'

/**
 * 3 estados na UI em vez de um checkbox — "herdar" precisa ser distinguível
 * de "bloquear" (ausência de linha em usuario_permissoes vs. bloqueado
 * explicitamente), senão não dá pra representar "essa pessoa não pode, mesmo
 * que o perfil dela possa" de forma explícita.
 */
export type EstadoPermissaoIndividual = 'herdar' | 'permitir' | 'bloquear'

export function estadoParaBooleano(estado: EstadoPermissaoIndividual): boolean | undefined {
  if (estado === 'permitir') return true
  if (estado === 'bloquear') return false
  return undefined
}

export function booleanoParaEstado(permitido: boolean | undefined): EstadoPermissaoIndividual {
  if (permitido === true) return 'permitir'
  if (permitido === false) return 'bloquear'
  return 'herdar'
}

export interface PlanoPermissoesIndividuais {
  upserts: { acao: Acao; permitido: boolean }[]
  deletes: Acao[]
}

/**
 * Compara os estados selecionados na UI com o que já está gravado
 * (overridesExistentes: Map<acao, permitido> — ausência de chave = nunca
 * teve exceção pra essa pessoa) e monta o plano de escrita, sem gerar
 * upsert/delete pro que não mudou.
 */
export function planejarPermissoesIndividuais(
  selecionados: Partial<Record<Acao, EstadoPermissaoIndividual>>,
  overridesExistentes: Map<string, boolean>,
): PlanoPermissoesIndividuais {
  const upserts: { acao: Acao; permitido: boolean }[] = []
  const deletes: Acao[] = []

  for (const [acaoStr, estado] of Object.entries(selecionados)) {
    const acao = acaoStr as Acao
    const jaTinhaOverride = overridesExistentes.has(acao)
    const novoValor = estadoParaBooleano(estado!)

    if (novoValor === undefined) {
      if (jaTinhaOverride) deletes.push(acao)
    } else if (!jaTinhaOverride || overridesExistentes.get(acao) !== novoValor) {
      upserts.push({ acao, permitido: novoValor })
    }
  }

  return { upserts, deletes }
}
