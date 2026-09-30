import { describe, expect, it, vi } from 'vitest'
import { planejarContrato } from '../planejarContrato'
import { validarRespostaResumo } from '../validarRespostaResumo'

vi.mock('@anthropic-ai/sdk', () => ({ default: class { constructor() { throw new Error('Planejamento não pode chamar IA') } } }))

const dados = { compradores: [], vendedores: [], imovel: {}, painel_inteligencia: [], testemunhas: [], certidoes: [] }

describe('plano e dados estruturados', () => {
  it('plano lista as cláusulas reais do modelo, sem chamada à IA', async () => {
    const plano = await planejarContrato({ tipoContrato: 'compra_venda', resumo: validarRespostaResumo({ ...dados, valor_financiado: 320000 }) })
    expect(plano.clausulas.filter(c => c.tipo === 'padrao')).toHaveLength(16)
    expect(plano.clausulas.some(c => c.texto.includes('negativa'))).toBe(true)
  })
  it('não inclui financiamento na compra à vista', async () => {
    const plano = await planejarContrato({ tipoContrato: 'compra_venda', resumo: validarRespostaResumo({ ...dados, saldo: 'a_vista' }) })
    expect(plano.clausulas.some(c => c.tipo === 'condicional')).toBe(false)
  })
  it('rejeita listas nulas ou preço em texto antes de persistir o resumo', () => {
    expect(() => validarRespostaResumo({ ...dados, compradores: null })).toThrow('dados incompletos')
    expect(() => validarRespostaResumo({ ...dados, valor: '570 mil' })).toThrow('dados incompletos')
  })
  it('preserva e-mail e múltiplos intermediadores no resumo validado', () => {
    const resumo = validarRespostaResumo({ ...dados, compradores: [{ nome: 'Maria', email: 'maria@example.com', data_casamento: '2020-10-10' }], intermediadores: [{ nome: 'Corretor', valor: 14250 }, { nome: 'Imobiliária', valor: 19950 }] })
    expect(resumo.compradores[0].email).toBe('maria@example.com')
    expect(resumo.compradores[0].data_casamento).toBe('2020-10-10')
    expect(resumo.intermediadores).toHaveLength(2)
  })
})
