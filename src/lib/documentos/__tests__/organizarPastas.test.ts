import { describe, it, expect } from 'vitest'
import { inferirPastaSugerida } from '@/lib/documentos'
import {
  precisaClassificar, tipoPermitePularClassificacao,
  planejarGravacaoPastas, filtrarDocumentosDoLead,
} from '../organizarPastas'

describe('inferirPastaSugerida com pastaDoLeadCodigo', () => {
  it('pasta escolhida no lead vence papel e tipo', () => {
    expect(inferirPastaSugerida({
      documentoPessoaId: 'p1', pastaSugeridaCodigoDoTipo: 'comprador',
      pessoasCompradorasIds: ['p1'], pessoasVendedorasIds: [],
      pastaDoLeadCodigo: 'extra',
    })).toBe('extra')
  })
  it('sem pasta do lead, mantém a regra antiga (papel > tipo)', () => {
    expect(inferirPastaSugerida({
      documentoPessoaId: 'v1', pastaSugeridaCodigoDoTipo: 'comprador',
      pessoasCompradorasIds: [], pessoasVendedorasIds: ['v1'], pastaDoLeadCodigo: null,
    })).toBe('vendedor')
  })
})

describe('inferirPastaSugerida com subpastas do comprador', () => {
  const base = { pessoasCompradorasIds: ['c1'], pessoasVendedorasIds: ['v1'], pastaDoLeadCodigo: null }
  it('documento do comprador vai para a subpasta do tipo', () => {
    expect(inferirPastaSugerida({ ...base, documentoPessoaId: 'c1', pastaSugeridaCodigoDoTipo: 'comprador_renda' })).toBe('comprador_renda')
    expect(inferirPastaSugerida({ ...base, documentoPessoaId: 'c1', pastaSugeridaCodigoDoTipo: 'comprador_fgts' })).toBe('comprador_fgts')
    expect(inferirPastaSugerida({ ...base, documentoPessoaId: 'c1', pastaSugeridaCodigoDoTipo: 'comprador_pessoais' })).toBe('comprador_pessoais')
  })
  it('comprador com tipo sem subpasta (ou desconhecido) fica na raiz de 01 Comprador', () => {
    expect(inferirPastaSugerida({ ...base, documentoPessoaId: 'c1', pastaSugeridaCodigoDoTipo: 'imovel' })).toBe('comprador')
    expect(inferirPastaSugerida({ ...base, documentoPessoaId: 'c1', pastaSugeridaCodigoDoTipo: null })).toBe('comprador')
  })
  it('vendedor não tem subpastas', () => {
    expect(inferirPastaSugerida({ ...base, documentoPessoaId: 'v1', pastaSugeridaCodigoDoTipo: 'comprador_renda' })).toBe('vendedor')
  })
  it('sem papel, vale a pasta do tipo', () => {
    expect(inferirPastaSugerida({ ...base, documentoPessoaId: 'x', pastaSugeridaCodigoDoTipo: 'comprador_pessoais' })).toBe('comprador_pessoais')
  })
})

describe('precisaClassificar', () => {
  it('nulo, vazio e auto precisam', () => {
    expect(precisaClassificar(null)).toBe(true)
    expect(precisaClassificar('')).toBe(true)
    expect(precisaClassificar('auto')).toBe(true)
  })
  it('tipo já conhecido (inclusive outro) não chama a IA de novo', () => {
    expect(precisaClassificar('rg')).toBe(false)
    expect(precisaClassificar('outro')).toBe(false)
    expect(precisaClassificar('matricula')).toBe(false)
  })
})

describe('tipoPermitePularClassificacao (Extrair dados)', () => {
  it('pula só com tipo que a classificação reconhece e não é outro', () => {
    expect(tipoPermitePularClassificacao('cnh')).toBe(true)
    expect(tipoPermitePularClassificacao('extrato_bancario')).toBe(true)
    expect(tipoPermitePularClassificacao('outro')).toBe(false)
    expect(tipoPermitePularClassificacao('auto')).toBe(false)
    expect(tipoPermitePularClassificacao('matricula')).toBe(false)
    expect(tipoPermitePularClassificacao(null)).toBe(false)
  })
})

describe('planejarGravacaoPastas', () => {
  it('atualiza quem já tem vínculo com o lead e cria vínculo pra doc só da Pessoa', () => {
    const r = planejarGravacaoPastas(
      [{ documento_id: 'd1', pasta_id: 'pA' }, { documento_id: 'd2', pasta_id: 'pB' }],
      new Set(['d1']),
    )
    expect(r.atualizar).toEqual([{ documento_id: 'd1', pasta_id: 'pA' }])
    expect(r.criar).toEqual([{ documento_id: 'd2', pasta_id: 'pB' }])
  })
  it('doc só da Pessoa com pasta nula não cria vínculo vazio', () => {
    const r = planejarGravacaoPastas([{ documento_id: 'd2', pasta_id: null }], new Set())
    expect(r.criar).toEqual([])
    expect(r.atualizar).toEqual([])
  })
  it('doc com vínculo pode voltar pra Sem pasta (pasta nula)', () => {
    const r = planejarGravacaoPastas([{ documento_id: 'd1', pasta_id: null }], new Set(['d1']))
    expect(r.atualizar).toEqual([{ documento_id: 'd1', pasta_id: null }])
  })
})

describe('filtrarDocumentosDoLead', () => {
  it('ignora id que não pertence ao lead (payload adulterado)', () => {
    const permitidos = [{ id: 'd1' }, { id: 'd2' }]
    expect(filtrarDocumentosDoLead(['d1', 'x-de-outro-lead'], permitidos)).toEqual([{ id: 'd1' }])
  })
})
