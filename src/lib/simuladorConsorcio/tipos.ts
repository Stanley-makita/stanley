// Réplica do modelo Excel "Consórcio x Compra à vista" (Itaú Consórcio) —
// ver squads/credifon-crm/Modelo simulador consorcio/Modelo Simulador Consorcio itau.xlsx

export interface InputConsorcio {
  valorDisponivelLiquido: number
  valorBem: number
  valorCarta: number
  mesLanceContemplacao: number
  percentualLance: number          // 0-1
  rendimentoMensal: number         // 0-1
  percentualLanceEmbutido: number  // 0-1
  prazoMeses: number
  taxaAdmPercentual: number        // 0-1
  indiceCorrecaoAnual: number      // 0-1
  valorizacaoBemAnual: number      // 0-1
  percentualParcelaReduzida: number // 0-1
  fundoReservaPercentual: number   // 0-1
  aluguelAtivo: boolean
  valorAluguelSaidaMensal?: number
  valorAluguelEntradaMensal?: number
  nomeCliente?: string
  cpfCliente?: string
  // Estimativa editorial (não calculável — varia por administradora/grupo,
  // não confundir com mesLanceContemplacao que é a intenção do comprador),
  // texto livre pra impressão na proposta, ex.: "36 a 40 meses".
  prazoEstimadoContemplacao?: string
}

// Uma linha do cronograma mensal (colunas F:Y da planilha). `null` reproduz
// as células que ficam vazias no Excel (ex.: carta[m] depois do mês de
// lance/contemplação, ou qualquer coluna depois de prazoMeses).
export interface LinhaMensalConsorcio {
  mes: number
  ano: number
  carta: number | null
  saldoDevedor: number | null
  parcela: number | null
  parcelaAno: number | null
  lance: number
  correcao: number | null
  flagLance: 0 | 1
  aluguelSaida: number
  aluguelEntrada: number
  rendimento: number
  saldoAplicacao: number
  ganhoImovelConsorcio: number
  imovelConsorcio: number
  imovelAVista: number
}

// Campos de célula única calculados a partir dos inputs (Bloco 1/2 da
// planilha que parecem input mas são fórmula) + as duas constantes
// derivadas da série de cartas, usadas dentro do loop mensal.
export interface AgregadosPreLoop {
  taxaAdmReais: number
  valorComLanceEmbutido: number
  valorLiquidoDaCarta: number
  valorizacaoBemMensal: number
  lanceEmbutidoValor: number
  devolucaoValor: number
}

// Bloco 3 da planilha — 100% resultado, nenhum input aqui.
export interface ResumoConsorcio {
  valorDoLance: number
  lanceEmbutido: number
  lanceProprio: number
  valorLiquido: number
  devolucao: number
  correcaoSaldoDevedor: number
  correcaoValorDaCarta: number
  custoDeCorrecao: number
  custoDeAdm: number
  custoTotal: number
  saldoLiquido: number
}

// Bloco "Patrimônio" (comparativo topo-esquerda da planilha).
export interface ComparativoPatrimonio {
  patrimonioCompraAVista: number
  patrimonioCompraConsorcio: number
  prazoEmAnos: number
  cetAnual: number
}

export interface ResultadoConsorcio {
  input: InputConsorcio
  agregados: AgregadosPreLoop
  linhas: LinhaMensalConsorcio[]
  resumo: ResumoConsorcio
  comparativo: ComparativoPatrimonio
  dataSimulacao: string
}
