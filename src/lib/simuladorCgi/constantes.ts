import type { BancoCgiId, SistemaAmortizacaoCgi } from './tipos'

export interface BancoCgiConfig {
  id: BancoCgiId
  nome: string
  cor: string
  corTexto: string
  /** Taxa "a partir de" — nunca apresentada como garantida. */
  taxaAnualBase: number
  /** LTV máximo: % do valor do imóvel dado em garantia. */
  ltvMax: number
  prazoMaximoMeses: number
  sistemaAmortizacao: SistemaAmortizacaoCgi
  /** true = pós-fixado (taxa + IPCA); IPCA não projetado nesta V1. */
  indexadoIpca: boolean
  // Campos reservados para calibração futura (Configurações > Comercial e Financeiro >
  // Simulações > CGI) — não implementados/usados no cálculo desta V1:
  // prazoMinimoMeses?, valorMinimo?, valorMaximo?, tarifaAdministrativa?, idadeMaxima?,
  // rendaMinima?, comprometimentoRendaMax?, seguro?, cet?
}

export const PRAZO_MAXIMO_CGI_MESES = 240

// Regra de negócio confirmada com o usuário: idade do proponente + prazo da operação não
// pode ultrapassar 80 anos e 3 meses. Não há prazo mínimo operacional de CGI documentado
// no projeto nem nas fontes bancárias já levantadas — não inventar um piso (diferente do
// financiamento imobiliário, que tem seu próprio piso de 12 meses por regra distinta).
export const LIMITE_IDADE_PRAZO_CGI_MESES = 80 * 12 + 3

// Parâmetros comerciais de referência V1 — confirmados com o usuário nesta sessão.
// Santander: taxa fixa/prefixada, PRICE. Inter/Daycoval/CashMe: taxa + IPCA (pós-fixado),
// SAC. Bradesco: taxa fixa, SAC.
export const BANCOS_CGI_CONFIG: Record<BancoCgiId, BancoCgiConfig> = {
  inter: {
    id: 'inter', nome: 'Banco Inter', cor: '#FF6600', corTexto: '#ffffff',
    taxaAnualBase: 0.18, ltvMax: 0.60, prazoMaximoMeses: PRAZO_MAXIMO_CGI_MESES,
    sistemaAmortizacao: 'SAC', indexadoIpca: true,
  },
  daycoval: {
    id: 'daycoval', nome: 'Daycoval', cor: '#1B3F6E', corTexto: '#ffffff',
    taxaAnualBase: 0.18, ltvMax: 0.60, prazoMaximoMeses: PRAZO_MAXIMO_CGI_MESES,
    sistemaAmortizacao: 'SAC', indexadoIpca: true,
  },
  cashme: {
    id: 'cashme', nome: 'CashMe', cor: '#0F172A', corTexto: '#ffffff',
    taxaAnualBase: 0.18, ltvMax: 0.60, prazoMaximoMeses: PRAZO_MAXIMO_CGI_MESES,
    sistemaAmortizacao: 'SAC', indexadoIpca: true,
  },
  santander: {
    id: 'santander', nome: 'Santander', cor: '#EC0000', corTexto: '#ffffff',
    taxaAnualBase: 0.20, ltvMax: 0.60, prazoMaximoMeses: PRAZO_MAXIMO_CGI_MESES,
    sistemaAmortizacao: 'PRICE', indexadoIpca: false,
  },
  bradesco: {
    id: 'bradesco', nome: 'Bradesco', cor: '#CC092F', corTexto: '#ffffff',
    taxaAnualBase: 0.20, ltvMax: 0.60, prazoMaximoMeses: PRAZO_MAXIMO_CGI_MESES,
    sistemaAmortizacao: 'SAC', indexadoIpca: false,
  },
}

export const TODOS_BANCOS_CGI: BancoCgiId[] = ['inter', 'daycoval', 'cashme', 'santander', 'bradesco']

// V1: todos os bancos usam a mesma LTV (60%) — usado só para resolver "quero o máximo"
// sem banco específico, antes de rodar o motor. Se a LTV passar a variar por banco no
// futuro, este atalho precisa ser revisto (hoje é seguro porque é uniforme).
export const LTV_PADRAO_CGI = 0.60

// Nota de proveniência da fórmula de IOF — ver docs/calibracao-simuladores/biblioteca-bancos/
// pendencias-de-calibracao.md (seção 7) e resumo-comparativo.md (seção 6): a alíquota
// 0,38% + 0,0082%/dia (teto 3%/ano) é confirmada oficialmente apenas para Itaú CGI (fora
// desta lista de 5 bancos); é a alíquota federal padrão de operações de crédito (Decreto
// 6.306/2007), plausível para qualquer banco, mas não confirmada individualmente aqui.
export const NOTA_IOF_CGI =
  'IOF estimado pela alíquota federal padrão de operações de crédito (0,38% + 0,0082%/dia, ' +
  'limitado a 3% a.a.); não confirmado individualmente para este banco. Forma de cobrança ' +
  '(à parte, descontada do valor liberado ou financiada no saldo) varia por instituição e ' +
  'será confirmada na análise de crédito.'

export const NOTA_IDADE_NAO_INFORMADA_CGI =
  'Data de nascimento não informada nesta simulação — prazo sujeito à validação pela idade do proponente (idade + prazo não pode ultrapassar 80 anos e 3 meses).'

export function notaLimitadoPelaIdadeCgi(prazoConsiderado: number): string {
  return `Prazo solicitado ajustado para ${prazoConsiderado} meses em razão do limite de idade de 80 anos e 3 meses ao término da operação.`
}

export function notaTaxaCgi(cfg: BancoCgiConfig): string {
  const pct = (cfg.taxaAnualBase * 100).toFixed(2).replace('.', ',')
  return cfg.indexadoIpca
    ? `Taxa de referência para simulação: ${pct}% a.a. + atualização pelo IPCA (não projetada nesta simulação).`
    : `Taxa de referência para simulação: a partir de ${pct}% a.a. (taxa fixa).`
}
