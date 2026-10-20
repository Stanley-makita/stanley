import { describe, it, expect } from 'vitest'
import { montarColunasFila } from '../colunasFila'

describe('montarColunasFila', () => {
  it('casa as fases de Configurações pelo nome, não pela posição (caso real 20/10)', () => {
    // Cadastro real: 5 fases, todas com ordem 999 — chegam em qualquer ordem.
    const colunas = montarColunasFila([
      { nome: 'Concluido', cor: '#00fa1d' },
      { nome: 'Aguardando Cliente', cor: '#bc298e' },
      { nome: 'Novo', cor: '#13cd86' },
      { nome: 'Aguardando Resposta', cor: '#2984bc' },
      { nome: 'Em andamento', cor: '#9b6bc2' },
    ])

    expect(colunas.map((c) => [c.label, c.statuses])).toEqual([
      ['Novo', ['pendente']],
      ['Em andamento', ['em_andamento']],
      ['Aguardando Resposta', ['aguardando_resposta']],
      ['Aguardando Cliente', ['aguardando_cliente']],
      ['Concluido (hoje)', ['concluido', 'cancelado']],
    ])
    expect(colunas[1].cor).toBe('#9b6bc2')
    expect(colunas[4].concluidas).toBe(true)
  })

  it('sem fases cadastradas usa nomes e cores padrão', () => {
    const colunas = montarColunasFila([])
    expect(colunas.map((c) => c.label)).toEqual([
      'Novo', 'Em andamento', 'Aguardando resposta', 'Aguardando cliente', 'Concluído (hoje)',
    ])
    expect(colunas.every((c) => c.cor)).toBe(true)
  })

  it('ignora acento, maiúscula e espaço extra; fase desconhecida não desloca nada', () => {
    const colunas = montarColunasFila([
      { nome: 'Triagem', cor: '#000' },
      { nome: '  EM   ANDAMENTO ', cor: '#111' },
      { nome: 'Concluídas', cor: null },
    ])
    expect(colunas[0].label).toBe('Novo')
    expect(colunas[1]).toMatchObject({ label: 'EM   ANDAMENTO', cor: '#111' })
    expect(colunas[4].label).toBe('Concluídas (hoje)')
    expect(colunas[4].cor).toBe('#22C55E')
  })
})
