import { normalizarTexto } from '@/lib/utils'
import type { StatusProtocolo } from '@/types/processos'

/**
 * Decide se a mudança de registro_status_protocolo deve disparar o avanço
 * automático de fase (Preparação -> Protocolado) do módulo Registro.
 *
 * Só avança quando: (1) o novo status é "protocolado", (2) é diferente do
 * status anterior (evita reprocessar em toda edição de outro campo) e
 * (3) a fase atual ainda é "Preparação" — deliberado: se o processo já
 * estiver em Diligência/Pronto (ex: reaberto, ou o status foi setado
 * durante implantação de processo já avançado), não retrocede a fase.
 */
export function deveAvancarParaProtocolado(
  statusAnterior: StatusProtocolo | null | undefined,
  statusNovo: StatusProtocolo | null | undefined,
  faseAtualNome: string | null | undefined,
): boolean {
  if (statusNovo !== 'protocolado') return false
  if (statusNovo === statusAnterior) return false
  return normalizarTexto(faseAtualNome) === normalizarTexto('Preparação')
}
