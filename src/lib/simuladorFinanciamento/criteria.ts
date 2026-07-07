/**
 * Camada de critérios — Fase 1 da migração para o motor agnóstico a banco.
 * Ver docs/calibracao-simuladores/arquitetura-motor-agnostico.md (seção 3).
 *
 * `SimulationCriteria` é o contrato único que o motor de cálculo deveria
 * consumir, sem nunca precisar saber "qual banco é". Nesta fase, o tipo já
 * está completo (conforme a proposta), mas só é populado e consumido de
 * fato para os bancos genéricos (Bradesco, Santander, Banco do Brasil) —
 * ver `criteria-resolver.ts`. Caixa, Itaú, Inter e Daycoval continuam no
 * caminho hardcoded em `engine.ts` até as Fases 2–4.
 *
 * Estratégias de seguro ('teto-idade' e 'periodo-e-idade') e os campos
 * `itbi`/`programasEspeciais` já existem no tipo para não exigir uma
 * segunda alteração de contrato nas próximas fases, mas seus
 * "dispatchers" em `engine.ts` só implementam o necessário para os bancos
 * desta fase ('faixa-etaria' e 'flat') — os demais lançam erro claro se
 * alguém tentar usá-los antes da hora.
 */

import type { BancoId, InputFinanciamento, TipoOperacao } from './tipos'

export type MetodoConversaoTaxa =
  | 'composta-padrao'
  | 'composta-truncada-15-casas' // exclusivo do Itaú hoje — não implementado até a Fase 3

/** Um período do contrato (em meses) com sua própria tabela de MIP por idade inteira. */
export interface PeriodoMip {
  mesInicio: number
  mesFimExclusive: number | null
  tabelaPorIdade: Record<number, number>
}

export type EstrategiaSeguroMip =
  | { tipo: 'faixa-etaria'; faixas: Array<{ idadeMin: number; idadeMax: number; taxa: number }> }
  | { tipo: 'teto-idade'; faixas: Array<{ tetoIdade: number; taxa: number }> } // Caixa/Inter — Fase 2/4
  | { tipo: 'flat'; taxa: number }
  | { tipo: 'periodo-e-idade'; periodos: PeriodoMip[] } // Itaú — Fase 3

export interface CriteriosDfi {
  base: 'valor-imovel' | 'valor-avaliacao' // 'valor-avaliacao' é exclusivo do Itaú hoje — Fase 3
  taxaMensal: number
}

export interface CriteriosSeguro {
  mip: EstrategiaSeguroMip
  dfi: CriteriosDfi
  /** false = MIP/DFI zerados na última parcela (hoje: Itaú e Caixa). Default esperado: true. */
  incluirNaUltimaParcela: boolean
  /** true = soma um pré-pagamento de seguros no "mês 0" (hoje: exclusivo do Itaú). Default esperado: false. */
  prePagamentoNoMesZero: boolean
}

export interface CriteriosLtv {
  sac: number
  price?: number
  correntista?: number
  /** ex.: 0.10 → subtrai 10pp do LTV para imóvel usado (hoje: exclusivo da Caixa) */
  penalidadeImovelUsado?: number
}

export interface CriteriosComprometimentoRenda {
  sac: number
  price?: number
}

export interface CriteriosItbi {
  permiteIncorporar: boolean
  percentualPadrao: number
}

export interface ProgramaEspecial {
  id: string
  nome: string
  elegivel: (input: InputFinanciamento) => boolean
  taxaAnual: number
  mipOverride?: EstrategiaSeguroMip
}

export interface SimulationCriteria {
  bancoId: BancoId
  programa: string
  taxaAnualBase: number
  taxaAnualCorrentista: number
  amortizacoesSuportadas: Array<'SAC' | 'PRICE'>
  ltv: CriteriosLtv
  prazoMaximoMeses: number
  /** Regra "idade + prazo" — hoje 966 (80a6m) para todos os bancos; ver plano-calibracao.md seção 4. */
  limiteIdadePrazoMeses: number
  /** Corte duro de idade, independente da regra de idade+prazo. Omitir se não houver regra própria. */
  idadeMaximaAbsoluta?: number
  comprometimentoRenda: CriteriosComprometimentoRenda
  /** 0 = sem limite */
  maxValorImovel: number
  seguro: CriteriosSeguro
  /**
   * Estratégia de MIP usada apenas na estimativa de "capacidade máxima de financiamento
   * a 30% de renda" (`calcularMaxFinanciavel`) — separada de `seguro.mip` porque o Itaú,
   * desde antes desta migração, usa a tabela GENÉRICA de mercado (`MIP_RATES`) para essa
   * estimativa em vez da sua própria tabela período+idade (`ITAU_MIP_P1`/`P2`). Omitir este
   * campo faz o resolvedor cair de volta em `seguro.mip` (comportamento de todos os bancos
   * que não têm essa distinção — a estimativa usa a mesma estratégia da parcela real).
   */
  mipParaCapacidadeMaxima?: EstrategiaSeguroMip
  /** 0 = sem tarifa mensal fixa */
  tarifaAdministracaoMensal: number
  itbi?: CriteriosItbi
  metodoConversaoTaxa: MetodoConversaoTaxa
  modalidadesSuportadas: TipoOperacao[]
  programasEspeciais?: ProgramaEspecial[]
}

/**
 * Overrides por banco vindos do banco de dados (Configurações > Bancos).
 * Movido de `engine.ts` para cá para permitir que `criteria-resolver.ts` os
 * consuma sem criar import circular com `engine.ts` (que por sua vez
 * consome `criteria-resolver.ts`). `engine.ts` reexporta este tipo para
 * manter compatibilidade com todo código existente que já importa
 * `BancoSimOverrides` de `@/lib/simuladorFinanciamento/engine`.
 */
export interface BancoSimOverrides {
  taxaAnual?: number
  maxLtv?: number
  prazoMaximoMeses?: number
  mipRate?: number
  dfiRate?: number
  taxaAdmin?: number
}
