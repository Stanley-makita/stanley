// "Versão Proposta" — relatório de cliente do simulador de Consórcio, em duas
// variantes (ver PropostaModal.tsx): Detalhada (parcela a parcela, uma página
// paisagem) e Resumida (condições + evolução de parcelas agrupada). Layout
// aprovado pelo usuário a partir de dois modelos visuais (Itaú Consórcio).
//
// Adicional ao gerarPDF.ts (relatório interno básico, Fase 1) — não substitui.
import type { LinhaMensalConsorcio, ResultadoConsorcio } from './tipos'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const PCT = (v: number) => `${(v * 100).toFixed(0)}%`
const COR_VERDE   = '#1B3A2B'
const COR_DOURADO = '#C2AA6A'
const COR_CREME   = '#F2F0E8'

export type VarianteProposta = 'detalhada' | 'resumida'

interface ImageInfo { dataUrl: string; naturalW: number; naturalH: number }

async function loadImage(url: string): Promise<ImageInfo | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(null); return }
      ctx.drawImage(img, 0, 0)
      resolve({ dataUrl: canvas.toDataURL('image/png'), naturalW: img.naturalWidth, naturalH: img.naturalHeight })
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

function fitInBox(nW: number, nH: number, maxW: number, maxH: number): [number, number] {
  const r = nW / nH
  let w = maxW, h = w / r
  if (h > maxH) { h = maxH; w = h * r }
  return [w, h]
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

type Doc = InstanceType<typeof import('jspdf')['jsPDF']>

function setFill(doc: Doc, hex: string) { doc.setFillColor(...hexToRgb(hex)) }
function setDraw(doc: Doc, hex: string) { doc.setDrawColor(...hexToRgb(hex)) }
function setTxt(doc: Doc, hex: string)  { doc.setTextColor(...hexToRgb(hex)) }

// Agrupa meses consecutivos com o mesmo valor de parcela — não é "de 12 em 12"
// (a parcela reduzida some exatamente no mês do lance, que raramente cai numa
// virada de ano), é o valor real que muda.
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

interface Assets {
  fontinhas: ImageInfo | null
  itauSelo: ImageInfo | null
}

async function carregarAssets(): Promise<Assets> {
  const [fontinhas, itauSelo] = await Promise.all([
    // Arquivos copiados de "logotipos empresa/" (raiz do projeto, fora do
    // código) para public/images/logos/ — se o original mudar, recopiar.
    loadImage('/images/logos/logo-fontinhas-proposta.png'),
    loadImage('/images/logos/selo-consorcio-itau-autorizado.png'),
  ])
  return { fontinhas, itauSelo }
}

function desenharCabecalho(
  doc: Doc, assets: Assets, mL: number, y: number, usableW: number,
  tituloTopo: string, subtitulo: string,
): number {
  const HEADER_H = 20
  setFill(doc, COR_VERDE)
  doc.rect(mL, y, usableW, HEADER_H, 'F')

  if (assets.fontinhas) {
    const [w, h] = fitInBox(assets.fontinhas.naturalW, assets.fontinhas.naturalH, 55, HEADER_H - 4)
    doc.addImage(assets.fontinhas.dataUrl, 'PNG', mL + 3, y + (HEADER_H - h) / 2, w, h)
  }

  doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text(tituloTopo, mL + usableW / 2, y + 9, { align: 'center' })
  doc.setFontSize(9.5); setTxt(doc, COR_DOURADO)
  doc.text(subtitulo, mL + usableW / 2, y + 15, { align: 'center' })

  if (assets.itauSelo) {
    const [w, h] = fitInBox(assets.itauSelo.naturalW, assets.itauSelo.naturalH, 30, HEADER_H - 4)
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(255, 255, 255)
    doc.text('Representante Autorizado', mL + usableW - w - 3, y + 6, { align: 'left' })
    doc.addImage(assets.itauSelo.dataUrl, 'PNG', mL + usableW - w - 3, y + 7, w, h - 3)
  }

  return y + HEADER_H + 3
}

function desenharCaixaItens(
  doc: Doc, x: number, y: number, w: number, itens: [string, string][], titulo?: string,
): number {
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
    doc.text(titulo, x + 2, cy + tituloH / 2 + 1.5)
    cy += tituloH
  }

  itens.forEach(([label, val], i) => {
    if (i % 2 === 0) { setFill(doc, COR_CREME); doc.rect(x, cy, w, rowH, 'F') }
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); setTxt(doc, '#666666')
    doc.text(label, x + 2, cy + rowH / 2 + 1)
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
    doc.text(val, x + w - 2, cy + rowH / 2 + 1.5, { align: 'right' })
    cy += rowH
  })

  return h
}

function itensPrincipais(resultado: ResultadoConsorcio, incluirContemplacao: boolean): [string, string][] {
  const { input, comparativo } = resultado
  const itens: [string, string][] = [
    ['Prazo em anos', String(comparativo.prazoEmAnos)],
    ['Prazo em meses', String(input.prazoMeses)],
    ['CET a.a', PCT(comparativo.cetAnual)],
    ['Valor da carta', BRL.format(input.valorCarta)],
  ]
  if (incluirContemplacao && input.prazoEstimadoContemplacao?.trim()) {
    itens.push(['Prazo estimado contemplação', input.prazoEstimadoContemplacao.trim()])
  }
  return itens
}

function itensLance(resultado: ResultadoConsorcio): [string, string][] {
  const { input, resumo } = resultado
  return [
    ['Taxa adm', PCT(input.taxaAdmPercentual)],
    ['Índice Correção', `${PCT(input.indiceCorrecaoAnual)} Fixo`],
    ['Lance Total', BRL.format(resumo.valorDoLance)],
    ['Lance Embutido', BRL.format(resumo.lanceEmbutido)],
    ['Lance próprio', BRL.format(resumo.lanceProprio)],
  ]
}

const INFO_IMPORTANTES = [
  'Valores expressos em reais.',
  'Esta proposta não contempla fundo de reserva.',
  'O prazo estimado de contemplação é uma média considerando o histórico do grupo e não representa garantia de contemplação.',
  'Consulte condições gerais, taxas, seguros e regulamento do consórcio.',
]

function desenharInfoImportantes(doc: Doc, x: number, y: number, w: number): number {
  const h = 34
  setFill(doc, '#FBF3E6')
  doc.rect(x, y, w, h, 'F')
  setDraw(doc, COR_DOURADO); doc.setLineWidth(0.3)
  doc.rect(x, y, w, h, 'S')
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
  doc.text('Informações Importantes', x + 2, y + 4.5)
  doc.setFontSize(6); doc.setFont('helvetica', 'normal'); setTxt(doc, '#666666')
  let ty = y + 9
  for (const linha of INFO_IMPORTANTES) {
    const wrapped = doc.splitTextToSize(`•  ${linha}`, w - 4)
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
  doc.text('Especialistas em crédito imobiliário e consórcios.', mL, y + 8.5)
  doc.setFontSize(6.5); setTxt(doc, '#666666')
  doc.text(
    'Esta simulação é baseada nas informações fornecidas e nas condições vigentes na data da proposta. Sujeita à análise de crédito e aprovação da administradora.',
    pageW - mR, y + 5, { align: 'right', maxWidth: 120 },
  )
}

// ── Variante Detalhada ──────────────────────────────────────────────────────

function desenharDetalhada(doc: Doc, assets: Assets, resultado: ResultadoConsorcio) {
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const mL = 8, mR = 8, mTop = 8, mBot = 8
  const usableW = pageW - mL - mR
  let y = mTop

  y = desenharCabecalho(doc, assets, mL, y, usableW, 'PROPOSTA DE CONSÓRCIO', 'CONSÓRCIO ITAÚ')

  const colW = usableW / 3 - 2
  const h1 = desenharCaixaItens(doc, mL, y, colW, itensPrincipais(resultado, true))
  const h2 = desenharCaixaItens(doc, mL + colW + 3, y, colW, itensLance(resultado))
  const h3 = desenharInfoImportantes(doc, mL + (colW + 3) * 2, y, colW)
  y += Math.max(h1, h2, h3) + 4

  const totalParcelas = resultado.linhas.length
  setFill(doc, COR_VERDE)
  doc.rect(mL, y, usableW, 7, 'F')
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text(`PLANO DE PAGAMENTO – ${totalParcelas} PARCELAS`, mL + usableW / 2, y + 5, { align: 'center' })
  y += 7 + 2

  const tableTop = y
  const tableH = pageH - mBot - 16 - tableTop
  const minRowH = 3.1
  const maxRowsPerCol = Math.max(1, Math.floor(tableH / minRowH))
  const colunas = Math.max(3, Math.min(8, Math.ceil(totalParcelas / maxRowsPerCol)))
  const rowsPerCol = Math.ceil(totalParcelas / colunas)
  const rowH = tableH / rowsPerCol
  const blocoW = usableW / colunas
  const thH = Math.min(5, rowH * 1.4)

  for (let b = 0; b < colunas; b++) {
    const bx = mL + b * blocoW
    const subColW = blocoW / 4
    setFill(doc, COR_VERDE)
    doc.rect(bx, tableTop, blocoW, thH, 'F')
    doc.setFontSize(Math.min(6, thH * 1.3)); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
    ;['Parcela', 'Mês', 'Mensal', 'Anual'].forEach((h, i) => {
      doc.text(h, bx + i * subColW + subColW / 2, tableTop + thH / 2 + 1, { align: 'center' })
    })

    const inicio = b * rowsPerCol
    const fim = Math.min(inicio + rowsPerCol, totalParcelas)
    doc.setFontSize(Math.min(6.5, rowH * 1.8))
    for (let i = inicio; i < fim; i++) {
      const l = resultado.linhas[i]
      const ry = tableTop + thH + (i - inicio) * rowH
      if ((i - inicio) % 2 === 0) { setFill(doc, '#F8F8F5'); doc.rect(bx, ry, blocoW, rowH, 'F') }
      doc.setFont('helvetica', 'normal'); setTxt(doc, '#333333')
      const vals = [String(l.mes), String(l.mes), BRL.format(l.parcela ?? 0), BRL.format(l.parcelaAno ?? 0)]
      vals.forEach((v, ci) => doc.text(v, bx + ci * subColW + subColW / 2, ry + rowH / 2 + 1, { align: 'center' }))
    }
    setDraw(doc, '#DDDDDD'); doc.setLineWidth(0.2)
    doc.rect(bx, tableTop, blocoW, thH + rowsPerCol * rowH, 'S')
  }

  desenharRodape(doc, mL, mR, pageW, pageH, mBot)
}

// ── Variante Resumida ────────────────────────────────────────────────────────

function desenharResumida(doc: Doc, assets: Assets, resultado: ResultadoConsorcio) {
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const mL = 10, mR = 10, mTop = 8, mBot = 8
  const usableW = pageW - mL - mR
  let y = mTop

  y = desenharCabecalho(doc, assets, mL, y, usableW, 'Proposta de Consórcio de Imóvel — Itaú', 'Fontinhas Assessoria — Representante Autorizado')

  if (resultado.input.nomeCliente) {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
    doc.text(`Cliente: ${resultado.input.nomeCliente}`, mL, y + 4)
    y += 8
  } else {
    y += 2
  }

  const colEsqW = usableW * 0.4
  const colDirW = usableW - colEsqW - 6
  const colDirX = mL + colEsqW + 6

  let ye = y
  ye += desenharCaixaItens(doc, mL, ye, colEsqW, itensPrincipais(resultado, true), 'Condições da Carta') + 3
  const { resumo } = resultado
  ye += desenharCaixaItens(doc, mL, ye, colEsqW, [
    ['Lance Embutido', BRL.format(resumo.lanceEmbutido)],
    ['Lance Próprio', BRL.format(resumo.lanceProprio)],
    ['Lance Total', BRL.format(resumo.valorDoLance)],
  ], 'Estrutura de Lance') + 3

  // Evolução das parcelas mensais — agrupadas por valor constante consecutivo
  // (a parcela reduzida some no mês do lance, não necessariamente na virada
  // de ano — ver agruparParcelasIguais).
  const grupos = agruparParcelasIguais(resultado.linhas)
  const titH = 6
  setFill(doc, COR_VERDE)
  doc.rect(colDirX, y, colDirW, titH, 'F')
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text('Evolução das Parcelas Mensais', colDirX + 2, y + titH / 2 + 1.5)
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
      const label = g.inicio === g.fim ? `${g.inicio}ª` : `${g.inicio}ª – ${g.fim}ª`
      doc.text(label, gx + subColW * 0.28, ry + rowH2 / 2 + 1, { align: 'center' })
      doc.text(`${g.count}x`, gx + subColW * 0.55, ry + rowH2 / 2 + 1, { align: 'center' })
      doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
      doc.text(BRL.format(g.valor), gx + subColW * 0.82, ry + rowH2 / 2 + 1, { align: 'center' })
    })
  })

  desenharRodape(doc, mL, mR, pageW, pageH, mBot)
}

export interface PropostaOptions {
  mode?: 'download' | 'preview'
}

export async function gerarPropostaConsorcio(
  resultado: ResultadoConsorcio,
  variante: VarianteProposta,
  options: PropostaOptions = {},
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const assets = await carregarAssets()

  if (variante === 'detalhada') {
    desenharDetalhada(doc, assets, resultado)
  } else {
    desenharResumida(doc, assets, resultado)
  }

  const nomeCliente = (resultado.input.nomeCliente ?? '').trim()
  const sufixo = variante === 'detalhada' ? 'Detalhada' : 'Resumida'
  const nomeArquivo = nomeCliente
    ? `Proposta de Consórcio ${sufixo} - ${nomeCliente}.pdf`
    : `Proposta de Consórcio ${sufixo}.pdf`

  if (options.mode === 'preview') {
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank', 'noopener,noreferrer')
    if (!win) {
      const a = document.createElement('a')
      a.href = url
      a.download = nomeArquivo
      a.click()
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } else {
    doc.save(nomeArquivo)
  }
}
