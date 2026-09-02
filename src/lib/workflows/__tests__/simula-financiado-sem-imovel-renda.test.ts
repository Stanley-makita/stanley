/**
 * Regras de negócio pra *simula com dados incompletos — renda nunca bloqueia a
 * simulação (já era assim), e agora dois cenários adicionais também nunca bloqueiam:
 *
 * - Só valor_financiado informado (sem imóvel, sem nascimento): assume idade 40 anos e
 *   deriva o imóvel a partir do LTV máximo (financiado ÷ 0,8), simula por todos os bancos.
 * - Imóvel + renda informados, sem financiado: financia o máximo pela renda e, quando a
 *   renda é o fator limitante (não o LTV), informa quanto de renda seria necessário pra
 *   financiar o valor máximo permitido.
 */
import { describe, it, expect } from 'vitest'
import { executarSimulacao, montarRespostaSimulacao, validarParaSimulacao } from '../motor-simulacao'
import type { DadosCaptacaoNormalizados } from '../normalizador-captacao'

function baseDados(overrides: Partial<DadosCaptacaoNormalizados>): DadosCaptacaoNormalizados {
  return {
    nome: 'Cliente Teste',
    cpf: null,
    telefone: null,
    data_nascimento: null,
    cidade_imovel: null,
    tipo_imovel: null,
    valor_imovel: null,
    valor_entrada: null,
    valor_financiado: null,
    renda_formal: null,
    renda_informal: null,
    bancos_ids: [],
    solicitar_simulacao: true,
    prazo_meses: null,
    tipo_amortizacao: 'SAC',
    tipo_amortizacao_ambas: false,
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
    idade_assumida_valor_financiado: false,
    renda_necessaria_para_maximo: null,
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

describe('só valor_financiado informado — nunca deixa sem simulação', () => {
  it('validarParaSimulacao não bloqueia (sem imóvel, sem nascimento, com financiado)', () => {
    const validacao = validarParaSimulacao(baseDados({ valor_financiado: 120_000 }))
    expect(validacao.valido).toBe(true)
    expect(validacao.camposFaltantes).toEqual([])
  })

  it('assume idade 40 anos e imóvel = financiado ÷ 0,8, simula por todos os bancos', async () => {
    const dados = baseDados({ valor_financiado: 120_000, todos_bancos: false, bancos_ids: [] })
    const resultado = await executarSimulacao(dados, {})

    expect(resultado.dados.idade_assumida_valor_financiado).toBe(true)
    expect(resultado.dados.valor_imovel).toBe(150_000) // 120_000 / 0.8
    expect(resultado.dados.data_nascimento).not.toBeNull()
    expect(resultado.bancosResult!.length).toBeGreaterThan(1) // "todos os bancos"

    const texto = montarRespostaSimulacao(resultado, { nomeDisplay: 'Cliente' })
    expect(texto).toContain('idade até 40 anos')
  })
})

describe('imóvel + renda informados, sem valor_financiado — financia o máximo pela renda', () => {
  it('quando a renda é o fator limitante, informa a renda necessária pro valor máximo (LTV)', async () => {
    // Renda propositalmente baixa pra não cobrir os 80% de LTV de um imóvel de 1M.
    const dados = baseDados({
      valor_imovel: 1_000_000,
      data_nascimento: '1990-05-10',
      renda_formal: 3_000,
      bancos_ids: ['caixa'],
    })
    const resultado = await executarSimulacao(dados, {})

    expect(resultado.dados.valor_financiado).toBeLessThan(800_000) // não chegou nos 80% de LTV
    expect(resultado.dados.renda_necessaria_para_maximo).not.toBeNull()
    expect(resultado.dados.renda_necessaria_para_maximo!).toBeGreaterThan(3_000)

    const texto = montarRespostaSimulacao(resultado, { nomeDisplay: 'Cliente' })
    expect(texto).toContain('renda necessária seria de aproximadamente')
  })

  it('quando a renda já cobre os 80% de LTV, não mostra o aviso de renda necessária', async () => {
    const dados = baseDados({
      valor_imovel: 300_000,
      data_nascimento: '1990-05-10',
      renda_formal: 30_000, // renda alta o suficiente pra cobrir o teto de LTV
      bancos_ids: ['caixa'],
    })
    const resultado = await executarSimulacao(dados, {})

    expect(resultado.dados.renda_necessaria_para_maximo).toBeNull()
  })
})

describe('dados completos — segue o fluxo normal, sem nenhuma suposição', () => {
  it('imóvel + financiado + renda + nascimento informados: nenhuma flag de suposição é ativada', async () => {
    const dados = baseDados({
      valor_imovel: 500_000,
      valor_entrada: 100_000,
      valor_financiado: 400_000,
      data_nascimento: '1990-05-10',
      renda_formal: 10_000,
      bancos_ids: ['caixa'],
    })
    const resultado = await executarSimulacao(dados, {})

    expect(resultado.dados.idade_assumida_valor_financiado).toBe(false)
    expect(resultado.dados.renda_necessaria_para_maximo).toBeNull()
    expect(resultado.dados.valor_financiado).toBe(400_000) // não foi recalculado
  })
})
