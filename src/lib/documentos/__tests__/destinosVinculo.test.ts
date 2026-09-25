import { describe, it, expect, vi } from 'vitest'
import { criarFakeDb } from './helpers/fakeDb'

vi.mock('@/lib/bot/fonti-comandos', () => ({ STATUS_BLOQUEADOS_PROCESSO: ['reprovado', 'cancelado'] }))

const base = () => criarFakeDb({
  leads: [
    { id: 'l1', nome: 'Joao do oculos', pessoa_id: 'p1', conjuge_pessoa_id: null, deleted_at: null, status_analise: 'aguardando_documentos', fase: { nome: 'Captação' } },
    { id: 'l-fechado', nome: 'Joao do oculos', pessoa_id: 'p1', conjuge_pessoa_id: null, deleted_at: null, status_analise: 'convertido_em_processo', fase: { nome: 'Convertido' } },
    { id: 'l-outro', nome: 'Joao PEde Feijao', pessoa_id: 'p2', conjuge_pessoa_id: null, deleted_at: null, status_analise: 'novo', fase: { nome: 'Captação' } },
  ],
  processo_compradores: [{ processo_id: 'pr1', pessoa_id: 'p1' }],
  processo_vendedores: [],
  processos: [
    { id: 'pr1', numero_processo: '#proc-010', deleted_at: null, status_processo: 'em_analise', banco: { nome: 'Caixa' } },
    { id: 'pr57', numero_processo: '#proc-057', deleted_at: null, status_processo: 'em_analise', banco: null },
  ],
  pessoas: [{ id: 'p1', nome: 'Joao do oculos' }, { id: 'p2', nome: 'Joao PEde Feijao' }],
})

describe('buscarDestinos', () => {
  it('sem busca: leads abertos e negócios da pessoa, marcados como participante', async () => {
    const { buscarDestinos } = await import('../destinosVinculo')
    const r = await buscarDestinos(base() as never, 'p1', '')
    expect(r).toEqual([
      { entidade_tipo: 'lead', entidade_id: 'l1', titulo: 'Lead · Joao do oculos', subtitulo: 'Captação', pessoa_participa: true },
      { entidade_tipo: 'processo', entidade_id: 'pr1', titulo: '#proc-010', subtitulo: 'Caixa', pessoa_participa: true },
    ])
  })

  it('busca por número acha negócio onde a pessoa não participa', async () => {
    const { buscarDestinos } = await import('../destinosVinculo')
    const r = await buscarDestinos(base() as never, 'p1', '57')
    expect(r.at(-1)).toEqual({ entidade_tipo: 'processo', entidade_id: 'pr57', titulo: '#proc-057', subtitulo: null, pessoa_participa: false })
  })

  it('busca por nome acha lead de outra pessoa sem repetir os da própria', async () => {
    const { buscarDestinos } = await import('../destinosVinculo')
    const r = await buscarDestinos(base() as never, 'p1', 'joao')
    expect(r.filter(d => d.entidade_id === 'l1')).toHaveLength(1)
    expect(r.find(d => d.entidade_id === 'l-outro')).toMatchObject({ pessoa_participa: false })
    expect(r.find(d => d.entidade_id === 'l-fechado')).toBeUndefined()
  })
})
