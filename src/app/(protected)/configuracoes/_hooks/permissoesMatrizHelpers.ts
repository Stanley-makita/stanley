import { type Acao, type UsuarioPerfil } from '@/types/auth'
import { type ModuloDef, type AcaoModuloDef } from '@/lib/auth/modulos'
import { podeExecutarPadrao } from '@/lib/auth/permissions'

/**
 * Aplica a regra de dependência Ver↔Criar/Editar/Excluir sobre o estado local
 * de edição (pendentes), de forma pura — sem depender de React. Testável
 * isoladamente (ver __tests__).
 *
 * - Desmarcar "Ver" desmarca todas as demais ações configuráveis do módulo.
 * - Marcar qualquer ação que não seja "Ver" marca "Ver" junto.
 */
export function aplicarToggle(
  modulo: ModuloDef,
  acaoDef: AcaoModuloDef,
  valorAtual: (acao: Acao) => boolean,
  pendentesAtuais: Partial<Record<Acao, boolean>>,
): Partial<Record<Acao, boolean>> {
  if (acaoDef.configuravel === false || modulo.travado) return pendentesAtuais

  const novoValor = !valorAtual(acaoDef.acao)
  const proximo = { ...pendentesAtuais }

  if (acaoDef.acao === modulo.acaoVer) {
    proximo[modulo.acaoVer] = novoValor
    if (!novoValor) {
      for (const a of modulo.acoes) {
        if (a.acao !== modulo.acaoVer && a.configuravel !== false) {
          proximo[a.acao] = false
        }
      }
    }
  } else {
    proximo[acaoDef.acao] = novoValor
    if (novoValor) {
      proximo[modulo.acaoVer] = true
    }
  }

  return proximo
}

export interface PlanoDeSalvamento {
  /** Overrides que precisam ser gravados/atualizados (diferem do padrão). */
  upserts: { acao: Acao; permitido: boolean }[]
  /**
   * Overrides que já existiam no banco mas voltaram a bater com o padrão —
   * apagados em vez de gravados de novo, para não deixar uma linha
   * redundante (que diverge do princípio "a tabela guarda só as diferenças").
   */
  deletes: Acao[]
}
/**
 * Alterações onde o novo valor já bate com o padrão E nunca existiu override
 * pra aquele (perfil, ação) não geram nenhuma escrita — evita criar uma linha
 * de override que não muda nada (redundante desde o início).
 *
 * Importante: quando JÁ existia um override e o novo valor volta a bater com
 * o padrão, a linha é apagada (não apenas ignorada) — se só fosse ignorada,
 * o override antigo ficaria "preso" no banco, divergindo silenciosamente do
 * que a tela acabou de mostrar como salvo.
 */
export function planejarSalvamento(
  pendentes: Partial<Record<Acao, boolean>>,
  perfil: UsuarioPerfil,
  overridesExistentes: Map<string, boolean>,
): PlanoDeSalvamento {
  const upserts: { acao: Acao; permitido: boolean }[] = []
  const deletes: Acao[] = []

  for (const [acaoStr, permitido] of Object.entries(pendentes)) {
    const acao = acaoStr as Acao
    const jaTinhaOverride = overridesExistentes.has(`${perfil}:${acao}`)
    const igualAoPadrao = permitido === podeExecutarPadrao(perfil, acao)

    if (igualAoPadrao) {
      if (jaTinhaOverride) deletes.push(acao)
      // sem override prévio e já bate com o padrão: nada a fazer
    } else {
      upserts.push({ acao, permitido: permitido! })
    }
  }

  return { upserts, deletes }
}
