/**
 * Resolver de critérios — migração para o motor agnóstico a banco.
 * Ver docs/calibracao-simuladores/arquitetura-motor-agnostico.md (seção 4).
 *
 * Responsabilidade: montar um `SimulationCriteria` a partir da configuração
 * atual (`BANCOS_CONFIG` em constantes.ts + overrides do banco de dados),
 * preservando exatamente os valores e a precedência já usados hoje por
 * `simularBancoComTaxa` em engine.ts — nenhuma regra nova, nenhum valor
 * novo, só uma forma diferente de entregar o mesmo dado.
 *
 * FASE 1 (Bradesco, Santander, Banco do Brasil): bancos que já usavam o
 * caminho de cálculo genérico (`calcularSAC`/`calcularPRICE`, MIP genérico
 * `MIP_RATES`, DFI genérico `DFI_RATE_MENSAL`, sem tarifa/ITBI/programa
 * especial).
 *
 * FASE 2 (Inter, Daycoval): também usam `calcularSAC`/`calcularPRICE`
 * genéricos (nenhum dos dois tem função de cálculo própria como Itaú/Caixa)
 * — a única diferença em relação à Fase 1 é a estratégia de seguro: Inter
 * usa uma tabela de MIP por teto de idade (`INTER_MIP_SOMPO`) e um DFI
 * próprio (`INTER_DFI_RATE`); Daycoval usa MIP flat (`DAYCOVAL_MIP_RATE`,
 * já suportado pelo tipo `EstrategiaSeguroMip` desde a Fase 1) e DFI próprio
 * (`DAYCOVAL_DFI_RATE`). Por isso a Fase 2 só precisou implementar o
 * dispatcher `'teto-idade'` em `engine.ts` — nenhuma mudança em `criteria.ts`.
 *
 * FASE 3 (Itaú): diferente das fases anteriores, o Itaú tinha função de
 * cálculo própria (`calcularSACItau`/`calcularPRICEItau`) por ter um
 * comportamento genuinamente diferente da fórmula genérica — pré-pagamento
 * de seguros no "mês 0", MIP/DFI zerados na última parcela, DFI sobre valor
 * de AVALIAÇÃO (não sobre valor do imóvel), taxa mensal truncada em 15 casas
 * decimais, MIP variável por período do contrato (`periodo-e-idade`, dois
 * períodos: 0–120 meses e 121+), e ITBI incorporável. Essas funções foram
 * generalizadas em `engine.ts` (deixaram de importar as constantes do Itaú
 * diretamente e passaram a receber tabelas/taxas como parâmetro) e viraram
 * o dispatcher `criteria.seguro.mip.tipo === 'periodo-e-idade'` dentro de
 * `simularComCriterios` — não há mais nenhum `cfg.id === 'itau'` no motor.
 *
 * FASE 4 (Caixa): diferente das fases anteriores, a Caixa tem MÚLTIPLOS
 * programas (Pró-Cotista, MCMV por faixa, SBPE) — mas cada um é só uma
 * variação pontual de taxa/programa/estratégia de MIP sobre o MESMO critério
 * base (mesmo LTV, mesmo prazo, mesmo DFI, mesma tarifa de administração,
 * mesmo comprometimento de renda). Por isso esta fase NÃO introduz um
 * `ProgramaEspecial` — `simularCaixaDuplo`/`simularBanco` (em engine.ts)
 * continuam responsáveis por decidir qual programa se aplica e montar a
 * variação do critério localmente, exatamente como decidiam qual
 * taxa/programa passar para `simularBancoComTaxa` antes desta fase.
 *
 * A função de cálculo especializada da Caixa (`calcularSACCaixa`/
 * `calcularPRICECaixa`) foi generalizada em `engine.ts` para
 * `calcularSACComTarifaMensalFixa`/`calcularPRICEComTarifaMensalFixa` —
 * mesmo padrão da Fase 3 (MIP/DFI zerados na última parcela, mas aqui com
 * uma tarifa de administração mensal fixa somada em toda parcela, em vez de
 * pré-pagamento no mês 0). O dispatch em `simularComCriterios` usa o campo
 * `seguro.incluirNaUltimaParcela === false` (já existente desde a Fase 1,
 * documentado ali como "hoje: Itaú e Caixa", nunca antes consumido) para
 * escolher essa função — não a estratégia de MIP, porque a Caixa usa
 * `'teto-idade'`, o mesmo tipo já usado pelo Inter (que NÃO zera seguros na
 * última parcela nem tem tarifa fixa).
 *
 * Duas correções necessárias para equivalência exata, preservadas de propósito
 * (não são melhoria de regra, são bugs/quirks pré-existentes replicados):
 * - `dfi.taxaMensal` da Caixa ignora `overrides?.dfiRate` — assim como o Itaú,
 *   porque `calcularSACCaixa`/`calcularPRICECaixa` originais nunca recebiam
 *   um parâmetro de override de DFI (só liam `CAIXA_DFI_RATE` direto).
 * - `ltv.price` agora respeita `overrides?.maxLtv` (antes só lia
 *   `cfg.maxLtvPrice`) — a Caixa é o PRIMEIRO banco desta migração com um
 *   `maxLtvPrice` real (0.70) e cuja fórmula original
 *   (`overrides?.maxLtv ?? cfg.maxLtvPrice ?? cfg.maxLtv`) respeitava esse
 *   override; sem este ajuste, um override de LTV configurado no banco de
 *   dados deixaria de fazer efeito em simulações PRICE da Caixa.
 */

import {
  BANCOS_CONFIG, MIP_RATES, DFI_RATE_MENSAL, LIMITE_IDADE_PRAZO_MESES,
  INTER_MIP_SOMPO, INTER_DFI_RATE, DAYCOVAL_MIP_RATE, DAYCOVAL_DFI_RATE,
  ITAU_MIP_P1, ITAU_MIP_P2, ITAU_DFI_RATE,
  CAIXA_MIP_RATES, CAIXA_DFI_RATE, CAIXA_TA_MENSAL, ITAU_TA_MENSAL,
} from './constantes'
import type { BancoSimOverrides, SimulationCriteria, EstrategiaSeguroMip } from './criteria'

// ── Fase 1 ────────────────────────────────────────────────────────────────
export type BancoGenericoId = 'bradesco' | 'santander' | 'bb'
export const BANCOS_GENERICOS: BancoGenericoId[] = ['bradesco', 'santander', 'bb']

// ── Fase 2 ────────────────────────────────────────────────────────────────
export type BancoFase2Id = 'inter' | 'daycoval'
export const BANCOS_FASE2: BancoFase2Id[] = ['inter', 'daycoval']

// ── Fase 3 ────────────────────────────────────────────────────────────────
export type BancoFase3Id = 'itau'
export const BANCOS_FASE3: BancoFase3Id[] = ['itau']

// ── Fase 4 ────────────────────────────────────────────────────────────────
export type BancoFase4Id = 'caixa'
export const BANCOS_FASE4: BancoFase4Id[] = ['caixa']

// ── União de todos os bancos já migrados para o caminho de critérios ──────
export type BancoComCriteriosId = BancoGenericoId | BancoFase2Id | BancoFase3Id | BancoFase4Id
export const BANCOS_COM_CRITERIOS: BancoComCriteriosId[] = [...BANCOS_GENERICOS, ...BANCOS_FASE2, ...BANCOS_FASE3, ...BANCOS_FASE4]

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

// Estratégia de MIP da Caixa (CAIXA_MIP_RATES) traduzida para o tipo genérico
// 'teto-idade' — mesmo padrão de `estrategiaMipInter()`, só troca a tabela de origem.
// É a estratégia "padrão SBPE"; Pró-Cotista e MCMV subsidizado sobrescrevem para
// `{ tipo: 'flat', taxa: MIP_RATE_MCMV }` diretamente em `simularCaixaDuplo`
// (engine.ts), fora deste resolvedor — ver comentário de topo do arquivo (Fase 4).
function estrategiaMipCaixaSbpe(): EstrategiaSeguroMip {
  return {
    tipo: 'teto-idade',
    faixas: CAIXA_MIP_RATES.map((f) => ({ tetoIdade: f.maxAge, taxa: f.taxa })),
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

/**
 * Monta o critério de simulação de um banco já migrado (Fases 1 e 2).
 *
 * Precedência preservada idêntica à de `simularBancoComTaxa` hoje:
 * - taxa/LTV/prazo: override do banco de dados > valor de `BANCOS_CONFIG`
 *   (o mesmo override, quando presente, vale tanto para a variante base
 *   quanto para a correntista — replica `overrides?.taxaAnual ?? (...)`)
 * - MIP: override do banco de dados (`mipRate`) vira uma taxa fixa que
 *   ignora a estratégia própria do banco por completo — exatamente como
 *   hoje (`mipOverride ?? overrides?.mipRate ?? (dispatch por cfg.id)`,
 *   sem `mipOverride`, que só é usado pela Caixa via `simularCaixaDuplo`).
 * - DFI: override do banco de dados (`dfiRate`) ou o valor próprio do banco
 *   (genérico `DFI_RATE_MENSAL` para Bradesco/Santander/BB; `INTER_DFI_RATE`
 *   para o Inter; `DAYCOVAL_DFI_RATE` para o Daycoval).
 * - Nenhum destes 5 bancos tem `maxLtvPrice`, `comprometimentoMaxPrice`,
 *   `suportaPrice=true`, tarifa mensal, ITBI ou programa especial hoje —
 *   todos esses campos ficam com o valor "ausente" equivalente.
 */
export function resolverCriterios(
  bancoId: BancoComCriteriosId,
  overrides?: BancoSimOverrides,
): SimulationCriteria {
  const cfg = BANCOS_CONFIG[bancoId]
  const ehItau = bancoId === 'itau'
  const ehCaixa = bancoId === 'caixa'

  const mipPadrao: EstrategiaSeguroMip =
    bancoId === 'inter'    ? estrategiaMipInter() :
    bancoId === 'daycoval' ? { tipo: 'flat', taxa: DAYCOVAL_MIP_RATE } :
    bancoId === 'itau'     ? estrategiaMipItau() :
    bancoId === 'caixa'    ? estrategiaMipCaixaSbpe() :
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
      // NÃO usar overrides?.maxLtv aqui. A tabela `bancos` (Configurações > Bancos) só
      // tem UMA coluna `ltv_maximo` por banco (migration 108) — não existe campo separado
      // para o teto de PRICE. Aplicar o mesmo override do SAC ao PRICE da Caixa reabria
      // 70% para 80% sempre que o banco tivesse qualquer `ltv_maximo` configurado (inclusive
      // o valor padrão da coluna, 80), silenciosamente ignorando o teto normativo do PRICE
      // (MO30769 v032 seção 3.1) — bug real encontrado em produção em 2026-07-07 (PDF
      // mostrando PRICE elegível a 80% quando deveria ser rejeitado acima de 70%). `cfg.
      // maxLtvPrice` é um valor de código, não calibrável por banco de dados, mesma
      // categoria de `prazoMaximoMesesPrice` abaixo.
      price: cfg.maxLtvPrice,
      // Não há penalidade de LTV para imóvel usado na Caixa. Havia uma redução de -10pp
      // aqui (herdada do código hardcoded original, sem nenhum lastro em normativo — ver
      // base-criterios-caixa.md, seção 13), removida em 2026-07-07 depois de confirmar
      // por simulação real no simulador oficial da Caixa (SBPE, imóvel usado, com
      // relacionamento): cota SAC 80% e PRICE 70%, idênticas às de imóvel novo. Nenhum
      // outro banco populava este campo, então undefined para todos, sempre.
    },
    prazoMaximoMeses: overrides?.prazoMaximoMeses ?? cfg.prazoMaximoMeses,
    // Prazo máximo PRICE da Caixa é 360 meses (SAC: 420) — MO30769 v032 seção 3.3,
    // regra normativa confirmada, não calibração. Único banco migrado com essa distinção
    // até agora; os demais mantêm o mesmo teto para os dois sistemas de amortização.
    // Respeita overrides?.prazoMaximoMeses quando menor que 360 (ex.: prazo customizado
    // pedido pelo operador via motor-simulacao.ts) — sem isso, um pedido de prazo menor
    // reduzia o teto do SAC mas deixava o PRICE preso em 360.
    prazoMaximoMesesPrice: ehCaixa ? Math.min(overrides?.prazoMaximoMeses ?? cfg.prazoMaximoMeses, 360) : undefined,
    limiteIdadePrazoMeses: LIMITE_IDADE_PRAZO_MESES,
    // Só o Itaú foi verificado com a convenção "idade no próximo aniversário" — ver
    // comentário do campo em criteria.ts e calcularPrazoMaximo em engine.ts.
    regraIdadePrazo: ehItau ? 'proximo-aniversario' : undefined,
    idadeMaximaAbsoluta: 80,
    comprometimentoRenda: {
      sac: 0.30,
      price: cfg.comprometimentoMaxPrice,
    },
    maxValorImovel: cfg.maxValorImovel,
    seguro: {
      // ATENÇÃO Itaú: os overrides `mipRate`/`dfiRate` do banco de dados NUNCA chegam
      // até aqui para o Itaú — a função de cálculo especializada (`calcularSACPeriodoIdade`/
      // `calcularPRICEPeriodoIdade`) é fiel ao comportamento original (`calcularSACItau`/
      // `calcularPRICEItau`), que sempre usava as tabelas/taxa próprias do banco
      // (ITAU_MIP_P1/P2, ITAU_DFI_RATE) e nunca lia esses overrides — só a estimativa de
      // capacidade máxima (`mipParaCapacidadeMaxima` abaixo) já respeitava `mipRate`, e
      // `dfiRate` nunca teve efeito algum no Itaú, nem na estimativa. Isso é uma limitação
      // pré-existente preservada de propósito nesta migração — ver o documento da Fase 3.
      mip: ehItau
        ? mipPadrao
        : (overrides?.mipRate != null ? { tipo: 'flat', taxa: overrides.mipRate } : mipPadrao),
      dfi: {
        // Itaú calcula o DFI sobre o valor de AVALIAÇÃO do imóvel (input.valorAvaliacao,
        // com fallback para valorImovel), não sobre o valor do imóvel em si — todos os
        // demais bancos usam valor do imóvel. Ver simularComCriterios em engine.ts.
        base: ehItau ? 'valor-avaliacao' : 'valor-imovel',
        // ATENÇÃO Caixa: `overrides?.dfiRate` também nunca chegava até `calcularSACCaixa`/
        // `calcularPRICECaixa` originais (ambas só liam `CAIXA_DFI_RATE` direto, sem
        // parâmetro de override) — mesma limitação pré-existente do Itaú, preservada aqui.
        taxaMensal: ehItau ? ITAU_DFI_RATE : ehCaixa ? CAIXA_DFI_RATE : (overrides?.dfiRate ?? dfiPadrao),
      },
      // Itaú zera MIP/DFI na última parcela e soma um pré-pagamento no "mês 0"; a Caixa
      // também zera MIP/DFI na última parcela (mas sem pré-pagamento — em vez disso soma
      // uma tarifa de administração mensal fixa em toda parcela, ver `tarifaAdministracaoMensal`
      // abaixo). Ambos os comportamentos ficam encapsulados nas funções de cálculo
      // especializadas (dispatch por `seguro.mip.tipo === 'periodo-e-idade'` para o Itaú e
      // por `!seguro.incluirNaUltimaParcela` para a Caixa, em `simularComCriterios`) — estes
      // dois flags servem só para documentar a regra real do banco.
      incluirNaUltimaParcela: !ehItau && !ehCaixa,
      prePagamentoNoMesZero: ehItau,
    },
    // Itaú usa a tabela GENÉRICA de mercado (não a própria) só para a estimativa de
    // capacidade máxima de financiamento — comportamento hoje já existente, preservado
    // aqui explicitamente (ver comentário do campo em criteria.ts). O override de
    // `mipRate`, quando presente, SUBSTITUI essa estimativa por uma taxa flat — isso já
    // acontecia no código original (o override afetava só a estimativa, nunca a parcela
    // real do Itaú).
    mipParaCapacidadeMaxima: ehItau
      ? (overrides?.mipRate != null ? { tipo: 'flat', taxa: overrides.mipRate } : { tipo: 'faixa-etaria', faixas: MIP_RATES })
      : undefined,
    // Tarifa de administração mensal fixa — Caixa (R$25/mês, cobrada em toda parcela,
    // inclusive nos programas Pró-Cotista/MCMV) e Itaú (TAC, também R$25/mês, cobrada do
    // mês 1 ao último inclusive — confirmado no simulador oficial, VALIDADE!AB7 do
    // simulador itau.xlsm). `overrides?.taxaAdmin` nunca foi lido por
    // `calcularSACCaixa`/`calcularPRICECaixa` originais — campo do tipo `BancoSimOverrides`
    // já existia mas estava morto; preservado morto aqui também.
    tarifaAdministracaoMensal: ehCaixa ? CAIXA_TA_MENSAL : (ehItau ? ITAU_TA_MENSAL : 0),
    itbi: ehItau ? { permiteIncorporar: true, percentualPadrao: 0.05 } : undefined,
    metodoConversaoTaxa: ehItau ? 'composta-truncada-15-casas' : 'composta-padrao',
    modalidadesSuportadas: ['aquisicao'],
    programasEspeciais: undefined,
  }
}
