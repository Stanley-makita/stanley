/**
 * Duas correções relacionadas a "imóvel acima do teto", 2026-07-13:
 *
 * 1. Caixa: imóvel acima do teto SFH (`maxValorImovel`, R$2.250.000) NÃO deveria tornar o
 *    SBPE inelegível — o simulador oficial (caixa.gov.br, testado com imóvel
 *    R$5.800.000,00) mostra que ele continua respondendo normalmente, só trocando a taxa
 *    SFH pela SFI (mais alta). Antes desta correção, o motor rejeitava a Caixa por
 *    completo ("imóvel acima do teto"), e o texto do WhatsApp ainda piorava isso: ao ver
 *    `bancosResult` vazio, caía num diagnóstico de renda genérico e contraditório ("renda
 *    insuficiente" com capacidade estimada de R$6M+, maior que o valor pedido).
 *
 * 2. Para bancos que realmente têm um teto rígido (sem equivalente SFI, ex.: Daycoval), o
 *    texto do WhatsApp, quando nenhum banco fica elegível, só distinguia idade (regex
 *    `\bidade\b`) de "qualquer outro motivo" — e tratava qualquer outro motivo, incluindo
 *    "imóvel acima do teto", como se fosse problema de renda. Corrigido para reconhecer
 *    "acima do teto" separadamente.
 */
import { describe, it, expect } from 'vitest'
import { executarSimulacao, montarRespostaSimulacao } from '../motor-simulacao'
import type { DadosCaptacaoNormalizados } from '../normalizador-captacao'

function baseDados(overrides: Partial<DadosCaptacaoNormalizados>): DadosCaptacaoNormalizados {
  return {
    nome: 'Cliente Teste',
    cpf: null,
    telefone: null,
    data_nascimento: '1981-01-01',
    cidade_imovel: null,
    tipo_imovel: null,
    valor_imovel: 5_800_000,
    valor_entrada: 1_160_000,
    valor_financiado: 4_640_000,
    renda_formal: 250_000,
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

describe('Caixa acima do teto SFH usa taxa SFI em vez de rejeitar', () => {
  it('caso-âncora real: imóvel R$5.800.000,00 fica elegível via SBPE/SFI (12% a.a.), como no simulador oficial', async () => {
    const dados = baseDados({})
    const resultado = await executarSimulacao(dados, {})

    const caixa = resultado.bancosResult?.find((r) => r.bancoId === 'caixa')
    expect(caixa?.elegivel).toBe(true)
    expect(caixa?.taxaAnual).toBeCloseTo(0.12, 4)
    // Simulador oficial (caixa.gov.br, mesmos dados): 1ª parcela R$56.654,23 (Taxa Balcão)
    expect(caixa?.primeiraParcela).toBeCloseTo(56_654.23, -1)

    const texto = montarRespostaSimulacao(resultado, { nomeDisplay: 'Cliente Teste' })
    expect(texto).not.toContain('a renda informada é insuficiente')
    expect(texto).not.toContain('acima do teto')
  })
})

describe('texto do WhatsApp não confunde "imóvel acima do teto" com problema de renda', () => {
  it('banco com teto rígido sem equivalente SFI (Daycoval) gera mensagem de teto, não de renda', async () => {
    const dados = baseDados({ bancos_ids: ['daycoval'], valor_imovel: 1_500_000, valor_entrada: 700_000, valor_financiado: 800_000 })
    const resultado = await executarSimulacao(dados, {})

    const daycoval = resultado.bancosResult?.find((r) => r.bancoId === 'daycoval')
    expect(daycoval?.elegivel).toBe(false)
    expect(daycoval?.motivoInelegivel).toContain('acima do teto')

    const texto = montarRespostaSimulacao(resultado, { nomeDisplay: 'Cliente Teste' })
    expect(texto).not.toContain('a renda informada é insuficiente')
    expect(texto).toContain('acima do teto')
  })
})
