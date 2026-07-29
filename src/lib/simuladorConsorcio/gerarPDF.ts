import type { ResultadoConsorcio } from './tipos'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const PCT = (v: number) => `${(v * 100).toFixed(2)}%`
const COR_VERDE   = '#253B29'
const COR_DOURADO = '#C2AA6A'
const COR_BEGE    = '#E7E0C4'

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

function drawSectionTitle(doc: Doc, title: string, y: number, mL: number, usableW: number): number {
  const h = 8
  setFill(doc, COR_VERDE)
  doc.rect(mL, y, usableW, h, 'F')
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(title, mL + 3, y + h / 2 + 2.5)
  return y + h + 1
}

export interface PDFOptions {
  clienteNome?: string
  responsavelNome?: string
  mode?: 'download' | 'preview'
}

export async function gerarPDFConsorcio(
  resultado: ResultadoConsorcio,
  options: PDFOptions = {},
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const imgFontinhas = await loadImage('/images/logos/logotipo%20retangular%20fontinhas%20assessoria.jpg')

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const mL = 12, mR = 12, mTop = 10, mBot = 12
  const usableW = pageW - mL - mR
  let y = mTop

  // ── Cabeçalho ─────────────────────────────────────────────────────────────
  const HEADER_H = 24
  setFill(doc, COR_VERDE)
  doc.rect(mL, y, usableW, HEADER_H, 'F')
  if (imgFontinhas) {
    const [w, h] = fitInBox(imgFontinhas.naturalW, imgFontinhas.naturalH, 75, HEADER_H - 4)
    doc.addImage(imgFontinhas.dataUrl, 'JPEG', mL + 2, y + (HEADER_H - h) / 2, w, h)
  } else {
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
    doc.text('Fontinhas Assessoria Imobiliária', mL + 4, y + HEADER_H / 2 + 3)
  }
  y += HEADER_H + 4

  // ── Linha de identificação ────────────────────────────────────────────────
  const rowH = 9
  setFill(doc, COR_VERDE)
  doc.rect(mL, y, usableW, rowH, 'F')
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  const d = new Date()
  const dataHoje = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  const infoText = [options.clienteNome ?? '', dataHoje, options.responsavelNome ?? ''].filter(Boolean).join('   |   ')
  doc.text(infoText, pageW / 2, y + rowH / 2 + 2.5, { align: 'center' })
  y += rowH + 4

  // ── Seção 1 — Patrimônio ao final do prazo ───────────────────────────────
  y = drawSectionTitle(doc, 'Comparativo de Patrimônio ao Final do Prazo', y, mL, usableW)
  const col2W = usableW / 2
  const boxH = 18
  const cons = resultado.comparativo

  ;[
    ['Compra à vista', BRL.format(cons.patrimonioCompraAVista), '#F5F5F0'],
    ['Consórcio + aplicação', BRL.format(cons.patrimonioCompraConsorcio), '#EAF3EA'],
  ].forEach(([label, val, cor], i) => {
    const x = mL + i * col2W
    setFill(doc, cor)
    doc.rect(x, y, col2W, boxH, 'F')
    setDraw(doc, '#DDDDDD')
    doc.setLineWidth(0.3)
    doc.rect(x, y, col2W, boxH, 'S')
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); setTxt(doc, '#777777')
    doc.text(label, x + col2W / 2, y + 6, { align: 'center' })
    doc.setFontSize(11); doc.setFont('helvetica', 'bold')
    setTxt(doc, i === 1 ? '#1E7B34' : COR_VERDE)
    doc.text(val, x + col2W / 2, y + 14, { align: 'center' })
  })
  y += boxH + 4

  const col2b: [string, string][] = [
    ['Prazo em anos', String(cons.prazoEmAnos)],
    ['CET a.a.', PCT(cons.cetAnual)],
  ]
  const boxH2 = 12
  col2b.forEach(([label, val], i) => {
    const x = mL + i * col2W
    setDraw(doc, COR_DOURADO)
    doc.setLineWidth(0.3)
    doc.rect(x, y, col2W, boxH2, 'S')
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setTxt(doc, '#888888')
    doc.text(label, x + col2W / 2, y + 5, { align: 'center' })
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
    doc.text(val, x + col2W / 2, y + 10, { align: 'center' })
  })
  y += boxH2 + 5

  // ── Seção 2 — Dados do Consórcio ─────────────────────────────────────────
  y = drawSectionTitle(doc, 'Dados do Consórcio', y, mL, usableW)
  const inp = resultado.input
  const dadosEsq: [string, string][] = [
    ['Valor do bem', BRL.format(inp.valorBem)],
    ['Valor da carta', BRL.format(inp.valorCarta)],
    ['Valor disponível líquido', BRL.format(inp.valorDisponivelLiquido)],
    ['Prazo em meses', String(inp.prazoMeses)],
    ['Mês do lance/contemplação', String(inp.mesLanceContemplacao)],
  ]
  const dadosDir: [string, string][] = [
    ['Valor do lance (%)', PCT(inp.percentualLance)],
    ['% Lance embutido', PCT(inp.percentualLanceEmbutido)],
    ['Tx Adm', PCT(inp.taxaAdmPercentual)],
    ['Índice de correção (a.a.)', PCT(inp.indiceCorrecaoAnual)],
    ['Valorização do bem (a.a.)', PCT(inp.valorizacaoBemAnual)],
  ]
  const dadoRowH = 7
  const dadosStartY = y
  dadosEsq.forEach(([label, val], i) => {
    const rowY = dadosStartY + i * dadoRowH
    if (i % 2 === 0) { setFill(doc, '#F7F7F4'); doc.rect(mL, rowY, col2W, dadoRowH, 'F') }
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setTxt(doc, '#888888')
    doc.text(label, mL + 3, rowY + 3)
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
    doc.text(val, mL + 3, rowY + 6.5)
  })
  dadosDir.forEach(([label, val], i) => {
    const rowY = dadosStartY + i * dadoRowH
    if (i % 2 === 0) { setFill(doc, '#F7F7F4'); doc.rect(mL + col2W, rowY, col2W, dadoRowH, 'F') }
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setTxt(doc, '#888888')
    doc.text(label, mL + col2W + 3, rowY + 3)
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
    doc.text(val, mL + col2W + 3, rowY + 6.5)
  })
  setDraw(doc, COR_DOURADO)
  doc.setLineWidth(0.3)
  doc.rect(mL, dadosStartY, usableW, dadosEsq.length * dadoRowH, 'S')
  doc.line(mL + col2W, dadosStartY, mL + col2W, dadosStartY + dadosEsq.length * dadoRowH)
  y = dadosStartY + dadosEsq.length * dadoRowH + 5

  // ── Seção 3 — Resumo ──────────────────────────────────────────────────────
  y = drawSectionTitle(doc, 'Resumo', y, mL, usableW)
  const res = resultado.resumo
  const resumoItens: [string, string][] = [
    ['Valor do lance', BRL.format(res.valorDoLance)],
    ['Lance embutido', BRL.format(res.lanceEmbutido)],
    ['Lance próprio', BRL.format(res.lanceProprio)],
    ['Valor Líquido', BRL.format(res.valorLiquido)],
    ['Devolução', BRL.format(res.devolucao)],
    ['Correção saldo devedor', BRL.format(res.correcaoSaldoDevedor)],
    ['Correção valor da carta', BRL.format(res.correcaoValorDaCarta)],
    ['Custo de correção', BRL.format(res.custoDeCorrecao)],
    ['Custo de adm', BRL.format(res.custoDeAdm)],
    ['Custo total', BRL.format(res.custoTotal)],
    ['Saldo Líquido', BRL.format(res.saldoLiquido)],
  ]
  const rItemW = usableW * 0.6
  const rValW = usableW * 0.4
  resumoItens.forEach(([label, val], idx) => {
    const rh = 6.5
    if (y + rh > pageH - mBot - 20) { doc.addPage(); y = mTop }
    if (idx % 2 === 0) { setFill(doc, '#F8F8F5'); doc.rect(mL, y, usableW, rh, 'F') }
    setDraw(doc, '#E0E0DC'); doc.setLineWidth(0.2)
    doc.rect(mL, y, usableW, rh, 'S')
    doc.line(mL + rItemW, y, mL + rItemW, y + rh)
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); setTxt(doc, '#333333')
    doc.text(label, mL + 2, y + rh / 2 + 1.5)
    doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
    doc.text(val, mL + rItemW + rValW / 2, y + rh / 2 + 1.5, { align: 'center' })
    y += rh
  })
  y += 5

  // ── Seção 4 — Cronograma mensal (apêndice) ───────────────────────────────
  if (y + 20 > pageH - mBot) { doc.addPage(); y = mTop }
  y = drawSectionTitle(doc, `Cronograma Mensal (${resultado.linhas.length} meses)`, y, mL, usableW)

  const colW = usableW / 5
  const thH = 7
  setFill(doc, COR_VERDE)
  doc.rect(mL, y, usableW, thH, 'F')
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  ;['Mês', 'Carta', 'Parcela', 'Lance', 'Saldo aplicação'].forEach((h, i) => {
    doc.text(h, mL + i * colW + colW / 2, y + thH / 2 + 2, { align: 'center' })
  })
  y += thH

  const lineH = 5.5
  doc.setFontSize(7)
  resultado.linhas.forEach((l, idx) => {
    if (y + lineH > pageH - mBot) { doc.addPage(); y = mTop }
    if (idx % 2 === 0) { setFill(doc, '#F8F8F5'); doc.rect(mL, y, usableW, lineH, 'F') }
    setDraw(doc, '#E0E0DC'); doc.setLineWidth(0.15)
    doc.rect(mL, y, usableW, lineH, 'S')
    doc.setFont('helvetica', l.lance > 0 ? 'bold' : 'normal')
    setTxt(doc, l.lance > 0 ? '#1E7B34' : '#333333')
    const vals = [
      String(l.mes),
      l.carta != null ? BRL.format(l.carta) : '—',
      l.parcela != null ? BRL.format(l.parcela) : '—',
      l.lance > 0 ? BRL.format(l.lance) : '—',
      BRL.format(l.saldoAplicacao),
    ]
    vals.forEach((v, i) => doc.text(v, mL + i * colW + colW / 2, y + lineH / 2 + 1.5, { align: 'center' }))
    y += lineH
  })

  // ── Rodapé ────────────────────────────────────────────────────────────────
  const footerText = 'Atenção — Os valores desta simulação são estimados com base nos parâmetros informados e podem variar de acordo com a política vigente da administradora de consórcio na data da adesão.'
  if (y + 14 > pageH - mBot) { doc.addPage(); y = mTop } else { y += 4 }
  setDraw(doc, COR_DOURADO); doc.setLineWidth(0.4)
  doc.line(mL, y, pageW - mR, y)
  y += 4
  doc.setFontSize(6.5); doc.setFont('helvetica', 'italic'); setTxt(doc, '#666666')
  const wrapped = doc.splitTextToSize(footerText, usableW)
  doc.text(wrapped, mL, y, { lineHeightFactor: 1.4 })

  const nomeCliente = (options.clienteNome ?? '').trim()
  const nomeArquivo = nomeCliente ? `Simulação de Consórcio - ${nomeCliente}.pdf` : 'Simulação de Consórcio.pdf'

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
