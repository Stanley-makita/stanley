/** Motivo de indisponibilidade de um interessado pra comunicação manual — reaproveitado
 * pelos endpoints GET /api/leads/[id]/interessados e GET /api/processos/[id]/interessados.
 * Nunca esconde o vínculo: só marca por que não está apto (inativo, sem telefone). */
export function motivoIndisponibilidade(
  entidade: { ativo: boolean; telefone: string | null },
  labelInativo: string
): string | null {
  if (!entidade.ativo) return labelInativo
  if (!entidade.telefone?.trim()) return 'Telefone não cadastrado'
  return null
}
