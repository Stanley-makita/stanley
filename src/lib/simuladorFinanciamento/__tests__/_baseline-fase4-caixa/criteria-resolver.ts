/**
 * Cópia EXATA (byte a byte, reconstruída a partir do Read feito no início da sessão da
 * Fase 4, antes de qualquer edição) de `criteria-resolver.ts` como ele estava ANTES da
 * migração da Caixa — usada só para o teste de equivalência
 * `criteria-migracao-fase4-caixa.test.ts`. Não editar como parte de nenhuma fase futura:
 * este arquivo é congelado no estado "pré-Fase 4" de propósito.
 */

import {
  BANCOS_CONFIG, MIP_RATES, DFI_RATE_MENSAL, LIMITE_IDADE_PRAZO_MESES,
  INTER_MIP_SOMPO, INTER_DFI_RATE, DAYCOVAL_MIP_RATE, DAYCOVAL_DFI_RATE,
  ITAU_MIP_P1, ITAU_MIP_P2, ITAU_DFI_RATE,
} from '../../constantes'
import type { BancoSimOverrides, SimulationCriteria, EstrategiaSeguroMip } from '../../criteria'

// ── Fase 1 ────────────────────────────────────────────────────────────────
export type BancoGenericoId = 'bradesco' | 'santander' | 'bb'
export const BANCOS_GENERICOS: BancoGenericoId[] = ['bradesco', 'santander', 'bb']

// ── Fase 2 ────────────────────────────────────────────────────────────────
export type BancoFase2Id = 'inter' | 'daycoval'
export const BANCOS_FASE2: BancoFase2Id[] = ['inter', 'daycoval']

// ── Fase 3 ────────────────────────────────────────────────────────────────
export type BancoFase3Id = 'itau'
export const BANCOS_FASE3: BancoFase3Id[] = ['itau']

// ── União de todos os bancos já migrados para o caminho de critérios ──────
export type BancoComCriteriosId = BancoGenericoId | BancoFase2Id | BancoFase3Id
export const BANCOS_COM_CRITERIOS: BancoComCriteriosId[] = [...BANCOS_GENERICOS, ...BANCOS_FASE2, ...BANCOS_FASE3]

export function ehBancoComCriterios(bancoId: string): bancoId is BancoComCriteriosId {
  return (BANCOS_COM_CRITERIOS as string[]).includes(bancoId)
}

// Estratégia de MIP do Inter (INTER_MIP_SOMPO) traduzida para o tipo genérico
// 'teto-idade' — mesmo dado, só o nome do campo muda (`maxAge` → `tetoIdade`).
function estrategiaMipInter(): EstrategiaSeguroMip {
  return {
    tipo: 'teto-idade',
    faixas: INTER_MIP_SOMPO.map((f) => ({ tetoIdade: f.maxAge, taxa: f.taxa })),
  }
}

// Estratégia de MIP do Itaú (ITAU_MIP_P1/ITAU_MIP_P2) traduzida para o tipo genérico
// 'periodo-e-idade' — dois períodos (0–120 meses / 121+), cada um com sua tabela por
// idade inteira. Mesmos dados de sempre, só reembalados no formato do critério.
function estrategiaMipItau(): EstrategiaSeguroMip {
  return {
    tipo: 'periodo-e-idade',
    periodos: [
      { mesInicio: 0, mesFimExclusive: 121, tabelaPorIdade: ITAU_MIP_P1 },
      { mesInicio: 121, mesFimExclusive: null, tabelaPorIdade: ITAU_MIP_P2 },
    ],
  }
}

export function resolverCriterios(
  bancoId: BancoComCriteriosId,
  overrides?: BancoSimOverrides,
): SimulationCriteria {
  const cfg = BANCOS_CONFIG[bancoId]
  const ehItau = bancoId === 'itau'

  const mipPadrao: EstrategiaSeguroMip =
    bancoId === 'inter'    ? estrategiaMipInter() :
    bancoId === 'daycoval' ? { tipo: 'flat', taxa: DAYCOVAL_MIP_RATE } :
    bancoId === 'itau'     ? estrategiaMipItau() :
    { tipo: 'faixa-etaria', faixas: MIP_RATES }

  const dfiPadrao =
    bancoId === 'inter'    ? INTER_DFI_RATE :
    bancoId === 'daycoval' ? DAYCOVAL_DFI_RATE :
    bancoId === 'itau'     ? ITAU_DFI_RATE :
    DFI_RATE_MENSAL

  return {
    bancoId,
    programa: cfg.programa,
    taxaAnualBase: overrides?.taxaAnual ?? cfg.taxaAnualBase,
    taxaAnualCorrentista: overrides?.taxaAnual ?? cfg.taxaAnualCorrentista,
    amortizacoesSuportadas: cfg.suportaPrice ? ['SAC', 'PRICE'] : ['SAC'],
    ltv: {
      sac: overrides?.maxLtv ?? cfg.maxLtv,
      correntista: overrides?.maxLtv ?? cfg.maxLtvCorrentista,
      price: cfg.maxLtvPrice,
      penalidadeImovelUsado: undefined,
    },
    prazoMaximoMeses: overrides?.prazoMaximoMeses ?? cfg.prazoMaximoMeses,
    limiteIdadePrazoMeses: LIMITE_IDADE_PRAZO_MESES,
    idadeMaximaAbsoluta: 80,
    comprometimentoRenda: {
      sac: 0.30,
      price: cfg.comprometimentoMaxPrice,
    },
    maxValorImovel: cfg.maxValorImovel,
    seguro: {
      mip: ehItau
        ? mipPadrao
        : (overrides?.mipRate != null ? { tipo: 'flat', taxa: overrides.mipRate } : mipPadrao),
      dfi: {
        base: ehItau ? 'valor-avaliacao' : 'valor-imovel',
        taxaMensal: ehItau ? ITAU_DFI_RATE : (overrides?.dfiRate ?? dfiPadrao),
      },
      incluirNaUltimaParcela: !ehItau,
      prePagamentoNoMesZero: ehItau,
    },
    mipParaCapacidadeMaxima: ehItau
      ? (overrides?.mipRate != null ? { tipo: 'flat', taxa: overrides.mipRate } : { tipo: 'faixa-etaria', faixas: MIP_RATES })
      : undefined,
    tarifaAdministracaoMensal: 0,
    itbi: ehItau ? { permiteIncorporar: true, percentualPadrao: 0.05 } : undefined,
    metodoConversaoTaxa: ehItau ? 'composta-truncada-15-casas' : 'composta-padrao',
    modalidadesSuportadas: ['aquisicao'],
    programasEspeciais: undefined,
  }
}
