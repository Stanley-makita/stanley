/**
 * "Financiando valor máximo" (autoDerivarEntradaFinanciado, motor-simulacao.ts) estimava
 * a entrada usando sempre o LTV genérico do SBPE (`cfg.maxLtv`), mesmo quando o cliente
 * ia acabar caindo num programa com teto diferente (ex.: MCMV Classe Média em imóvel
 * usado, 60% em vez de 80%/70%). Isso causava dois problemas:
 * 1. Entrada subestimada (calculada pro SBPE, insuficiente pro MCMV).
 * 2. O cenário SAC do MCMV ficava inelegível/omitido — o PRICE tem seu próprio ajuste
 *    automático de entrada (`construirCenariosCaixa`, engine.ts), mas o SAC não, então
 *    ficava preso na entrada errada.
 *
 * Corrigido em jul/2026 com `resolverLtvEfetivoCaixa` (engine.ts), usado aqui pra estimar
 * a entrada já mirando o teto do programa real (Pró-Cotista/MCMV/SBPE), não o do SBPE.
 *
 * Caso-âncora real: simulador oficial da Caixa, 09/07/2026 — renda R$13.000, imóvel
 * R$450.000 usado (Maringá-PR/Sul), nascimento 20/02/2000, "financiando valor máximo" —
 * entrada R$180.000 (40%), financiado R$270.000 (60%), tanto SAC quanto PRICE.
 */
import { describe, it, expect } from 'vitest'
import { executarSimulacao } from '../motor-simulacao'
import type { DadosCaptacaoNormalizados } from '../normalizador-captacao'

function baseDados(overrides: Partial<DadosCaptacaoNormalizados>): DadosCaptacaoNormalizados {
  return {
    nome: 'Cliente Teste',
    cpf: null,
    telefone: null,
    data_nascimento: '2000-02-20',
    cidade_imovel: 'Maringá',
    tipo_imovel: 'usado',
    valor_imovel: 450_000,
    valor_entrada: null,
    valor_financiado: null,
    renda_formal: 13_000,
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

describe('financiando valor máximo — entrada correta pro programa real (MCMV Classe Média)', () => {
  it('caso-âncora real: entrada/financiado batem com o teto de 60% (não o 80%/70% do SBPE)', async () => {
    const dados = baseDados({})
    const resultado = await executarSimulacao(dados, {})
    const porId = new Map((resultado.bancosResult ?? []).map((r) => [r.resultadoId, r]))

    const mcmvPrice = porId.get('caixa-mcmv-price')
    expect(mcmvPrice?.elegivel).toBe(true)
    expect(mcmvPrice?.programa).toBe('MCMV Classe Média')
    expect(mcmvPrice?.valorFinanciado).toBeCloseTo(270_000, 6) // 60% de 450k

    // Antes do fix, este cenário nem aparecia (entrada estimada pro SBPE não bastava pro
    // teto de 60% do MCMV Classe Média, e o SAC nunca se auto-ajusta).
    const mcmvSac = porId.get('caixa-mcmv-sac')
    expect(mcmvSac?.elegivel).toBe(true)
    expect(mcmvSac?.programa).toBe('MCMV Classe Média')
    expect(mcmvSac?.valorFinanciado).toBeCloseTo(270_000, 6)
  })
})

// Segundo bug real, achado comparando a MESMA resposta com o SBPE testado separado no
// simulador oficial: o SBPE, na comparação, herdava a entrada derivada pro MCMV
// (R$180.000, teto de 60%) em vez de maximizar sua PRÓPRIA cota (70% PRICE). Corrigido
// com `input.financiandoValorMaximo` (tipos.ts) + `construirCenariosCaixa` (engine.ts):
// cada programa agora recalcula sua entrada máxima independentemente.
describe('financiando valor máximo — cada programa maximiza sua própria entrada (SBPE vs. MCMV)', () => {
  it('caso-âncora real: SBPE PRICE usa seu próprio teto de 70% (R$315.000), não os 60% do MCMV', async () => {
    const dados = baseDados({})
    const resultado = await executarSimulacao(dados, {})
    const porId = new Map((resultado.bancosResult ?? []).map((r) => [r.resultadoId, r]))

    const sbpePrice = porId.get('caixa-sbpe-price')
    expect(sbpePrice?.elegivel).toBe(true)
    expect(sbpePrice?.programa).toBe('SBPE')
    expect(sbpePrice?.valorFinanciado).toBeCloseTo(315_000, 6) // 70% de 450k
    // Oficial: 1ª R$3.067,13, última R$3.007,19 — bate a poucos centavos.
    expect(sbpePrice?.primeiraParcela).toBeCloseTo(3067.13, 0)
    expect(sbpePrice?.ultimaParcela).toBeCloseTo(3007.19, 0)

    const mcmvPrice = porId.get('caixa-mcmv-price')
    expect(mcmvPrice?.valorFinanciado).toBeCloseTo(270_000, 6) // continua no seu próprio 60%
  })
})
