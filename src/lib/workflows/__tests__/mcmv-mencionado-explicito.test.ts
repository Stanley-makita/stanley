/**
 * Pedido do usuário: quando MCMV/Minha Casa Minha Vida é citado explicitamente (sigla ou
 * variações de digitação — PMCMV, MCMVV, MDMV, "minha casa mv") JUNTO com a renda, a
 * simulação deve mostrar SOMENTE o resultado MCMV da Caixa — nenhum outro banco/programa
 * (SBPE, Pró-Cotista, demais bancos) participa, porque "outros bancos não atuam (por
 * enquanto)". Sem renda, ver mcmv-renda-nao-informada.test.ts / etapa 3.5 de
 * workflow-consulta.ts (pendência pedindo a renda antes de simular).
 */
import { describe, it, expect } from 'vitest'
import { detectarMcmvMencionado } from '../normalizador-captacao'
import { executarSimulacao, resolverBancos, montarRespostaSimulacao } from '../motor-simulacao'
import type { DadosCaptacaoNormalizados } from '../normalizador-captacao'

function baseDados(overrides: Partial<DadosCaptacaoNormalizados>): DadosCaptacaoNormalizados {
  return {
    nome: 'Cliente Teste',
    cpf: null,
    telefone: null,
    data_nascimento: '1972-11-13',
    cidade_imovel: null,
    tipo_imovel: null,
    valor_imovel: 450_000,
    valor_entrada: null,
    valor_financiado: null,
    renda_formal: 7_000,
    renda_informal: null,
    bancos_ids: [],
    solicitar_simulacao: true,
    prazo_meses: null,
    tipo_amortizacao: 'SAC',
    tipo_amortizacao_ambas: false,
    amortizacao_por_banco: {},
    correntista: false,
    produto: 'MCMV',
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
    mcmv_mencionado: true,
    ...overrides,
  }
}

describe('detectarMcmvMencionado — variações de digitação', () => {
  it.each([
    'minha casa minha vida',
    'MCMV',
    'pmcmv',
    'mcmvv',
    'mdmv',
    'minha casa mv',
    'Nascimento 13/11/1972, imovel 450 mil, MiNhA CaSa MiNhA ViDa, renda 7000',
  ])('reconhece "%s"', (texto) => {
    expect(detectarMcmvMencionado(texto)).toBe(true)
  })

  it.each([
    'financiamento normal pela caixa',
    'sbpe',
    'mc mv', // não é uma variação real, não deve casar por engano
  ])('não reconhece "%s"', (texto) => {
    expect(detectarMcmvMencionado(texto)).toBe(false)
  })
})

describe('resolverBancos — MCMV mencionado restringe à Caixa', () => {
  it('ignora bancos pedidos explicitamente quando MCMV foi mencionado', () => {
    const dados = baseDados({ bancos_ids: ['itau', 'bradesco'], mcmv_mencionado: true })
    expect(resolverBancos(dados)).toEqual(['caixa'])
  })
})

describe('executarSimulacao — MCMV mencionado + renda informada', () => {
  it('mostra somente o MCMV da Caixa, sem SBPE/Pró-Cotista/outros bancos', async () => {
    const dados = baseDados({})
    const resultado = await executarSimulacao(dados, {})
    expect(resultado.bancosIds).toEqual(['caixa'])
    const programas = Array.from(new Set((resultado.bancosResult ?? []).map((r) => r.programa)))
    programas.forEach((p) => expect(p).toMatch(/MCMV/))
    expect(resultado.mcmvSemEnquadramento).toBe(false)
  })

  it('cliente fora de todas as faixas (renda acima do teto) não gera resultado, com mensagem específica', async () => {
    const dados = baseDados({ renda_formal: 50_000 })
    const resultado = await executarSimulacao(dados, {})
    expect(resultado.bancosResult).toEqual([])
    expect(resultado.mcmvSemEnquadramento).toBe(true)

    const resposta = montarRespostaSimulacao(resultado, { nomeDisplay: 'Cliente Teste' })
    expect(resposta).toMatch(/não se enquadra no MCMV/i)
  })

  it('imóvel acima do teto máximo do programa não gera resultado, com mensagem específica', async () => {
    const dados = baseDados({ valor_imovel: 900_000 })
    const resultado = await executarSimulacao(dados, {})
    expect(resultado.mcmvSemEnquadramento).toBe(true)

    const resposta = montarRespostaSimulacao(resultado, { nomeDisplay: 'Cliente Teste' })
    expect(resposta).toMatch(/não se enquadra no MCMV/i)
    expect(resposta).toMatch(/valor do imóvel/i)
  })
})
