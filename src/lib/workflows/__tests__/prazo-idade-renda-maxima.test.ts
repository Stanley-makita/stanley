/**
 * "Financiando valor máximo" (construirCenariosCaixa, engine.ts) estimava o teto por
 * renda usando o prazo GENÉRICO do banco (ex.: 420/360 meses), não o prazo real do
 * cliente já reduzido pelo teto de idade da Caixa (80 anos e 6 meses —
 * `calcularPrazoMaximo`). Um cliente mais velho, com prazo bem mais curto, tem parcela
 * MAIOR pro mesmo principal — então usar o prazo longo de referência superestimava
 * brutalmente quanto ele cabia na renda.
 *
 * Caso-âncora real: simulador oficial da Caixa, 09/07/2026 — nascimento 15/03/1956
 * (70 anos), imóvel R$550.000 novo, renda R$13.000, "financiando valor máximo", prazo
 * real 122 meses (teto de idade). Antes da correção, o SBPE PRICE saía com 1ª parcela de
 * R$5.149,23 — 39,6% da renda, muito acima do teto de 30% — porque a busca por renda
 * usava 360 meses em vez dos 122 reais. Corrigido usando `calcularPrazoMaximo` também
 * dentro da busca por renda.
 */
import { describe, it, expect } from 'vitest'
import { executarSimulacao } from '../motor-simulacao'
import type { DadosCaptacaoNormalizados } from '../normalizador-captacao'

function baseDados(overrides: Partial<DadosCaptacaoNormalizados>): DadosCaptacaoNormalizados {
  return {
    nome: 'Cliente Teste',
    cpf: null,
    telefone: null,
    data_nascimento: '1956-03-15',
    cidade_imovel: 'Maringá',
    tipo_imovel: 'novo',
    valor_imovel: 550_000,
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

describe('financiando valor máximo — teto por renda usa o prazo já reduzido pelo teto de idade', () => {
  it('caso-âncora real: nenhum cenário estoura 30% da renda mesmo com prazo curto (70 anos)', async () => {
    const dados = baseDados({})
    const resultado = await executarSimulacao(dados, {})
    const porId = new Map((resultado.bancosResult ?? []).map((r) => [r.resultadoId, r]))

    const parcelaMax = 13_000 * 0.30

    // MCMV Classe Média SAC tem corte de idade próprio de 60 anos (ver
    // criteria-migracao-fase4-caixa.test.ts) — aos 70 anos fica de fora, corretamente.
    for (const id of ['caixa-sbpe-sac', 'caixa-sbpe-price', 'caixa-mcmv-price']) {
      const r = porId.get(id)
      expect(r?.parcelas).toBe(122) // prazo já reduzido pelo teto de idade (80 anos e 6 meses)
      // Tolerância de R$1 pro arredondamento da busca binária.
      expect(r!.primeiraParcela).toBeLessThanOrEqual(parcelaMax + 1)
    }
    expect(porId.get('caixa-mcmv-sac')).toBeUndefined()
  })
})
