/**
 * Bug real reportado pelo usuário: "*simula Imóvel 2150000, Financiando 1720000, Prazo
 * máximo, Nascimento 25/10/1978, Renda 50000, Tabela - sac e price, Bradesco, Santander".
 *
 * "sac e price" solto (sem amarrar a nenhum banco) colapsava pra um único critério global
 * PRICE (tipo_amortizacao_raw.includes('PRICE') sempre ganhava de SAC) — Bradesco simulava
 * só em PRICE e o Santander (que não tem PRICE) saía inelegível inteiro, mesmo tendo SAC
 * disponível. O usuário esperava: SAC dos dois bancos + PRICE só do banco que suporta +
 * explicação clara do que não suporta — não a perda silenciosa do SAC dos dois.
 */
import { describe, it, expect } from 'vitest'
import { executarSimulacao } from '../motor-simulacao'
import type { DadosCaptacaoNormalizados } from '../normalizador-captacao'

function baseDados(overrides: Partial<DadosCaptacaoNormalizados>): DadosCaptacaoNormalizados {
  return {
    nome: 'Cliente Teste',
    cpf: null,
    telefone: null,
    data_nascimento: '1978-10-25',
    cidade_imovel: null,
    tipo_imovel: 'usado',
    valor_imovel: 2_150_000,
    valor_entrada: 430_000,
    valor_financiado: 1_720_000,
    renda_formal: 50_000,
    renda_informal: null,
    bancos_ids: ['bradesco', 'santander'],
    solicitar_simulacao: true,
    prazo_meses: null,
    tipo_amortizacao: 'SAC',
    tipo_amortizacao_ambas: true,
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

describe('tipo_amortizacao_ambas — "sac e price" sem banco específico', () => {
  it('simula SAC nos dois bancos e PRICE só no que suporta, em vez de descartar o SAC', async () => {
    const resultado = await executarSimulacao(baseDados({}), {})
    const bancos = resultado.bancosResult ?? []

    const bradescoSac   = bancos.find((b) => b.bancoId === 'bradesco' && b.tipoAmortizacao === 'SAC')
    const bradescoPrice = bancos.find((b) => b.bancoId === 'bradesco' && b.tipoAmortizacao === 'PRICE')
    const santanderSac   = bancos.find((b) => b.bancoId === 'santander' && b.tipoAmortizacao === 'SAC')
    const santanderPrice = bancos.find((b) => b.bancoId === 'santander' && b.tipoAmortizacao === 'PRICE')

    // Os 4 cenários existem — nenhum banco desaparece por causa da tabela pedida.
    expect(bradescoSac).toBeDefined()
    expect(bradescoPrice).toBeDefined()
    expect(santanderSac).toBeDefined()
    expect(santanderPrice).toBeDefined()

    // SAC funciona nos dois bancos (o ponto central do bug: antes o SAC sumia dos dois).
    expect(bradescoSac?.elegivel).toBe(true)
    expect(santanderSac?.elegivel).toBe(true)

    // Santander não tem PRICE parametrizado — inelegível só NESSA combinação, com motivo
    // explicativo, não "banco inteiro fora".
    expect(santanderPrice?.elegivel).toBe(false)
    expect(santanderPrice?.motivoInelegivel ?? '').toMatch(/PRICE/i)

    // resultadoId distintos (evita colisão de key na lista/PDF)
    const ids = new Set(bancos.map((b) => b.resultadoId))
    expect(ids.size).toBe(bancos.length)
  })

  it('banco com override explícito (amortizacao_por_banco) não é afetado por tipo_amortizacao_ambas', async () => {
    const resultado = await executarSimulacao(
      baseDados({ amortizacao_por_banco: { bradesco: 'SAC' } }),
      {},
    )
    const bancos = resultado.bancosResult ?? []
    const bradescoResultados = bancos.filter((b) => b.bancoId === 'bradesco')
    // Override explícito → só 1 cenário pro Bradesco, não os 2 do modo "ambas".
    expect(bradescoResultados).toHaveLength(1)
    expect(bradescoResultados[0].tipoAmortizacao).toBe('SAC')

    // Santander (sem override) continua recebendo os 2 cenários normalmente.
    const santanderResultados = bancos.filter((b) => b.bancoId === 'santander')
    expect(santanderResultados).toHaveLength(2)
  })
})
