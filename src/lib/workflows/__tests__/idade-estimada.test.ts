/**
 * Idade estimada (não confirmada por data de nascimento completa) não pode ser tratada
 * como dado documental — nem no cálculo (isso já era assim), nem na exibição. Este teste
 * cobre a propagação de InputFinanciamento.idadeEstimada a partir de dois cenários:
 * "prazo máximo" pedido sem nascimento (idade assumida) e nascimento informado como
 * "X anos" (idade aproximada).
 */
import { describe, it, expect } from 'vitest'
import { executarSimulacao } from '../motor-simulacao'
import type { DadosCaptacaoNormalizados } from '../normalizador-captacao'

function baseDados(overrides: Partial<DadosCaptacaoNormalizados>): DadosCaptacaoNormalizados {
  return {
    nome: 'Cliente Teste',
    cpf: null,
    telefone: null,
    data_nascimento: '1990-06-15',
    cidade_imovel: 'Maringá',
    tipo_imovel: 'usado',
    valor_imovel: 900_000,
    valor_entrada: 350_000,
    valor_financiado: null,
    renda_formal: 20_000,
    renda_informal: null,
    bancos_ids: ['caixa'],
    solicitar_simulacao: true,
    prazo_meses: null,
    tipo_amortizacao: 'SAC',
    amortizacao_por_banco: {},
    correntista: false,
    produto: null,
    fgts_valor: null,
    usa_fgts: false,
    todos_bancos: false,
    modo_calculo: null,
    prazo_maximo: false,
    prazos_detectados: null,
    produto_normalizado: 'AQUISICAO',
    usou_idade_aproximada: false,
    idade_assumida_prazo_maximo: false,
    conflito_valores: false,
    conflito_valores_descricao: null,
    tipo_operacao: 'aquisicao',
    finalidade_efetiva: 'residencial',
    valor_terreno: null,
    valor_obra: null,
    pedir_esclarecimento_operacao: false,
    pergunta_esclarecimento: null,
    valores_ambiguos_brutos: null,
    ...overrides,
  }
}

describe('idadeEstimada (InputFinanciamento)', () => {
  it('data de nascimento completa e confirmada: idadeEstimada é falsy', async () => {
    const resultado = await executarSimulacao(baseDados({}), {})
    expect(resultado.input?.idadeEstimada).toBeFalsy()
  })

  it('"prazo máximo" sem data de nascimento: idadeEstimada é true (idade assumida)', async () => {
    const dados = baseDados({ data_nascimento: null, prazo_maximo: true })
    const resultado = await executarSimulacao(dados, {})
    expect(resultado.dados.idade_assumida_prazo_maximo).toBe(true)
    expect(resultado.input?.idadeEstimada).toBe(true)
  })

  it('nascimento informado como "X anos": idadeEstimada é true (idade aproximada)', async () => {
    const dados = baseDados({ usou_idade_aproximada: true })
    const resultado = await executarSimulacao(dados, {})
    expect(resultado.input?.idadeEstimada).toBe(true)
  })
})
