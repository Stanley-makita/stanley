/**
 * O texto do WhatsApp (montarRespostaNormal) tinha dois pontos ainda usando a amortização
 * "errada" mesmo depois da correção de amortizacaoPorBanco no motor e nos PDFs:
 * 1. O cabeçalho usava `dados.tipo_amortizacao` (valor global solicitado) em vez da
 *    amortização do banco vencedor — podiam divergir com amortizacaoPorBanco em uso.
 * 2. O rótulo de amortização por linha ("- SAC"/"- PRICE") só aparecia para bancoId
 *    === 'caixa' (hardcoded), em vez de checar genericamente se o grupo banco+programa
 *    produziu mais de um cenário elegível.
 */
import { describe, it, expect } from 'vitest'
import { executarSimulacao, montarRespostaSimulacao } from '../motor-simulacao'
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
    bancos_ids: ['itau'],
    solicitar_simulacao: true,
    prazo_meses: null,
    tipo_amortizacao: 'PRICE',
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

describe('texto do WhatsApp — amortização', () => {
  it('cabeçalho reflete a amortização do melhor cenário, não o valor global divergente', async () => {
    // tipo_amortizacao global é PRICE, mas o Itaú foi pedido explicitamente em SAC.
    const dados = baseDados({ amortizacao_por_banco: { itau: 'SAC' } })
    const resultado = await executarSimulacao(dados, {})
    expect(resultado.bancosResult?.[0]?.tipoAmortizacao).toBe('SAC') // pré-condição

    const texto = montarRespostaSimulacao(resultado, { nomeDisplay: 'Cliente Teste' })
    const cabecalho = texto.split('\n')[1]
    expect(cabecalho).toContain('SAC')
    expect(cabecalho).not.toContain('PRICE')
  })

  it('rótulo de cenário por linha aparece para a Caixa quando há SAC+PRICE simultâneo', async () => {
    const dados = baseDados({ bancos_ids: ['caixa'], tipo_amortizacao: 'SAC', valor_imovel: 500_000, valor_entrada: 150_000 })
    const resultado = await executarSimulacao(dados, {})
    const texto = montarRespostaSimulacao(resultado, { nomeDisplay: 'Cliente Teste' })

    expect(texto).toMatch(/Caixa.*- (SAC|PRICE)/)
  })

  it('rótulo de cenário não aparece quando o banco só tem um resultado elegível', async () => {
    const dados = baseDados({ amortizacao_por_banco: { itau: 'SAC' } })
    const resultado = await executarSimulacao(dados, {})
    const texto = montarRespostaSimulacao(resultado, { nomeDisplay: 'Cliente Teste' })

    expect(texto).not.toMatch(/Itaú.*- SAC/)
  })
})
