/**
 * Teste de regressão — Fase 3 da migração para o motor agnóstico (Itaú)
 * (docs/calibracao-simuladores/arquitetura-motor-agnostico.md)
 *
 * Mesma metodologia das Fases 1 e 2: os snapshots gravados aqui foram
 * capturados com o Itaú **ainda no caminho hardcoded antigo** (antes de
 * `ehBancoComCriterios` passar a incluí-lo). Depois da migração, a mesma
 * suíte deve reproduzir os snapshots sem nenhuma diferença.
 *
 * Além dos snapshots sintéticos, este arquivo valida a função de cálculo
 * do Itaú diretamente contra o CASO-ÂNCORA REAL documentado em
 * docs/calibracao-simuladores/casos-ancora/itau-casos.json (cliente real,
 * simulador oficial Itaú, planilha `simulador itau.xlsm`) — isso evita
 * qualquer ambiguidade de como reconstituir valorImovel/entrada/ITBI a
 * partir dos campos do caso: chamamos a função de cálculo com os valores
 * de saldo financiado e avaliação já resolvidos, exatamente como a
 * planilha e o código atual os usam.
 *
 * NÃO editar os snapshots manualmente. A correção de MIP para as idades
 * 18–43 (Fase 3, etapa separada) muda alguns destes snapshots de forma
 * DELIBERADA — ver docs/calibracao-simuladores/migracao-motor-agnostico-fase-3-itau.md
 * para o antes/depois documentado dessa correção específica.
 */

import { describe, it, expect } from 'vitest'
import { simularBanco } from '../engine'
import type { InputFinanciamento } from '../tipos'

const BASE_INPUT: InputFinanciamento = {
  valorImovel:     500_000,
  valorEntrada:    150_000,
  dataNascimento:  '1990-06-15',
  rendaMensal:     15_000,
  tipoAmortizacao: 'SAC',
  correntista:     false,
  bancosIds:       [],
  tipoImovel:      'novo',
  finalidade:      'residencial',
}

describe('Itaú — regressão antes/depois da migração (Fase 3)', () => {
  it('SAC, aquisição residencial padrão', () => {
    const r = simularBanco('itau', { ...BASE_INPUT })
    expect(r).toMatchSnapshot()
  })

  it('PRICE, aquisição residencial padrão', () => {
    const r = simularBanco('itau', { ...BASE_INPUT, tipoAmortizacao: 'PRICE' })
    expect(r).toMatchSnapshot()
  })

  it('correntista (taxa igual à base no Itaú — sem diferenciação hoje)', () => {
    const r = simularBanco('itau', { ...BASE_INPUT, correntista: true })
    expect(r).toMatchSnapshot()
  })

  it('imóvel usado (Itaú não aplica penalidade de LTV — só a Caixa aplica)', () => {
    const r = simularBanco('itau', { ...BASE_INPUT, tipoImovel: 'usado' })
    expect(r).toMatchSnapshot()
  })

  it('LTV no limite de 80%', () => {
    const r = simularBanco('itau', { ...BASE_INPUT, valorEntrada: 100_000 })
    expect(r).toMatchSnapshot()
  })

  it('LTV acima do limite (inelegível)', () => {
    const r = simularBanco('itau', { ...BASE_INPUT, valorEntrada: 50_000 })
    expect(r).toMatchSnapshot()
  })

  it('idade jovem (25 anos) — tabela MIP_P1 faixa baixa', () => {
    const r = simularBanco('itau', { ...BASE_INPUT, dataNascimento: '2001-01-01' })
    expect(r).toMatchSnapshot()
  })

  it('idade 44 anos — fronteira entre valores "estimados" (até 43) e "exatos" (44+) na tabela atual', () => {
    const hoje = new Date()
    const nasc = `${hoje.getFullYear() - 44}-01-15`
    const r = simularBanco('itau', { ...BASE_INPUT, dataNascimento: nasc })
    expect(r).toMatchSnapshot()
  })

  it('prazo longo (420 meses) cruzando a fronteira P1→P2 (mês 121, renovação decenal)', () => {
    const r = simularBanco('itau', { ...BASE_INPUT, valorEntrada: 100_000, dataNascimento: '1985-03-10' })
    expect(r).toMatchSnapshot()
  })

  it('idade próxima ao limite (78 anos — prazo reduzido pela regra idade+prazo)', () => {
    const r = simularBanco('itau', { ...BASE_INPUT, dataNascimento: '1948-01-01' })
    expect(r).toMatchSnapshot()
  })

  it('idade no corte duro de 80 anos (inelegível)', () => {
    const r = simularBanco('itau', { ...BASE_INPUT, dataNascimento: '1946-01-01' })
    expect(r).toMatchSnapshot()
  })

  it('com ITBI incorporado (5% padrão)', () => {
    const r = simularBanco('itau', { ...BASE_INPUT, incorporarItbi: true })
    expect(r).toMatchSnapshot()
  })

  it('com ITBI incorporado (percentual customizado)', () => {
    const r = simularBanco('itau', { ...BASE_INPUT, incorporarItbi: true, percentualItbi: 0.03 })
    expect(r).toMatchSnapshot()
  })

  it('com valorAvaliacao diferente de valorImovel (DFI incide sobre avaliação, não sobre o imóvel)', () => {
    const r = simularBanco('itau', { ...BASE_INPUT, valorAvaliacao: 600_000 })
    expect(r).toMatchSnapshot()
  })

  it('com dataContratacao explícita (idade calculada na data do contrato, não hoje)', () => {
    const r = simularBanco('itau', { ...BASE_INPUT, dataContratacao: '2025-01-15' })
    expect(r).toMatchSnapshot()
  })

  it('renda baixa (aviso de comprometimento de renda)', () => {
    const r = simularBanco('itau', { ...BASE_INPUT, rendaMensal: 3_000 })
    expect(r).toMatchSnapshot()
  })

  it('com overrides do banco de dados (taxa, LTV, prazo customizados)', () => {
    const r = simularBanco('itau', { ...BASE_INPUT }, {
      taxaAnual: 0.115,
      maxLtv: 0.75,
      prazoMaximoMeses: 360,
    })
    expect(r).toMatchSnapshot()
  })

  it('com override de mipRate (deve usar taxa flat, ignorando a tabela período+idade)', () => {
    const r = simularBanco('itau', { ...BASE_INPUT }, { mipRate: 0.0005 })
    expect(r).toMatchSnapshot()
  })

  it('com override de dfiRate', () => {
    const r = simularBanco('itau', { ...BASE_INPUT }, { dfiRate: 0.00009 })
    expect(r).toMatchSnapshot()
  })
})

// ─── Caso-âncora real ─────────────────────────────────────────────────────
//
// Reconstrução do cliente real documentado em
// docs/calibracao-simuladores/casos-ancora/itau-casos.json (id: itau-henrique-mengue-001),
// extraído do simulador oficial Itaú (simulador itau.xlsm). Usamos valorImovel = valorAvaliação
// = R$ 1.495.000 e valorEntrada = R$ 440.500 (em vez de reconstituir a composição exata de
// valor de compra/venda + ITBI incorporado) porque o que este teste precisa fixar é o par
// (valorFinanciadoTotal, valorAvaliacao) que a função de cálculo do Itaú realmente recebe —
// R$ 1.054.500 financiado sobre avaliação de R$ 1.495.000 — não a composição de onde esses
// dois números vieram (isso já é coberto pelos testes sintéticos de ITBI acima). A composição
// escolhida aqui (sem ITBI incorporado) reproduz esse par exatamente com taxa 13% a.a. e
// prazo 396 meses (override).
//
// Corrigido em 2026-07-13: este caso é carteira "CH" (ver itau-casos.json), que tem uma
// estrutura de cobrança DIFERENTE do padrão SFH/Isolado — confirmado comparando este
// caso contra um caso real de carteira padrão (site oficial, mesmo dia): a "1ª parcela"
// da carteira CH soma o próprio mês 1 (amortização+juros+MIP+DFI) MAIS o pré-pagamento de
// seguros do mês 0 (mip0+dfi0), e não cobra TAC. Já a carteira padrão cobra TAC (R$25/mês)
// e NÃO soma o pré-pagamento do mês 0 na "1ª parcela" (esse é exibido como cobrança
// separada). O motor não modela "carteira" como input — foi calibrado para o caso padrão
// (a grande maioria dos clientes da assessoria), então este teste-âncora específico (CH)
// passou a ter uma divergência esperada e aceita de R$ 486,59 (= mip0+dfi0, o valor do
// pré-pagamento que só a CH bundla): valor real da planilha R$ 14.430,81, valor do motor
// (modelo padrão) R$ 13.969,22. Ver memória `itau_mip_dfi_double_count_e_tac.md`.
describe('Itaú — caso-âncora real (Henrique Justo Mengue, simulador itau.xlsm)', () => {
  const INPUT_CASO_REAL: InputFinanciamento = {
    valorImovel: 1_495_000,
    valorEntrada: 440_500,
    valorAvaliacao: 1_495_000,
    dataNascimento: '1980-12-29',
    dataContratacao: '2025-08-28',
    rendaMensal: 110_000,
    tipoAmortizacao: 'SAC',
    correntista: true,
    bancosIds: [],
    tipoImovel: 'novo',
    finalidade: 'residencial',
  }
  const OVERRIDES_CASO_REAL = { taxaAnual: 0.13, prazoMaximoMeses: 396 }

  it('reproduz o cálculo do modelo padrão (SFH/Isolado) — diverge da carteira CH real por não bundlar o pré-pagamento do mês 0 e cobrar TAC (ver comentário acima)', () => {
    const r = simularBanco('itau', INPUT_CASO_REAL, OVERRIDES_CASO_REAL)
    expect(r.elegivel).toBe(true)
    expect(r.parcelas).toBe(396)
    expect(r.valorFinanciado).toBe(1_054_500)
    expect(r.primeiraParcela).toBeCloseTo(13969.22, 1)
    expect(r.ultimaParcela).toBeCloseTo(2715.14, 1)
  })

  it('snapshot completo do caso-âncora (referência para qualquer mudança futura de regra)', () => {
    const r = simularBanco('itau', INPUT_CASO_REAL, OVERRIDES_CASO_REAL)
    expect(r).toMatchSnapshot()
  })
})
