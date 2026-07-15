import { describe, it, expect } from 'vitest'
import { substituirVariaveis } from '../substituirVariaveis'

describe('substituirVariaveis', () => {
  it('substitui variáveis presentes', () => {
    const resultado = substituirVariaveis('Olá {{comprador_nome}}, seu banco é {{banco}}.', {
      comprador_nome: 'Maria',
      banco: 'Itaú',
    })
    expect(resultado).toBe('Olá Maria, seu banco é Itaú.')
  })

  it('usa fallback [A PREENCHER] para variável ausente/nula', () => {
    const resultado = substituirVariaveis('Etapa atual: {{fase_atual}}', {
      comprador_nome: 'Maria',
      fase_atual: null,
    })
    expect(resultado).toBe('Etapa atual: [A PREENCHER]')
  })

  it('usa fallback para variável não reconhecida (fora do dicionário)', () => {
    const resultado = substituirVariaveis('Valor: {{variavel_inexistente}}', {
      comprador_nome: 'Maria',
    })
    expect(resultado).toBe('Valor: [A PREENCHER]')
  })

  it('formata valor_financiamento como moeda BRL', () => {
    const resultado = substituirVariaveis('Valor: {{valor_financiamento}}', {
      comprador_nome: 'Maria',
      valor_financiamento: 350000,
    })
    expect(resultado).toContain('R$')
    expect(resultado).toContain('350.000,00')
  })

  it('substitui a mesma variável repetida no corpo', () => {
    const resultado = substituirVariaveis('{{comprador_nome}}, {{comprador_nome}}!', {
      comprador_nome: 'Ana',
    })
    expect(resultado).toBe('Ana, Ana!')
  })

  it('não altera texto sem placeholders', () => {
    const resultado = substituirVariaveis('Mensagem sem variáveis.', { comprador_nome: 'Ana' })
    expect(resultado).toBe('Mensagem sem variáveis.')
  })
})
