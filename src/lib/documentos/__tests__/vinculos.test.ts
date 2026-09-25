import { describe, it, expect } from 'vitest'
import {
  separarDocumentosVinculaveis, calcularPastaIdDoVinculo, filtrarCandidatosParaTrazer,
  montarEtiquetasVinculo, interpretarBuscaDestino, type DocVinculavel,
} from '../vinculos'

const doc = (p: Partial<DocVinculavel> & { id: string }): DocVinculavel => ({
  empresa_id: 'e1', dominio: 'acervo_documental', deleted_at: null, pessoa_id: 'p1', classificacao_legado: null, ...p,
})

describe('separarDocumentosVinculaveis', () => {
  it('aceita acervo da empresa e recusa o resto com motivo', () => {
    const r = separarDocumentosVinculaveis(
      ['ok', 'trab', 'exc', 'outra', 'sumiu', 'ok'],
      [doc({ id: 'ok' }), doc({ id: 'trab', dominio: 'processo_trabalho' }), doc({ id: 'exc', deleted_at: '2026-09-01' }), doc({ id: 'outra', empresa_id: 'e2' })],
      'e1',
    )
    expect(r.aceitos.map(d => d.id)).toEqual(['ok'])
    expect(r.recusados).toEqual([
      { documento_id: 'trab', motivo: 'documento_de_trabalho' },
      { documento_id: 'exc', motivo: 'excluido' },
      { documento_id: 'outra', motivo: 'outra_empresa' },
      { documento_id: 'sumiu', motivo: 'nao_encontrado' },
    ])
  })
})

describe('calcularPastaIdDoVinculo', () => {
  const pastaIdPorCodigo = new Map([['comprador', 'pasta-comp'], ['vendedor', 'pasta-vend'], ['renda', 'pasta-renda'], ['imovel', 'pasta-imovel']])
  const pastaDoTipoPorCodigo = new Map<string, string | null>([['comprovante_renda', 'renda']])
  it('pasta do lead vence', () => {
    expect(calcularPastaIdDoVinculo({ doc: { pessoa_id: 'p1', classificacao_legado: 'comprovante_renda' }, compradorasIds: ['p1'], vendedorasIds: [], pastaDoLeadCodigo: 'imovel', pastaDoTipoPorCodigo, pastaIdPorCodigo })).toBe('pasta-imovel')
  })
  it('papel no processo vem antes do tipo', () => {
    expect(calcularPastaIdDoVinculo({ doc: { pessoa_id: 'p9', classificacao_legado: 'comprovante_renda' }, compradorasIds: [], vendedorasIds: ['p9'], pastaDoLeadCodigo: null, pastaDoTipoPorCodigo, pastaIdPorCodigo })).toBe('pasta-vend')
  })
  it('sem papel usa o tipo; sem nada devolve null', () => {
    expect(calcularPastaIdDoVinculo({ doc: { pessoa_id: 'px', classificacao_legado: 'comprovante_renda' }, compradorasIds: [], vendedorasIds: [], pastaDoLeadCodigo: null, pastaDoTipoPorCodigo, pastaIdPorCodigo })).toBe('pasta-renda')
    expect(calcularPastaIdDoVinculo({ doc: { pessoa_id: 'px', classificacao_legado: null }, compradorasIds: [], vendedorasIds: [], pastaDoLeadCodigo: null, pastaDoTipoPorCodigo, pastaIdPorCodigo })).toBeNull()
  })
})

describe('filtrarCandidatosParaTrazer', () => {
  it('tira o que já está aqui e os ocultos (titular do lead sem vínculo já aparece em Sem pasta)', () => {
    const r = filtrarCandidatosParaTrazer([{ id: 'a' }, { id: 'b' }, { id: 'c' }], new Set(['a']), new Set(['b']))
    expect(r.map(d => d.id)).toEqual(['c'])
  })
})

describe('montarEtiquetasVinculo', () => {
  it('etiqueta lead com fase e processo com número; ignora anexos de nota', () => {
    const m = montarEtiquetasVinculo(
      [
        { documento_id: 'd1', entidade_tipo: 'lead', entidade_id: 'l1' },
        { documento_id: 'd1', entidade_tipo: 'processo', entidade_id: 'pr1' },
        { documento_id: 'd2', entidade_tipo: 'lead_historico', entidade_id: 'h1' },
        { documento_id: 'd3', entidade_tipo: 'lead', entidade_id: 'l-oculto' },
      ],
      new Map([['l1', 'Captação']]),
      new Map([['pr1', '#proc-057']]),
    )
    expect(m.get('d1')).toEqual([
      { tipo: 'lead', entidade_id: 'l1', texto: 'Lead · Captação' },
      { tipo: 'processo', entidade_id: 'pr1', texto: '#proc-057' },
    ])
    expect(m.get('d2')).toBeUndefined()
    // Lead que o usuário não enxerga (carteira): etiqueta genérica, sem nome da fase.
    expect(m.get('d3')).toEqual([{ tipo: 'lead', entidade_id: 'l-oculto', texto: 'Lead' }])
  })
})

describe('interpretarBuscaDestino', () => {
  it.each([['57', '#proc-057'], ['proc-57', '#proc-057'], ['#proc-057', '#proc-057'], ['#57', '#proc-057'], ['1234', '#proc-1234']])('%s → número de processo', (b, n) => {
    expect(interpretarBuscaDestino(b)).toEqual({ numeroProcesso: n, texto: null })
  })
  it('texto vira busca por nome; curto demais vira nada', () => {
    expect(interpretarBuscaDestino('  joao ')).toEqual({ numeroProcesso: null, texto: 'joao' })
    expect(interpretarBuscaDestino('j')).toEqual({ numeroProcesso: null, texto: null })
  })
})
