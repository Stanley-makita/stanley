import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  agruparProducaoRelacionamentos,
  carregarProducaoRelacionamentos,
  type ProcessoProducaoRelacionamentos,
} from '../producaoRelacionamentos'

function processo(id: string, campos: Partial<ProcessoProducaoRelacionamentos> = {}): ProcessoProducaoRelacionamentos {
  return { id, valor_financiado: 100000, corretores: [], parceiros: [], parceiro: null, imobiliarias: [], ...campos }
}
const ana = { id: 'ana', nome: 'Ana' }
const bia = { id: 'bia', nome: 'Bia' }

describe('produção por relacionamento', () => {
  it('conta uma vez por corretor mesmo com vários papéis e não multiplica pelos outros vínculos', () => {
    const p = processo('1', {
      corretores: [{ corretor: ana }, { corretor: ana }, { corretor: bia }],
      parceiros: [{ parceiro: ana }, { parceiro: bia }],
    })
    expect(agruparProducaoRelacionamentos([p, p], 'corretor')).toEqual([
      { ...ana, contratos: 1, valorEmitido: 100000, ticketMedio: 100000 },
      { ...bia, contratos: 1, valorEmitido: 100000, ticketMedio: 100000 },
    ])
  })

  it('une o parceiro direto e a tabela de vínculos sem duplicar e preserva o legado', () => {
    const resultado = agruparProducaoRelacionamentos([
      processo('1', { parceiro: ana, parceiros: [{ parceiro: ana }, { parceiro: bia }] }),
      processo('2', { parceiro: ana, valor_financiado: '300000.50' }),
    ], 'parceiro')
    expect(resultado).toEqual([
      { ...ana, contratos: 2, valorEmitido: 400000.5, ticketMedio: 200000.25 },
      { ...bia, contratos: 1, valorEmitido: 100000, ticketMedio: 100000 },
    ])
  })

  it('considera imobiliárias pelo papel no negócio e exclui construtora/vendedora', () => {
    const resultado = agruparProducaoRelacionamentos([processo('1', {
      imobiliarias: [
        { papel: 'imobiliaria', imobiliaria: ana },
        { papel: 'vendedora', imobiliaria: ana },
        { papel: 'construtora', imobiliaria: bia },
      ],
    })], 'imobiliaria')
    expect(resultado).toEqual([{ ...ana, contratos: 1, valorEmitido: 100000, ticketMedio: 100000 }])
  })

  it('separa homônimos pelo ID e mantém entidades sem filtro de ativo', () => {
    const resultado = agruparProducaoRelacionamentos([processo('1', {
      corretores: [{ corretor: ana }, { corretor: { id: 'outra-ana', nome: 'Ana' } }],
    })], 'corretor')
    expect(resultado.map((r) => r.id)).toEqual(['ana', 'outra-ana'])
  })

  it.each(['corretor', 'parceiro', 'imobiliaria'] as const)('inclui emissões sem %s e valor nulo sem perder contratos', (tipo) => {
    const resultado = agruparProducaoRelacionamentos([
      processo('1', { valor_financiado: null, corretores: null, parceiros: null, imobiliarias: null }),
      processo('2', { valor_financiado: 200 }),
    ], tipo)
    expect(resultado).toHaveLength(1)
    expect(resultado[0]).toMatchObject({ id: 'sem-vinculo', contratos: 2, valorEmitido: 200, ticketMedio: 100 })
    expect(agruparProducaoRelacionamentos([], tipo)).toEqual([])
  })

  it('ordena por valor emitido, não por quantidade de contratos', () => {
    const resultado = agruparProducaoRelacionamentos([
      processo('1', { parceiro: ana, valor_financiado: 10 }),
      processo('2', { parceiro: ana, valor_financiado: 20 }),
      processo('3', { parceiro: bia, valor_financiado: 100 }),
    ], 'parceiro')
    expect(resultado.map((r) => r.id)).toEqual(['bia', 'ana'])
  })
})

function mockConsulta(paginas: { data: ProcessoProducaoRelacionamentos[] | null; error: Error | null }[]) {
  const consulta = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(), abortSignal: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(paginas.shift()).then(resolve),
  }
  const from = vi.fn().mockReturnValue(consulta)
  return { consulta, from, client: { from } as unknown as SupabaseClient }
}

describe('consulta de produção', () => {
  it('pagina todas as emissões e restringe empresa, exclusões e período inclusivo', async () => {
    const primeira = Array.from({ length: 500 }, (_, i) => processo(String(i)))
    const { client, consulta, from } = mockConsulta([
      { data: primeira, error: null }, { data: [processo('500')], error: null },
    ])
    const signal = new AbortController().signal
    const dados = await carregarProducaoRelacionamentos(client, 'empresa-1', '2026-09-01', '2026-09-30', signal)
    expect(dados).toHaveLength(501)
    expect(from).toHaveBeenCalledTimes(2)
    expect(from).toHaveBeenCalledWith('processos')
    expect(consulta.eq).toHaveBeenCalledWith('empresa_id', 'empresa-1')
    expect(consulta.eq).toHaveBeenCalledWith('status_emissao', 'emitido')
    expect(consulta.is).toHaveBeenCalledWith('deleted_at', null)
    expect(consulta.gte).toHaveBeenCalledWith('data_emissao', '2026-09-01')
    expect(consulta.lte).toHaveBeenCalledWith('data_emissao', '2026-09-30')
    expect(consulta.order).toHaveBeenCalledWith('id', { ascending: true })
    expect(consulta.range.mock.calls).toEqual([[0, 499], [500, 999]])
    expect(consulta.abortSignal).toHaveBeenCalledWith(signal)
  })

  it('propaga erro em página posterior em vez de mostrar um total parcial', async () => {
    const erro = new Error('Falha de rede')
    const { client } = mockConsulta([
      { data: Array.from({ length: 500 }, (_, i) => processo(String(i))), error: null },
      { data: null, error: erro },
    ])
    await expect(carregarProducaoRelacionamentos(client, 'empresa-1', '2026-09-01', '2026-09-30')).rejects.toBe(erro)
  })
})
