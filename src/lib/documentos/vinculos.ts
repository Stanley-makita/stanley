/**
 * Regras puras de "documento da Pessoa → Lead/Negócio" (spec
 * docs/superpowers/specs/2026-09-25-documentos-pessoa-vinculo-design.md).
 * Sem I/O: as rotas buscam os dados e aplicam o que estas funções decidem.
 * Vincular nunca muda o dono do documento (documentos.pessoa_id) — CLAUDE.md, invariante 2.
 */
import { inferirPastaSugerida } from '@/lib/documentos'

export type EntidadeVinculo = 'lead' | 'processo'
export type MotivoRecusa = 'nao_encontrado' | 'outra_empresa' | 'documento_de_trabalho' | 'excluido'

export interface DocVinculavel {
  id: string
  empresa_id: string
  dominio: string
  deleted_at: string | null
  pessoa_id: string | null
  classificacao_legado: string | null
}

/** Só acervo da própria empresa, não excluído. Pedidos repetidos contam uma vez. */
export function separarDocumentosVinculaveis(
  pedidos: string[],
  docs: DocVinculavel[],
  empresaId: string,
): { aceitos: DocVinculavel[]; recusados: { documento_id: string; motivo: MotivoRecusa }[] } {
  const porId = new Map(docs.map(d => [d.id, d]))
  const aceitos: DocVinculavel[] = []
  const recusados: { documento_id: string; motivo: MotivoRecusa }[] = []
  for (const id of Array.from(new Set(pedidos))) {
    const d = porId.get(id)
    if (!d) recusados.push({ documento_id: id, motivo: 'nao_encontrado' })
    else if (d.empresa_id !== empresaId) recusados.push({ documento_id: id, motivo: 'outra_empresa' })
    else if (d.dominio !== 'acervo_documental') recusados.push({ documento_id: id, motivo: 'documento_de_trabalho' })
    else if (d.deleted_at) recusados.push({ documento_id: id, motivo: 'excluido' })
    else aceitos.push(d)
  }
  return { aceitos, recusados }
}

/** Mesma prioridade da conversão lead → negócio (inferirPastaSugerida), devolvendo o id da pasta. */
export function calcularPastaIdDoVinculo(input: {
  doc: Pick<DocVinculavel, 'pessoa_id' | 'classificacao_legado'>
  compradorasIds: string[]
  vendedorasIds: string[]
  pastaDoLeadCodigo: string | null
  pastaDoTipoPorCodigo: Map<string, string | null>
  pastaIdPorCodigo: Map<string, string>
}): string | null {
  const codigo = inferirPastaSugerida({
    documentoPessoaId: input.doc.pessoa_id,
    pastaSugeridaCodigoDoTipo: input.doc.classificacao_legado
      ? input.pastaDoTipoPorCodigo.get(input.doc.classificacao_legado) ?? null
      : null,
    pessoasCompradorasIds: input.compradorasIds,
    pessoasVendedorasIds: input.vendedorasIds,
    pastaDoLeadCodigo: input.pastaDoLeadCodigo,
  })
  return codigo ? input.pastaIdPorCodigo.get(codigo) ?? null : null
}

/** "Trazer das pessoas": tira o que já está vinculado aqui e o que já aparece na aba por outro caminho. */
export function filtrarCandidatosParaTrazer<T extends { id: string }>(docs: T[], idsJaAqui: Set<string>, idsOcultos: Set<string>): T[] {
  return docs.filter(d => !idsJaAqui.has(d.id) && !idsOcultos.has(d.id))
}

export interface EtiquetaVinculo { tipo: EntidadeVinculo; entidade_id: string; texto: string }

/**
 * Etiquetas "onde este documento está" na tela da Pessoa. `leads`: id → nome da fase
 * (só os que o usuário enxerga); `processos`: id → número. Anexos de nota/comentário não
 * contam como "estar" num lead/negócio.
 */
export function montarEtiquetasVinculo(
  vinculos: { documento_id: string; entidade_tipo: string; entidade_id: string }[],
  leads: Map<string, string | null>,
  processos: Map<string, string>,
): Map<string, EtiquetaVinculo[]> {
  const m = new Map<string, EtiquetaVinculo[]>()
  for (const v of vinculos) {
    let etiqueta: EtiquetaVinculo | null = null
    if (v.entidade_tipo === 'lead') {
      const fase = leads.get(v.entidade_id)
      etiqueta = { tipo: 'lead', entidade_id: v.entidade_id, texto: fase ? `Lead · ${fase}` : 'Lead' }
    } else if (v.entidade_tipo === 'processo') {
      etiqueta = { tipo: 'processo', entidade_id: v.entidade_id, texto: processos.get(v.entidade_id) ?? 'Negócio' }
    }
    if (!etiqueta) continue
    m.set(v.documento_id, [...(m.get(v.documento_id) ?? []), etiqueta])
  }
  return m
}

/** "57", "proc-57", "#proc-057", "#57" → "#proc-057"; texto com 2+ letras → busca por nome. */
export function interpretarBuscaDestino(busca: string): { numeroProcesso: string | null; texto: string | null } {
  const b = busca.trim()
  const num = b.match(/^#?(?:proc-)?0*(\d+)$/i)
  if (num) return { numeroProcesso: `#proc-${num[1].padStart(3, '0')}`, texto: null }
  return { numeroProcesso: null, texto: b.length >= 2 ? b : null }
}
