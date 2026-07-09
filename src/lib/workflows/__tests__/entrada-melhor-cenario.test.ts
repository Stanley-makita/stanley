/**
 * "Dados da Simulação" (PDF, gerarPDFBuffer.ts) e o cabeçalho do texto do WhatsApp
 * (motor-simulacao.ts) mostravam a entrada genérica derivada por
 * `autoDerivarEntradaFinanciado` — que fica desatualizada desde que "financiando valor
 * máximo" passou a recalcular a entrada por programa e por sistema (SAC/PRICE, cada um
 * com sua própria cota/comprometimento de renda — ver construirCenariosCaixa, engine.ts).
 * Corrigido jul/2026 pra usar a entrada do CENÁRIO VENCEDOR (melhor resultado elegível),
 * a mesma que aparece no card "Melhor Cenário"/na 1ª linha da lista de bancos.
 *
 * Caso-âncora real: renda R$5.000, imóvel R$250.000 novo, "financiando valor máximo" —
 * melhor cenário é MCMV Faixa 2 PRICE, financiado R$190.460 (entrada real R$59.540), mas
 * o cabeçalho mostrava R$126.666 (a estimativa genérica, sem relação com o resultado).
 */
import { describe, it, expect } from 'vitest'
import { executarSimulacao, montarRespostaSimulacao } from '../motor-simulacao'
import type { DadosCaptacaoNormalizados } from '../normalizador-captacao'

function baseDados(overrides: Partial<DadosCaptacaoNormalizados>): DadosCaptacaoNormalizados {
  return {
    nome: 'Cliente Teste',
    cpf: null,
    telefone: null,
    data_nascimento: '2000-02-20',
    cidade_imovel: 'Maringá',
    tipo_imovel: 'novo',
    valor_imovel: 250_000,
    valor_entrada: null,
    valor_financiado: null,
    renda_formal: 5_000,
    renda_informal: null,
    bancos_ids: ['caixa'],
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

describe('cabeçalho do texto do WhatsApp mostra a entrada do melhor cenário, não a genérica', () => {
  it('caso-âncora real: entrada do cabeçalho bate com o financiado do melhor resultado', async () => {
    const dados = baseDados({})
    const resultado = await executarSimulacao(dados, {})
    const melhor = resultado.bancosResult?.find((r) => r.elegivel)
    expect(melhor?.programa).toBe('MCMV Faixa 2')
    expect(melhor?.valorFinanciado).toBeCloseTo(190_460, -1)

    const texto = montarRespostaSimulacao(resultado, { nomeDisplay: 'Cliente Teste' })
    const cabecalho = texto.split('\n')[0]
    expect(cabecalho).toContain('59.540') // entrada do melhor cenário (250k - 190.460)
    // A entrada genérica antiga (derivada antes de saber o programa vencedor) NÃO deve
    // mais aparecer no cabeçalho.
    expect(cabecalho).not.toContain('126.666')
  })
})
