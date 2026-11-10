import { describe, it, expect } from 'vitest'
import { filtrarPorBusca, inicioDoPeriodo } from '../buscaFila'
import type { SolicitacaoOperacional } from '@/types/solicitacoes-operacionais'

const sol = (id: string, extra: Partial<SolicitacaoOperacional>) => ({ id, titulo: '', ...extra }) as SolicitacaoOperacional

const lista = [
  sol('lead', { titulo: '[ANÁLISE DE CRÉDITO] SERGIO FLAVIO PIFFER CROZATTI — financiamento', lead: { id: 'l', nome: 'SERGIO FLAVIO PIFFER CROZATTI' } }),
  sol('proc', {
    titulo: '[SIMULAÇÃO] Processo #57 — Itaú',
    processo: {
      id: 'p', nome_imovel: 'Apto Centro', numero_processo: '57',
      participantes: [{ id: 'x', papel: 'titular', ordem: 0, pessoa: { id: 'm', nome: 'Márcia Gonçalves', cpf: null } }],
    },
  }),
  sol('pessoa', { titulo: '[DOCUMENTOS]', pessoa: { id: 'j', nome: 'Jaqueline Macena' } }),
]

describe('filtrarPorBusca', () => {
  it('acha pelo nome do lead, sem acento/maiúscula e com palavras fora de ordem', () => {
    expect(filtrarPorBusca(lista, 'crozatti sergio').map(s => s.id)).toEqual(['lead'])
  })
  it('acha negócio pelo comprador (participações), mesmo sem o nome no título', () => {
    expect(filtrarPorBusca(lista, 'marcia goncalves').map(s => s.id)).toEqual(['proc'])
  })
  it('acha pelo número do processo e pela pessoa', () => {
    expect(filtrarPorBusca(lista, '57').map(s => s.id)).toEqual(['proc'])
    expect(filtrarPorBusca(lista, 'jaqueline').map(s => s.id)).toEqual(['pessoa'])
  })
  it('busca vazia devolve tudo', () => {
    expect(filtrarPorBusca(lista, '   ')).toHaveLength(3)
  })
})

describe('inicioDoPeriodo', () => {
  const agora = new Date(2026, 10, 10, 17, 30)
  it('"últimos 5 dias" começa à meia-noite de 4 dias atrás (inclui hoje)', () => {
    expect(inicioDoPeriodo('5', agora)).toBe(new Date(2026, 10, 6, 0, 0).toISOString())
  })
  it('90 dias e "qualquer data"', () => {
    expect(inicioDoPeriodo('90', agora)).toBe(new Date(2026, 7, 13, 0, 0).toISOString())
    expect(inicioDoPeriodo('todos', agora)).toBeUndefined()
  })
})
