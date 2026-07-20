import { type Acao } from '@/types/auth'
import { type ModuloDef, type AcaoModuloDef } from '@/lib/auth/modulos'

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
