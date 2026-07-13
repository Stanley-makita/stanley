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

/**
 * Um cenário dentro de uma "comparação de cenários" — um grupo de resultados do motor
 * que competem entre si para a mesma combinação banco+programa, diferindo por alguma
 * dimensão do input. Hoje a única dimensão usada é o sistema de amortização (SAC/PRICE,
 * exclusivo da Caixa nesta sprint), mas o tipo é deliberadamente genérico: uma dimensão
 * futura (ex. taxa negociada, prazo customizado) usaria o mesmo mecanismo, só populando
 * `patchInput` de forma diferente — nada no motor ou nos renderizadores (PDF/WhatsApp)
 * precisa saber que a dimensão de hoje é "amortização".
 */
export interface CenarioComparativo {
  /** sufixo do resultadoId, ex. 'sac' | 'price' — kebab-case, único dentro do grupo */
  sufixoId: string
  /** patch aplicado sobre o InputFinanciamento base antes de chamar o motor */
  patchInput: Partial<InputFinanciamento>
  /** nota exibida no PDF/WhatsApp quando este cenário específico for elegível (ex.: aviso
   * de que a entrada foi ajustada para caber no teto de LTV da modalidade) */
  observacaoExtra?: string
}

export interface SimulationCriteria {
  bancoId: BancoId
  programa: string
  taxaAnualBase: number
  taxaAnualCorrentista: number
  amortizacoesSuportadas: Array<'SAC' | 'PRICE'>
  ltv: CriteriosLtv
  prazoMaximoMeses: number
  /**
   * Teto de prazo específico para PRICE, quando menor que o do SAC (hoje: exclusivo da
   * Caixa — 360 meses vs. 420 do SAC, MO30769 v032 seção 3.3, regra normativa confirmada,
   * não uma calibração). Omitir cai no `prazoMaximoMeses` padrão (mesmo teto para os dois
   * sistemas de amortização — comportamento de todos os outros bancos).
   */
  prazoMaximoMesesPrice?: number
  /** Regra "idade + prazo" — hoje 966 (80a6m) para todos os bancos; ver plano-calibracao.md seção 4. */
  limiteIdadePrazoMeses: number
  /**
   * Convenção de idade usada na regra idade+prazo. Default (omitir): idade atual (completa,
   * sem dias). 'proximo-aniversario': idade que o cliente completará no próximo aniversário
   * (convenção atuarial) — confirmado célula a célula contra o simulador oficial do Itaú
   * (5 casos exatos, 2026-07-13): prazo = (limiteIdadePrazoMeses/12 − idadeProximoAniversario)
   * × 12 + 1, capado no teto do produto. Só o Itaú foi verificado com essa convenção até
   * agora — os outros bancos continuam na convenção antiga (idade atual), não verificada
   * com essa precisão de dias/aniversário.
   */
  regraIdadePrazo?: 'atual' | 'proximo-aniversario'
  /** Corte duro de idade, independente da regra de idade+prazo. Omitir se não houver regra própria. */
  idadeMaximaAbsoluta?: number
  /**
   * Corte duro de idade exclusivo do sistema SAC (ignorado no PRICE). Hoje só o MCMV
   * Classe Média tem essa regra: confirmado no simulador oficial (jul/2026) que idade 60
   * passa normalmente no SAC (prazo 242, dentro do limite geral de idade+prazo), mas 61+
   * (testado 61 a 69) sempre retorna "ATENÇÃO! IDADE PROPONENTE SUPERA LIMITE DO
   * PROGRAMA" — mesmo nascimento passando de boa no PRICE. Corte é próprio do
   * programa+sistema, não da regra geral de 80 anos e 6 meses da Caixa.
   */
  idadeMaximaAbsolutaSac?: number
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
