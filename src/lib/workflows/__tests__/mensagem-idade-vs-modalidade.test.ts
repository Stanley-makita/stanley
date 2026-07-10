/**
 * O texto do WhatsApp (montarRespostaSimulacao) checava `motivoInelegivel.includes('idade')`
 * pra decidir se a resposta "idade do cliente é incompatível" deveria aparecer quando
 * nenhum banco fica elegível — mas essa checagem crua dá falso positivo em QUALQUER
 * motivo que mencione a palavra "modalidade" (ex.: "Não oferece financiamento na
 * modalidade PRICE", de um banco que só não suporta PRICE), já que "modalidade" contém
 * "idade" como substring. Corrigido jul/2026 usando `\bidade\b` (limite de palavra).
 *
 * Caso-âncora real: cliente de 39 anos pedindo Bradesco + PRICE — Bradesco não suporta
 * PRICE, e a resposta afirmava (errado) que a idade do cliente era o problema.
 */
import { describe, it, expect } from 'vitest'
import { executarSimulacao, montarRespostaSimulacao } from '../motor-simulacao'
import type { DadosCaptacaoNormalizados } from '../normalizador-captacao'

function baseDados(overrides: Partial<DadosCaptacaoNormalizados>): DadosCaptacaoNormalizados {
  return {
    nome: 'Cliente Teste',
    cpf: null,
    telefone: null,
    data_nascimento: '1987-09-19', // 39 anos — nada de errado com a idade
    cidade_imovel: null,
    tipo_imovel: null,
    valor_imovel: 1_600_000,
    valor_entrada: null,
    valor_financiado: null,
    renda_formal: null,
    renda_informal: null,
    bancos_ids: ['bradesco'], // não suporta PRICE
    solicitar_simulacao: true,
    prazo_meses: null,
    tipo_amortizacao: 'PRICE',
    amortizacao_por_banco: {},
    correntista: false,
    produto: null,
    fgts_valor: null,
    usa_fgts: false,
    todos_bancos: false,
    modo_calculo: 'VALOR_MAXIMO_PELA_RENDA',
    prazo_maximo: true,
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

describe('texto do WhatsApp não confunde "modalidade" com problema de idade', () => {
  it('caso-âncora real: banco que só não suporta PRICE não deve gerar mensagem de idade', async () => {
    const dados = baseDados({})
    const resultado = await executarSimulacao(dados, {})

    const bradesco = resultado.bancosResult?.find((r) => r.bancoId === 'bradesco')
    expect(bradesco?.elegivel).toBe(false)
    expect(bradesco?.motivoInelegivel).toContain('modalidade')

    const texto = montarRespostaSimulacao(resultado, { nomeDisplay: 'Cliente Teste' })
    expect(texto).not.toContain('idade do cliente é incompatível')
  })
})
