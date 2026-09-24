/**
 * Regras puras do "Organizar arquivos" da Captação (spec
 * docs/superpowers/specs/2026-09-24-pastas-documentos-captacao-design.md).
 * Sem I/O — as rotas de servidor só buscam dados e aplicam o que estas
 * funções decidem.
 */

/** Tipos que a fase 1 do OCR (classificação Haiku) sabe devolver. */
export const TIPOS_CLASSIFICACAO: ReadonlySet<string> = new Set([
  'rg', 'cnh', 'cpf', 'comprovante_endereco', 'comprovante_renda', 'extrato_fgts',
  'extrato_bancario', 'certidao_casamento', 'certidao_nascimento', 'outro',
])

/** Sem tipo ainda (nulo/vazio/'auto') → vale chamar a IA. Qualquer outro valor,
 * inclusive 'outro' ou um tipo escolhido no upload, já é conhecido. */
export function precisaClassificar(classificacao: string | null | undefined): boolean {
  return !classificacao || classificacao === 'auto'
}

/** "Extrair dados" pode pular a fase 1 quando o tipo já é um que a própria
 * classificação reconheceria (e não é 'outro', que ela ignora). */
export function tipoPermitePularClassificacao(classificacao: string | null | undefined): boolean {
  return !!classificacao && classificacao !== 'outro' && TIPOS_CLASSIFICACAO.has(classificacao)
}

export function planejarGravacaoPastas(
  itens: { documento_id: string; pasta_id: string | null }[],
  idsComVinculoLead: Set<string>,
): { atualizar: { documento_id: string; pasta_id: string | null }[]; criar: { documento_id: string; pasta_id: string }[] } {
  const atualizar: { documento_id: string; pasta_id: string | null }[] = []
  const criar: { documento_id: string; pasta_id: string }[] = []
  for (const item of itens) {
    if (idsComVinculoLead.has(item.documento_id)) {
      atualizar.push({ documento_id: item.documento_id, pasta_id: item.pasta_id })
    } else if (item.pasta_id) {
      // Documento só da Pessoa: sem pasta escolhida, não há o que gravar.
      criar.push({ documento_id: item.documento_id, pasta_id: item.pasta_id })
    }
  }
  return { atualizar, criar }
}

/** Mantém só os documentos que o servidor confirmou pertencerem ao lead. */
export function filtrarDocumentosDoLead<T extends { id: string }>(pedidos: string[], permitidos: T[]): T[] {
  const pedidosSet = new Set(pedidos)
  return permitidos.filter(d => pedidosSet.has(d.id))
}
