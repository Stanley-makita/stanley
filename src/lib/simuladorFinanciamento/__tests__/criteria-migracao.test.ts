/**
 * Teste de regressão — Fase 1 da migração para o motor agnóstico
 * (docs/calibracao-simuladores/arquitetura-motor-agnostico.md)
 *
 * Este arquivo é escrito e rodado ANTES da refatoração para capturar, via
 * snapshot, o resultado exato de `simularBanco` para Bradesco, Santander e
 * Banco do Brasil numa bateria de cenários representativos (SAC/PRICE,
 * correntista/não, idade jovem/próxima do limite, LTV no limite, valor de
 * imóvel no teto, imóvel novo/usado). Depois da refatoração (Fase 1), a
 * mesma suíte deve reproduzir os snapshots gravados aqui sem nenhuma
 * diferença — essa é a prova de que a migração foi estrutural, não funcional.
 *
 * NÃO editar os snapshots manualmente. Se um valor mudar de propósito em uma
 * fase futura (correção de regra), o snapshot deve ser atualizado nessa fase,
 * com justificativa registrada no documento de migração correspondente.
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

const BANCOS_GENERICOS_FASE1 = ['bradesco', 'santander', 'bb'] as const

describe('Bancos genéricos (Fase 1) — regressão antes/depois da migração', () => {
  for (const bancoId of BANCOS_GENERICOS_FASE1) {
    describe(bancoId, () => {
      it('SAC, não correntista, imóvel novo, cenário padrão', () => {
        const r = simularBanco(bancoId, { ...BASE_INPUT })
        expect(r).toMatchSnapshot()
      })

      it('SAC, correntista, imóvel novo', () => {
        const r = simularBanco(bancoId, { ...BASE_INPUT, correntista: true })
        expect(r).toMatchSnapshot()
      })

      it('SAC, imóvel usado', () => {
        const r = simularBanco(bancoId, { ...BASE_INPUT, tipoImovel: 'usado' })
        expect(r).toMatchSnapshot()
      })

      it('SAC, entrada mínima (LTV no limite de 80%)', () => {
        const r = simularBanco(bancoId, { ...BASE_INPUT, valorEntrada: 100_000 })
        expect(r).toMatchSnapshot()
      })

      it('SAC, LTV acima do limite (deve ficar inelegível)', () => {
        const r = simularBanco(bancoId, { ...BASE_INPUT, valorEntrada: 50_000 })
        expect(r).toMatchSnapshot()
      })

      it('SAC, entrada igual ao valor do imóvel (financiado <= 0, inelegível)', () => {
        const r = simularBanco(bancoId, { ...BASE_INPUT, valorEntrada: 500_000 })
        expect(r).toMatchSnapshot()
      })

      it('SAC, cliente jovem (25 anos)', () => {
        const r = simularBanco(bancoId, { ...BASE_INPUT, dataNascimento: '2001-01-01' })
        expect(r).toMatchSnapshot()
      })

      it('SAC, cliente próximo do limite de idade (78 anos)', () => {
        const r = simularBanco(bancoId, { ...BASE_INPUT, dataNascimento: '1948-01-01' })
        expect(r).toMatchSnapshot()
      })

      it('SAC, cliente com 80 anos (deve ficar inelegível — corte duro de idade)', () => {
        const r = simularBanco(bancoId, { ...BASE_INPUT, dataNascimento: '1946-01-01' })
        expect(r).toMatchSnapshot()
      })

      it('PRICE (deve ficar inelegível — nenhum dos 3 bancos genéricos oferece PRICE)', () => {
        const r = simularBanco(bancoId, { ...BASE_INPUT, tipoAmortizacao: 'PRICE' })
        expect(r).toMatchSnapshot()
      })

      it('valor de imóvel alto (R$ 4.500.000 — testa teto do BB)', () => {
        const r = simularBanco(bancoId, { ...BASE_INPUT, valorImovel: 4_500_000, valorEntrada: 1_350_000 })
        expect(r).toMatchSnapshot()
      })

      it('valor de imóvel acima do teto do BB (R$ 6.000.000 — só relevante para BB, mas roda em todos)', () => {
        const r = simularBanco(bancoId, { ...BASE_INPUT, valorImovel: 6_000_000, valorEntrada: 1_800_000 })
        expect(r).toMatchSnapshot()
      })

      it('renda baixa (aviso de comprometimento de renda)', () => {
        const r = simularBanco(bancoId, { ...BASE_INPUT, rendaMensal: 3_000 })
        expect(r).toMatchSnapshot()
      })

      it('com overrides do banco de dados (taxa, LTV, prazo, MIP e DFI customizados)', () => {
        const r = simularBanco(bancoId, { ...BASE_INPUT }, {
          taxaAnual: 0.115,
          maxLtv: 0.75,
          prazoMaximoMeses: 360,
          mipRate: 0.0002,
          dfiRate: 0.00007,
        })
        expect(r).toMatchSnapshot()
      })

      it('com override apenas de mipRate (deve usar taxa flat, ignorando tabela por idade)', () => {
        const r = simularBanco(bancoId, { ...BASE_INPUT }, { mipRate: 0.0005 })
        expect(r).toMatchSnapshot()
      })
    })
  }
})
