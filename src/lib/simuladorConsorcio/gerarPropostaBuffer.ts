/**
 * "Versão Proposta" — variante buffer (servidor, WhatsApp) de ./gerarProposta.ts.
 * Mesmo layout, sem APIs de browser — logos embutidas em base64 (logos.ts) e
 * dimensionamento via doc.getImageProperties() em vez de img.naturalWidth/Height.
 * Nunca criar um terceiro template. Este arquivo apenas adapta a saída.
 */
import type { LinhaMensalConsorcio, ResultadoConsorcio } from './tipos'
import { LOGO_FONTINHAS_PROPOSTA, LOGO_ITAU_CONSORCIO_SELO } from './logos'
import type { VarianteProposta } from './gerarProposta'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const PCT = (v: number) => `${(v * 100).toFixed(0)}%`
const PCT2 = (v: number) => `${(v * 100).toFixed(2)}%`
const COR_VERDE   = '#1B3A2B'
const COR_DOURADO = '#C2AA6A'
const COR_CREME   = '#F2F0E8'

function fitInBox(nW: number, nH: number, maxW: number, maxH: number): [number, number] {
  const r = nW / nH
  let w = maxW, h = w / r
  if (h > maxH) { h = maxH; w = h * r }
  return [w, h]
}

// Reduz o tamanho da fonte até o texto caber na largura disponível (com
// margem), sem nunca passar de tamanhoMax nem ficar ilegível abaixo de 4pt.
function ajustarFontePraCaber(doc: Doc, texto: string, larguraDisponivel: number, tamanhoMax: number): number {
  doc.setFontSize(tamanhoMax)
  const largura = doc.getTextWidth(texto)
  if (largura <= larguraDisponivel) return tamanhoMax
  return Math.max(4, tamanhoMax * (larguraDisponivel / largura))
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

// Substitui caracteres fora do WinAnsi (Helvetica embutido no jsPDF).
function pdf(text: string): string {
  return text
    .replace(/[★✓✗•◆►▸▶]/g, '*')
    .replace(/[""„‟]/g, '"')
    .replace(/['''‚‛]/g, "'")
    .replace(/[–—]/g, '-')
}

type Doc = InstanceType<typeof import('jspdf')['jsPDF']>

function setFill(doc: Doc, hex: string) { doc.setFillColor(...hexToRgb(hex)) }
function setDraw(doc: Doc, hex: string) { doc.setDrawColor(...hexToRgb(hex)) }
function setTxt(doc: Doc, hex: string)  { doc.setTextColor(...hexToRgb(hex)) }

interface GrupoParcela { inicio: number; fim: number; count: number; valor: number }
function agruparParcelasIguais(linhas: LinhaMensalConsorcio[]): GrupoParcela[] {
  const grupos: GrupoParcela[] = []
  for (const l of linhas) {
    const valor = l.parcela ?? 0
    const atual = grupos[grupos.length - 1]
    if (atual && Math.abs(atual.valor - valor) < 0.005) {
      atual.fim = l.mes
      atual.count++
    } else {
      grupos.push({ inicio: l.mes, fim: l.mes, count: 1, valor })
    }
  }
  return grupos
}

function desenharCabecalho(doc: Doc, mL: number, y: number, usableW: number, tituloTopo: string, subtitulo: string): number {
  const HEADER_H = 20
  setFill(doc, COR_VERDE)
  doc.rect(mL, y, usableW, HEADER_H, 'F')

  const fProps = doc.getImageProperties(LOGO_FONTINHAS_PROPOSTA)
  const [fW, fH] = fitInBox(fProps.width, fProps.height, 55, HEADER_H - 4)
  doc.addImage(LOGO_FONTINHAS_PROPOSTA, 'PNG', mL + 3, y + (HEADER_H - fH) / 2, fW, fH)

  doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text(pdf(tituloTopo), mL + usableW / 2, y + 9, { align: 'center' })
  doc.setFontSize(9.5); setTxt(doc, COR_DOURADO)
  doc.text(pdf(subtitulo), mL + usableW / 2, y + 15, { align: 'center' })

  const iProps = doc.getImageProperties(LOGO_ITAU_CONSORCIO_SELO)
  const [iW, iH] = fitInBox(iProps.width, iProps.height, 30, HEADER_H - 4)
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(255, 255, 255)
  doc.text('Representante Autorizado', mL + usableW - iW - 3, y + 6, { align: 'left' })
  doc.addImage(LOGO_ITAU_CONSORCIO_SELO, 'PNG', mL + usableW - iW - 3, y + 7, iW, iH - 3)

  return y + HEADER_H + 3
}

function desenharCaixaItens(doc: Doc, x: number, y: number, w: number, itens: [string, string][], titulo?: string): number {
  const rowH = 6.5
  const tituloH = titulo ? 6 : 0
  const h = tituloH + itens.length * rowH + 2

  setDraw(doc, '#DDDDDD'); doc.setLineWidth(0.3)
  doc.rect(x, y, w, h, 'S')

  let cy = y
  if (titulo) {
    setFill(doc, COR_VERDE)
    doc.rect(x, cy, w, tituloH, 'F')
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
    doc.text(pdf(titulo), x + 2, cy + tituloH / 2 + 1.5)
    cy += tituloH
  }

  itens.forEach(([label, val], i) => {
    if (i % 2 === 0) { setFill(doc, COR_CREME); doc.rect(x, cy, w, rowH, 'F') }
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); setTxt(doc, '#666666')
    doc.text(pdf(label), x + 2, cy + rowH / 2 + 1)
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
    doc.text(pdf(val), x + w - 2, cy + rowH / 2 + 1.5, { align: 'right' })
    cy += rowH
  })

  return h
}

function itensPrincipais(resultado: ResultadoConsorcio, incluirContemplacao: boolean): [string, string][] {
  const { input, comparativo, resumo } = resultado
  const itens: [string, string][] = [
    ['Prazo em anos', String(comparativo.prazoEmAnos)],
    ['Prazo em meses', String(input.prazoMeses)],
    ['CET a.a', PCT2(comparativo.cetAnual)],
    ['Valor da Proposta', BRL.format(input.valorCarta)],
    ['Valor Liquido', BRL.format(resumo.valorLiquido)],
  ]
  if (incluirContemplacao && input.prazoEstimadoContemplacao?.trim()) {
    itens.push(['Prazo estimado contemplacao', input.prazoEstimadoContemplacao.trim()])
  }
  return itens
}

function itensLance(resultado: ResultadoConsorcio): [string, string][] {
  const { input, resumo } = resultado
  return [
    ['Taxa adm', PCT(input.taxaAdmPercentual)],
    ['Indice Correcao', `${PCT(input.indiceCorrecaoAnual)} Fixo`],
    ['Lance Total', BRL.format(resumo.valorDoLance)],
    ['Lance Embutido', BRL.format(resumo.lanceEmbutido)],
    ['Lance proprio', BRL.format(resumo.lanceProprio)],
  ]
}

const INFO_IMPORTANTES = [
  'Valores expressos em reais.',
  'Esta proposta nao contempla fundo de reserva.',
  'O prazo estimado de contemplacao e uma media considerando o historico do grupo e nao representa garantia de contemplacao.',
  'Consulte condicoes gerais, taxas, seguros e regulamento do consorcio.',
]

function desenharInfoImportantes(doc: Doc, x: number, y: number, w: number): number {
  const h = 34
  setFill(doc, '#FBF3E6')
  doc.rect(x, y, w, h, 'F')
  setDraw(doc, COR_DOURADO); doc.setLineWidth(0.3)
  doc.rect(x, y, w, h, 'S')
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
  doc.text('Informacoes Importantes', x + 2, y + 4.5)
  doc.setFontSize(6); doc.setFont('helvetica', 'normal'); setTxt(doc, '#666666')
  let ty = y + 9
  for (const linha of INFO_IMPORTANTES) {
    const wrapped = doc.splitTextToSize(`*  ${linha}`, w - 4)
    doc.text(wrapped, x + 2, ty, { lineHeightFactor: 1.3 })
    ty += wrapped.length * 2.6 + 1.5
  }
  return h
}

function desenharRodape(doc: Doc, mL: number, mR: number, pageW: number, pageH: number, mBot: number) {
  const y = pageH - mBot - 12
  setDraw(doc, COR_DOURADO); doc.setLineWidth(0.4)
  doc.line(mL, y, pageW - mR, y)
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
  doc.text('Fontinhas Assessoria', mL, y + 5)
  doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); setTxt(doc, '#888888')
  doc.text('Especialistas em credito imobiliario e consorcios.', mL, y + 8.5)
  doc.setFontSize(6.5); setTxt(doc, '#666666')
  doc.text(
    'Esta simulacao e baseada nas informacoes fornecidas e nas condicoes vigentes na data da proposta. Sujeita a analise de credito e aprovacao da administradora.',
    pageW - mR, y + 5, { align: 'right', maxWidth: 120 },
  )
}

function desenharDetalhada(doc: Doc, resultado: ResultadoConsorcio) {
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const mL = 8, mR = 8, mTop = 8, mBot = 8
  const usableW = pageW - mL - mR
  let y = mTop

  y = desenharCabecalho(doc, mL, y, usableW, 'PROPOSTA DE CONSORCIO', 'CONSORCIO ITAU')

  const colW = usableW / 3 - 2
  const h1 = desenharCaixaItens(doc, mL, y, colW, itensPrincipais(resultado, true))
  const h2 = desenharCaixaItens(doc, mL + colW + 3, y, colW, itensLance(resultado))
  const h3 = desenharInfoImportantes(doc, mL + (colW + 3) * 2, y, colW)
  y += Math.max(h1, h2, h3) + 4

  const totalParcelas = resultado.linhas.length
  setFill(doc, COR_VERDE)
  doc.rect(mL, y, usableW, 7, 'F')
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text(`PLANO DE PAGAMENTO - ${totalParcelas} PARCELAS`, mL + usableW / 2, y + 5, { align: 'center' })
  y += 7 + 2

  const tableTop = y
  const tableH = pageH - mBot - 16 - tableTop
  // thH fixo (ver comentário em gerarProposta.ts) — evita que a última
  // linha de cada bloco seja cortada na metade pelo rodapé.
  const thH = 4
  const minRowH = 3.1
  const maxRowsPerCol = Math.max(1, Math.floor((tableH - thH) / minRowH))
  const colunas = Math.max(3, Math.min(8, Math.ceil(totalParcelas / maxRowsPerCol)))
  const rowsPerCol = Math.ceil(totalParcelas / colunas)
  const rowH = (tableH - thH) / rowsPerCol
  const blocoW = usableW / colunas

  // Ver comentário em gerarProposta.ts: colunas com largura proporcional
  // ("Parcela" é só um número curto, "Mensal"/"Anual" são valores em reais
  // bem mais largos) + fonte calculada pra caber no pior caso, em vez de
  // thirds iguais e tamanho fixo que estouravam o texto pra fora da célula.
  const fracoesCol = [0.24, 0.38, 0.38]
  const subColWs = fracoesCol.map((f) => f * blocoW)
  const subColXs = [0, subColWs[0], subColWs[0] + subColWs[1]]

  const valorMaisLargo = resultado.linhas.reduce((maior, l) => {
    const candidatos = [BRL.format(l.parcela ?? 0), BRL.format(l.parcelaAno ?? 0), maior]
    return candidatos.reduce((a, b) => (b.length > a.length ? b : a))
  }, '')
  const larguraColValor = Math.min(subColWs[1], subColWs[2]) - 2
  const fonteDados = ajustarFontePraCaber(doc, valorMaisLargo, larguraColValor, Math.min(6, rowH * 1.8))
  const fonteHeader = Math.min(6, thH * 1.3, fonteDados + 0.5)

  for (let b = 0; b < colunas; b++) {
    const bx = mL + b * blocoW
    // Sem coluna "Mes" — era idêntica à "Parcela" (parcela = mês nesse
    // modelo, não há numeração própria), só ocupava espaço e apertava as
    // colunas de valor até sobrepor o texto.
    setFill(doc, COR_VERDE)
    doc.rect(bx, tableTop, blocoW, thH, 'F')
    doc.setFontSize(fonteHeader); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
    ;['Parcela', 'Mensal', 'Anual'].forEach((h, i) => {
      doc.text(h, bx + subColXs[i] + subColWs[i] / 2, tableTop + thH / 2 + 1, { align: 'center' })
    })

    const inicio = b * rowsPerCol
    const fim = Math.min(inicio + rowsPerCol, totalParcelas)
    doc.setFontSize(fonteDados)
    for (let i = inicio; i < fim; i++) {
      const l = resultado.linhas[i]
      const ry = tableTop + thH + (i - inicio) * rowH
      if ((i - inicio) % 2 === 0) { setFill(doc, '#F8F8F5'); doc.rect(bx, ry, blocoW, rowH, 'F') }
      doc.setFont('helvetica', 'normal'); setTxt(doc, '#333333')
      const vals = [String(l.mes), BRL.format(l.parcela ?? 0), BRL.format(l.parcelaAno ?? 0)]
      vals.forEach((v, ci) => doc.text(v, bx + subColXs[ci] + subColWs[ci] / 2, ry + rowH / 2 + 1, { align: 'center' }))
    }
    setDraw(doc, '#DDDDDD'); doc.setLineWidth(0.2)
    doc.rect(bx, tableTop, blocoW, thH + rowsPerCol * rowH, 'S')
  }

  desenharRodape(doc, mL, mR, pageW, pageH, mBot)
}

function desenharResumida(doc: Doc, resultado: ResultadoConsorcio) {
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const mL = 10, mR = 10, mTop = 8, mBot = 8
  const usableW = pageW - mL - mR
  let y = mTop

  y = desenharCabecalho(doc, mL, y, usableW, 'Proposta de Consorcio de Imovel - Itau', 'Fontinhas Assessoria - Representante Autorizado')

  if (resultado.input.nomeCliente) {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
    doc.text(pdf(`Cliente: ${resultado.input.nomeCliente}`), mL, y + 4)
    y += 8
  } else {
    y += 2
  }

  const colEsqW = usableW * 0.4
  const colDirW = usableW - colEsqW - 6
  const colDirX = mL + colEsqW + 6

  let ye = y
  ye += desenharCaixaItens(doc, mL, ye, colEsqW, itensPrincipais(resultado, true), 'Condicoes da Carta') + 3
  const { resumo } = resultado
  ye += desenharCaixaItens(doc, mL, ye, colEsqW, [
    ['Lance Embutido', BRL.format(resumo.lanceEmbutido)],
    ['Lance Proprio', BRL.format(resumo.lanceProprio)],
    ['Lance Total', BRL.format(resumo.valorDoLance)],
  ], 'Estrutura de Lance') + 3

  const grupos = agruparParcelasIguais(resultado.linhas)
  const titH = 6
  setFill(doc, COR_VERDE)
  doc.rect(colDirX, y, colDirW, titH, 'F')
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text('Evolucao das Parcelas Mensais', colDirX + 2, y + titH / 2 + 1.5)
  let yd = y + titH + 1

  const subColW = colDirW / 2 - 1.5
  const half = Math.ceil(grupos.length / 2)
  const rowH2 = 6
  const thH2 = 5

  ;[grupos.slice(0, half), grupos.slice(half)].forEach((lista, colIdx) => {
    const gx = colDirX + colIdx * (subColW + 3)
    setFill(doc, '#EDEBE0')
    doc.rect(gx, yd, subColW, thH2, 'F')
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
    doc.text('Parcelas', gx + subColW * 0.28, yd + thH2 / 2 + 1, { align: 'center' })
    doc.text('Meses', gx + subColW * 0.55, yd + thH2 / 2 + 1, { align: 'center' })
    doc.text('Valor Mensal', gx + subColW * 0.82, yd + thH2 / 2 + 1, { align: 'center' })

    lista.forEach((g, i) => {
      const ry = yd + thH2 + i * rowH2
      if (i % 2 === 0) { setFill(doc, COR_CREME); doc.rect(gx, ry, subColW, rowH2, 'F') }
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setTxt(doc, '#444444')
      const label = g.inicio === g.fim ? `${g.inicio}a` : `${g.inicio}a - ${g.fim}a`
      doc.text(label, gx + subColW * 0.28, ry + rowH2 / 2 + 1, { align: 'center' })
      doc.text(`${g.count}x`, gx + subColW * 0.55, ry + rowH2 / 2 + 1, { align: 'center' })
      doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
      doc.text(BRL.format(g.valor), gx + subColW * 0.82, ry + rowH2 / 2 + 1, { align: 'center' })
    })
  })

  desenharRodape(doc, mL, mR, pageW, pageH, mBot)
}

export async function gerarPropostaConsorcioBuffer(
  resultado: ResultadoConsorcio,
  variante: VarianteProposta,
): Promise<Buffer> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  if (variante === 'detalhada') {
    desenharDetalhada(doc, resultado)
  } else {
    desenharResumida(doc, resultado)
  }

  return Buffer.from(doc.output('arraybuffer'))
}
