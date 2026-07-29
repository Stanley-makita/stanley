// Motor de cálculo puro do simulador de Consórcio — porta fórmula-a-fórmula
// da planilha "Consórcio x Compra à vista" (Itaú Consórcio). Sem I/O, sem
// dependência de framework — reutilizável por UI, PDF (fase 2) e bot (fase 4).
import type {
  InputConsorcio,
  LinhaMensalConsorcio,
  AgregadosPreLoop,
  ResumoConsorcio,
  ComparativoPatrimonio,
  ResultadoConsorcio,
} from './tipos'

function maxOuZero(valores: Array<number | null>): number {
  let max = 0
  for (const v of valores) if (v != null && v > max) max = v
  return max
}

// Passo 1 — série de "carta" por mês. Só depende dos inputs (sem estado de
// loop), por isso pode ser calculada antes de tudo — precisamos do MAX()
// dessa série pra derivar `lanceEmbutidoValor`/`devolucaoValor` (usados
// dentro do loop mensal, ver calcularAgregadosPreLoop).
export function calcularSerieCartas(input: InputConsorcio): Array<number | null> {
  const serie: Array<number | null> = []
  for (let mes = 1; mes <= input.prazoMeses; mes++) {
    const ano = Math.ceil(mes / 12)
    if (mes === 1) {
      serie.push(input.valorCarta)
    } else if (input.mesLanceContemplacao >= mes) {
      serie.push(input.valorCarta * Math.pow(1 + input.indiceCorrecaoAnual, ano - 1))
    } else {
      serie.push(null)
    }
  }
  return serie
}

// Passo 2 — campos de célula única (Bloco 1/2 da planilha que parecem input
// mas são fórmula) + as duas constantes referenciadas dentro do loop mensal.
export function calcularAgregadosPreLoop(
  input: InputConsorcio,
  cartaSerie: Array<number | null>,
): AgregadosPreLoop {
  const taxaAdmReais = input.valorCarta * (input.taxaAdmPercentual + input.fundoReservaPercentual)
  const valorComLanceEmbutido = input.valorBem / (1 - input.percentualLanceEmbutido)
  const valorLiquidoDaCarta = valorComLanceEmbutido * (1 - input.percentualLanceEmbutido)
  const valorizacaoBemMensal = Math.pow(1 + input.valorizacaoBemAnual, 1 / 12) - 1

  const maxCarta = maxOuZero(cartaSerie)
  const lanceEmbutidoValor = input.percentualLanceEmbutido * maxCarta
  const valorLiquidoPreliminar = maxCarta - lanceEmbutidoValor
  const devolucaoValor = valorLiquidoPreliminar - input.valorBem

  return {
    taxaAdmReais,
    valorComLanceEmbutido,
    valorLiquidoDaCarta,
    valorizacaoBemMensal,
    lanceEmbutidoValor,
    devolucaoValor,
  }
}

// Passo 3 — loop sequencial mês a mês (colunas F:Y da planilha), carregando
// os valores da linha anterior como variáveis locais.
export function calcularLinhasMensais(
  input: InputConsorcio,
  cartaSerie: Array<number | null>,
  agregados: AgregadosPreLoop,
): LinhaMensalConsorcio[] {
  const linhas: LinhaMensalConsorcio[] = []
  const aluguelSaidaMensal = input.aluguelAtivo ? (input.valorAluguelSaidaMensal ?? 0) : 0
  const aluguelEntradaMensal = input.aluguelAtivo ? (input.valorAluguelEntradaMensal ?? 0) : 0

  let prevSaldoDevedor = 0
  let prevParcelaAno = 0
  let prevLance = 0
  let prevDevolucao = 0
  let prevAno = 0
  let prevAluguelSaida = 0
  let prevSaldoAplicacao = input.valorDisponivelLiquido
  let prevImovelConsorcio = 0
  let prevImovelAVista = input.valorBem

  for (let mes = 1; mes <= input.prazoMeses; mes++) {
    const ano = Math.ceil(mes / 12)
    const carta = cartaSerie[mes - 1]

    const correcao = mes === 1 ? 0 : prevSaldoDevedor * input.indiceCorrecaoAnual * (ano - prevAno)

    // lance[mes] depende de carta[mes] — calculado antes do saldoDevedor pois
    // o caso m=1 da planilha subtrai o lance do próprio saldoDevedor[1] na
    // mesma fórmula. `devolucao[mes]` (col J, rotulada "[OFF]" na planilha
    // mas efetivamente usada) só é não-nula no mês do lance, e é descontada
    // do saldoDevedor no mês SEGUINTE (via prevDevolucao).
    const lance = input.mesLanceContemplacao === mes ? (carta ?? 0) * input.percentualLance : 0
    const devolucaoMes = input.mesLanceContemplacao === mes ? agregados.devolucaoValor : 0

    const saldoDevedor = mes === 1
      ? (input.valorCarta + agregados.taxaAdmReais) - lance - devolucaoMes
      : (correcao === 0
        ? prevSaldoDevedor - prevLance - prevDevolucao
        : prevSaldoDevedor + correcao - prevParcelaAno - prevLance - prevDevolucao)
    const mesesRestantesAno = input.prazoMeses - ((ano - 1) * 12)
    const parcela = input.mesLanceContemplacao >= mes
      ? (saldoDevedor / mesesRestantesAno) * input.percentualParcelaReduzida
      : saldoDevedor / mesesRestantesAno
    const parcelaAno = parcela * 12

    const flagLance: 0 | 1 = lance > 0 ? 1 : 0

    const aluguelSaida = mes === 1
      ? aluguelSaidaMensal
      : (prevAluguelSaida === 0 ? 0 : (mes <= input.mesLanceContemplacao ? aluguelSaidaMensal : 0))

    const aluguelEntrada = input.aluguelAtivo && mes >= input.mesLanceContemplacao ? aluguelEntradaMensal : 0

    const rendimento = mes === 1
      ? input.valorDisponivelLiquido * input.rendimentoMensal
      : prevSaldoAplicacao * input.rendimentoMensal

    const saldoAplicacaoBase = mes === 1 ? input.valorDisponivelLiquido : prevSaldoAplicacao
    const saldoAplicacao = saldoAplicacaoBase + rendimento - parcela - lance - aluguelSaida
      + (flagLance * agregados.lanceEmbutidoValor) + aluguelEntrada

    const ganhoImovelConsorcio = lance > 0 ? (carta ?? 0) - agregados.lanceEmbutidoValor - agregados.devolucaoValor : 0

    const imovelConsorcio = mes === 1
      ? ganhoImovelConsorcio
      : (prevImovelConsorcio === 0
        ? ganhoImovelConsorcio
        : (prevImovelConsorcio + ganhoImovelConsorcio) * (1 + agregados.valorizacaoBemMensal))

    const imovelAVista = mes === 1
      ? input.valorBem
      : prevImovelAVista * (1 + agregados.valorizacaoBemMensal)

    linhas.push({
      mes, ano, carta,
      saldoDevedor,
      parcela, parcelaAno, lance, correcao, flagLance,
      aluguelSaida, aluguelEntrada, rendimento, saldoAplicacao,
      ganhoImovelConsorcio, imovelConsorcio, imovelAVista,
    })

    prevSaldoDevedor = saldoDevedor
    prevParcelaAno = parcelaAno
    prevLance = lance
    prevDevolucao = devolucaoMes
    prevAno = ano
    prevAluguelSaida = aluguelSaida
    prevSaldoAplicacao = saldoAplicacao
    prevImovelConsorcio = imovelConsorcio
    prevImovelAVista = imovelAVista
  }

  return linhas
}

// Passo 4 — Bloco 3 da planilha (100% resultado).
export function calcularResumo(
  input: InputConsorcio,
  linhas: LinhaMensalConsorcio[],
  agregados: AgregadosPreLoop,
): ResumoConsorcio {
  const maxCarta = maxOuZero(linhas.map((l) => l.carta))
  const valorDoLance = maxOuZero(linhas.map((l) => l.lance))
  const lanceEmbutido = agregados.lanceEmbutidoValor
  const lanceProprio = valorDoLance - lanceEmbutido
  const valorLiquido = maxCarta - lanceEmbutido
  const devolucao = agregados.devolucaoValor
  const correcaoSaldoDevedor = linhas.reduce((soma, l) => soma + (l.correcao ?? 0), 0)
  const correcaoValorDaCarta = maxCarta - input.valorCarta
  const custoDeCorrecao = correcaoSaldoDevedor - correcaoValorDaCarta
  const custoDeAdm = agregados.taxaAdmReais
  const custoTotal = custoDeCorrecao + custoDeAdm
  const parcelasAteLance = linhas
    .filter((l) => l.mes <= input.mesLanceContemplacao)
    .reduce((soma, l) => soma + (l.parcela ?? 0), 0)
  const saldoLiquido = maxCarta - valorDoLance - parcelasAteLance

  return {
    valorDoLance, lanceEmbutido, lanceProprio, valorLiquido, devolucao,
    correcaoSaldoDevedor, correcaoValorDaCarta, custoDeCorrecao, custoDeAdm,
    custoTotal, saldoLiquido,
  }
}

// Passo 5 — bloco "Patrimônio" (comparativo topo-esquerda da planilha).
export function calcularComparativo(
  linhas: LinhaMensalConsorcio[],
  resumo: ResumoConsorcio,
): ComparativoPatrimonio {
  const ultima = linhas[linhas.length - 1]
  const patrimonioCompraAVista = ultima?.imovelAVista ?? 0
  const patrimonioCompraConsorcio = (ultima?.imovelConsorcio ?? 0) + (ultima?.saldoAplicacao ?? 0)
  const prazoEmAnos = ultima?.ano ?? 0
  const cetAnual = resumo.saldoLiquido !== 0 && prazoEmAnos !== 0
    ? resumo.custoTotal / resumo.saldoLiquido / prazoEmAnos
    : 0

  return { patrimonioCompraAVista, patrimonioCompraConsorcio, prazoEmAnos, cetAnual }
}

// Orquestrador — a única função que UI, PDF (fase 2) e bot (fase 4) devem
// importar. Puro, sem efeito colateral.
export function simularConsorcio(inputBruto: InputConsorcio): ResultadoConsorcio {
  const input: InputConsorcio = {
    ...inputBruto,
    valorAluguelSaidaMensal: inputBruto.aluguelAtivo ? (inputBruto.valorAluguelSaidaMensal ?? 0) : 0,
    valorAluguelEntradaMensal: inputBruto.aluguelAtivo ? (inputBruto.valorAluguelEntradaMensal ?? 0) : 0,
  }

  const cartaSerie = calcularSerieCartas(input)
  const agregados = calcularAgregadosPreLoop(input, cartaSerie)
  const linhas = calcularLinhasMensais(input, cartaSerie, agregados)
  const resumo = calcularResumo(input, linhas, agregados)
  const comparativo = calcularComparativo(linhas, resumo)

  return {
    input,
    agregados,
    linhas,
    resumo,
    comparativo,
    dataSimulacao: new Date().toISOString(),
  }
}
