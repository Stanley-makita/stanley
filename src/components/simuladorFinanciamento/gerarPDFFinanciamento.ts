import type { ResultadoCompleto } from '@/lib/simuladorFinanciamento/tipos'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

// Brand colors (resolved from CSS vars)
const COR_VERDE = '#253B29'
const COR_DOURADO = '#C2AA6A'
const COR_BEGE = '#E7E0C4'

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

export interface PDFOptionsFinanciamento {
  clienteNome?: string
  responsavelNome?: string
  numero?: string
  mode?: 'download' | 'preview'
}

export async function gerarPDFFinanciamento(
  resultado: ResultadoCompleto,
  options: PDFOptionsFinanciamento = {},
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const mL = 12
  const mR = 12
  const mTop = 10
  const mBot = 12
  const usableW = pageW - mL - mR

  let y = mTop

  // ════════════════════════════════════════════════════════════════
  // CABEÇALHO — Fontinhas (comparativo multi-banco)
  // ════════════════════════════════════════════════════════════════

  const HEADER_H = 24

  setFill(doc, COR_VERDE)
  doc.rect(mL, y, usableW, HEADER_H, 'F')

  const imgFontinhas = await loadImage('/images/logos/logotipo%20retangular%20fontinhas%20assessoria.jpg')
  if (imgFontinhas) {
    const [w, h] = fitInBox(imgFontinhas.naturalW, imgFontinhas.naturalH, 75, HEADER_H - 4)
    const lY = y + (HEADER_H - h) / 2
    doc.addImage(imgFontinhas.dataUrl, 'JPEG', mL + 2, lY, w, h)
  } else {
    doc.setFontSize(12); doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text('Fontinhas Assessoria', mL + 4, y + HEADER_H / 2 + 3)
  }

  doc.setFontSize(9.5); doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('Simulação de Financiamento Imobiliário', pageW - mR - 2, y + HEADER_H / 2 + 3, { align: 'right' })

  y += HEADER_H + 4

  // ════════════════════════════════════════════════════════════════
  // LINHA DE IDENTIFICAÇÃO
  // ════════════════════════════════════════════════════════════════

  const rowH = 9
  setFill(doc, COR_VERDE)
  doc.rect(mL, y, usableW, rowH, 'F')

  doc.setFontSize(8); doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)

  const d = new Date()
  const dataHoje = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  const infoText = [
    options.numero ? `Nº ${options.numero}` : null,
    options.clienteNome ?? '',
    dataHoje,
    options.responsavelNome ?? '',
  ].filter(Boolean).join('   |   ')

  doc.text(infoText, pageW / 2, y + rowH / 2 + 2.5, { align: 'center' })
  y += rowH + 4

  // ════════════════════════════════════════════════════════════════
  // SEÇÃO 1 — Dados da simulação
  // ════════════════════════════════════════════════════════════════

  y = drawSectionTitle(doc, 'Dados da Simulação', y, mL, usableW)

  const inp = resultado.input
  const valorFinanciado = inp.valorImovel - inp.valorEntrada

  let idadeStr = '—'
  if (inp.dataNascimento) {
    const hoje = new Date()
    const nasc = new Date(inp.dataNascimento)
    const anos = hoje.getFullYear() - nasc.getFullYear() -
      (hoje < new Date(hoje.getFullYear(), nasc.getMonth(), nasc.getDate()) ? 1 : 0)
    idadeStr = `${anos} anos`
  }

  const dadosItems: [string, string][] = [
    ['Valor do Imóvel',   BRL.format(inp.valorImovel)],
    ['Entrada',           BRL.format(inp.valorEntrada)],
    ['Valor Financiado',  BRL.format(valorFinanciado)],
    ['Renda Mensal',      BRL.format(inp.rendaMensal)],
    ['Amortização',       inp.tipoAmortizacao],
    ['Idade',             idadeStr],
  ]

  const col3W = usableW / 3
  const dadoH = 16
  const ROWS = Math.ceil(dadosItems.length / 3)

  dadosItems.forEach(([label, val], i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    const x = mL + col * col3W
    const ry = y + row * dadoH

    setFill(doc, col % 2 === 0 ? '#F5F5F0' : '#FAFAF8')
    doc.rect(x, ry, col3W, dadoH, 'F')
    setDraw(doc, '#DDDDDD')
    doc.setLineWidth(0.3)
    doc.rect(x, ry, col3W, dadoH, 'S')

    doc.setFontSize(7);  doc.setFont('helvetica', 'normal'); setTxt(doc, '#777777')
    doc.text(label, x + col3W / 2, ry + 5, { align: 'center' })
    doc.setFontSize(9);  doc.setFont('helvetica', 'bold');   setTxt(doc, COR_VERDE)
    doc.text(val,   x + col3W / 2, ry + 12, { align: 'center' })
  })

  y += ROWS * dadoH + 5

  // ════════════════════════════════════════════════════════════════
  // SEÇÃO 2 — Comparativo de bancos
  // ════════════════════════════════════════════════════════════════

  const elegiveis   = resultado.bancos.filter((r) => r.elegivel)
  const inaplicaveis = resultado.bancos.filter((r) => !r.elegivel)

  y = drawSectionTitle(doc, 'Comparativo de Bancos Elegíveis', y, mL, usableW)

  if (elegiveis.length > 0) {
    const colBanco    = 30
    const colPrograma = 42
    const colParcela  = 26
    const colUltima   = 24
    const colParcelas = 16
    const colTaxa     = 22
    const colTotal    = usableW - colBanco - colPrograma - colParcela - colUltima - colParcelas - colTaxa

    const thH = 8
    setFill(doc, COR_VERDE)
    doc.rect(mL, y, usableW, thH, 'F')
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)

    let cx = mL
    doc.text('Banco',      cx + 2,                             y + thH / 2 + 2.5); cx += colBanco
    doc.text('Programa',   cx + 2,                             y + thH / 2 + 2.5); cx += colPrograma
    doc.text('1ª Parcela', cx + colParcela / 2,                y + thH / 2 + 2.5, { align: 'center' }); cx += colParcela
    doc.text('Última',     cx + colUltima / 2,                 y + thH / 2 + 2.5, { align: 'center' }); cx += colUltima
    doc.text('Parcelas',   cx + colParcelas / 2,               y + thH / 2 + 2.5, { align: 'center' }); cx += colParcelas
    doc.text('Taxa a.a.',  cx + colTaxa / 2,                   y + thH / 2 + 2.5, { align: 'center' }); cx += colTaxa
    doc.text('Total Pago', cx + colTotal / 2,                  y + thH / 2 + 2.5, { align: 'center' })
    y += thH

    elegiveis.forEach((r, idx) => {
      const rH = 10
      if (y + rH > pageH - mBot - 20) { doc.addPage(); y = mTop }

      if (idx === 0) {
        setFill(doc, '#EEF5EE')
      } else if (idx % 2 === 0) {
        setFill(doc, '#F8F8F5')
      } else {
        setFill(doc, '#FFFFFF')
      }
      doc.rect(mL, y, usableW, rH, 'F')
      setDraw(doc, '#E0E0DC'); doc.setLineWidth(0.2)
      doc.rect(mL, y, usableW, rH, 'S')

      const midY = y + rH / 2 + 2.5

      cx = mL
      doc.setFontSize(7.5); doc.setFont('helvetica', idx === 0 ? 'bold' : 'normal')
      setTxt(doc, idx === 0 ? COR_VERDE : '#333333')
      const nomeBanco = r.bancoNome.split(' ')[0]
      doc.text(nomeBanco, cx + 2, midY)
      if (idx === 0) {
        doc.setFontSize(5.5); setTxt(doc, '#1E7B34')
        doc.text('★ melhor', cx + 2, midY + 3)
      }
      cx += colBanco

      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setTxt(doc, '#555555')
      const progLines = doc.splitTextToSize(r.programa, colPrograma - 3)
      doc.text(progLines[0], cx + 2, midY)
      cx += colPrograma

      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); setTxt(doc, '#111111')
      doc.text(BRL.format(r.primeiraParcela), cx + colParcela / 2, midY, { align: 'center' }); cx += colParcela

      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setTxt(doc, '#555555')
      doc.text(BRL.format(r.ultimaParcela),   cx + colUltima / 2,   midY, { align: 'center' }); cx += colUltima
      doc.text(`${r.parcelas}`,               cx + colParcelas / 2, midY, { align: 'center' }); cx += colParcelas
      doc.text(`${(r.taxaAnual * 100).toFixed(2)}%`, cx + colTaxa / 2, midY, { align: 'center' }); cx += colTaxa
      doc.text(BRL.format(r.totalPago),       cx + colTotal / 2,    midY, { align: 'center' })

      y += rH
    })
    y += 5
  } else {
    doc.setFontSize(8); doc.setFont('helvetica', 'italic'); setTxt(doc, '#888888')
    doc.text('Nenhum banco elegível para os parâmetros informados.', mL + 2, y + 6)
    y += 12
  }

  // ════════════════════════════════════════════════════════════════
  // SEÇÃO 3 — Detalhes por banco
  // ════════════════════════════════════════════════════════════════

  if (elegiveis.length > 0) {
    y = drawSectionTitle(doc, 'Detalhes por Banco', y, mL, usableW)

    const col2W = usableW / 2

    elegiveis.forEach((r, idx) => {
      const cardH = 38
      if (y + cardH > pageH - mBot - 10) { doc.addPage(); y = mTop }

      const isLeft = idx % 2 === 0
      const x = mL + (isLeft ? 0 : col2W)
      const cardW = col2W - 1

      // Bank color header bar
      const [br, bg, bb] = hexToRgb(r.corBanco.startsWith('#') ? r.corBanco : COR_VERDE)
      doc.setFillColor(br, bg, bb)
      doc.rect(x, y, cardW, 8, 'F')
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
      doc.text(`${r.bancoNome} — ${r.programa}`, x + 3, y + 5.5)

      // Card body
      setFill(doc, '#F8FAF8'); setDraw(doc, '#E0E0DC')
      doc.setLineWidth(0.2)
      doc.rect(x, y + 8, cardW, cardH - 8, 'FD')

      const metricas: [string, string][] = [
        ['1ª Parcela',     BRL.format(r.primeiraParcela)],
        ['Última Parcela', BRL.format(r.ultimaParcela)],
        ['Parcelas',       `${r.parcelas} meses`],
        ['Amortização',    r.tipoAmortizacao],
        ['Taxa mensal',    `${(r.taxaMensal * 100).toFixed(4)}%`],
        ['Taxa anual',     `${(r.taxaAnual * 100).toFixed(2)}%`],
        ['Total Juros',    BRL.format(r.totalJuros)],
        ['Total Seguros',  BRL.format(r.totalSeguros)],
        ['Vlr Financiado', BRL.format(r.valorFinanciado)],
        ['Total Pago',     BRL.format(r.totalPago)],
      ]

      const metC1 = metricas.slice(0, 5)
      const metC2 = metricas.slice(5)
      const metW  = cardW / 2 - 3

      metC1.forEach(([label, val], mi) => {
        const my = y + 10 + mi * 5.5
        doc.setFontSize(6);   doc.setFont('helvetica', 'normal'); setTxt(doc, '#888888')
        doc.text(label, x + 3, my)
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');   setTxt(doc, COR_VERDE)
        doc.text(val, x + metW - 2, my, { align: 'right' })
      })
      metC2.forEach(([label, val], mi) => {
        const my = y + 10 + mi * 5.5
        const mx = x + cardW / 2 + 2
        doc.setFontSize(6);   doc.setFont('helvetica', 'normal'); setTxt(doc, '#888888')
        doc.text(label, mx, my)
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');   setTxt(doc, COR_VERDE)
        doc.text(val, x + cardW - 3, my, { align: 'right' })
      })

      // Divider between metrics columns
      setDraw(doc, '#DDDDDD'); doc.setLineWidth(0.2)
      doc.line(x + cardW / 2, y + 8, x + cardW / 2, y + cardH)

      // Advance y only after right card (or last card)
      if (!isLeft || idx === elegiveis.length - 1) {
        y += cardH + 3
      }
    })
    y += 3
  }

  // ════════════════════════════════════════════════════════════════
  // SEÇÃO 4 — Análise preditiva
  // ════════════════════════════════════════════════════════════════

  if (y + 50 > pageH - mBot - 10) { doc.addPage(); y = mTop }

  y = drawSectionTitle(doc, 'Análise Preditiva de Aprovação', y, mL, usableW)

  const a = resultado.analise
  const SCORE_LABEL: Record<string, string> = { alta: 'Alta', moderada: 'Moderada', baixa: 'Baixa', improvavel: 'Improvável' }
  const SCORE_COLOR: Record<string, string> = { alta: '#1E7B34', moderada: '#B8860B', baixa: '#CC5500', improvavel: '#CC0000' }
  const scoreHex = SCORE_COLOR[a.classificacao] ?? '#333333'

  const boxW = 50
  const boxH = 30
  setFill(doc, '#F0F7F0'); setDraw(doc, COR_DOURADO)
  doc.setLineWidth(0.4)
  doc.rect(mL, y, boxW, boxH, 'FD')

  doc.setFontSize(7);   doc.setFont('helvetica', 'normal'); setTxt(doc, '#666666')
  doc.text('Score de Aprovação', mL + boxW / 2, y + 7, { align: 'center' })
  doc.setFontSize(22);  doc.setFont('helvetica', 'bold'); setTxt(doc, scoreHex)
  doc.text(`${a.score}`, mL + boxW / 2, y + 19, { align: 'center' })
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); setTxt(doc, scoreHex)
  doc.text(SCORE_LABEL[a.classificacao] ?? a.classificacao, mL + boxW / 2, y + 26, { align: 'center' })

  const rightX = mL + boxW + 6
  const summaryItems: [string, string][] = [
    ['Comprometimento de Renda', `${a.comprometimentoRenda.toFixed(1)}%`],
    ['Máx. Financiável (30% renda)', BRL.format(a.maxFinanciavel)],
    ['Renda Mínima Necessária', BRL.format(a.rendaMinimaNecessaria)],
  ]
  summaryItems.forEach(([label, val], i) => {
    const iy = y + 2 + i * 9
    doc.setFontSize(7);   doc.setFont('helvetica', 'normal'); setTxt(doc, '#888888')
    doc.text(label, rightX, iy + 4)
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');   setTxt(doc, COR_VERDE)
    doc.text(val, rightX, iy + 9)
  })

  y += boxH + 4

  // Fatores
  if (a.fatores.length > 0) {
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
    doc.text('Fatores Identificados:', mL, y + 4)
    y += 7

    a.fatores.forEach((f) => {
      if (y + 6 > pageH - mBot - 20) { doc.addPage(); y = mTop }
      const fHex = f.impacto === 'positivo' ? '#1E7B34' : f.impacto === 'critico' ? '#CC0000' : '#B8860B'
      const icon = f.impacto === 'positivo' ? '+' : f.impacto === 'critico' ? '!!' : '−'
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); setTxt(doc, fHex)
      doc.text(icon, mL + 2, y + 4)
      doc.setFont('helvetica', 'normal'); setTxt(doc, '#444444')
      doc.text(f.descricao, mL + 8, y + 4)
      y += 5.5
    })
    y += 3
  }

  // ════════════════════════════════════════════════════════════════
  // SEÇÃO 5 — Bancos não elegíveis (opcional)
  // ════════════════════════════════════════════════════════════════

  if (inaplicaveis.length > 0) {
    if (y + 20 > pageH - mBot) { doc.addPage(); y = mTop }
    y = drawSectionTitle(doc, 'Bancos Não Elegíveis', y, mL, usableW)
    inaplicaveis.forEach((r, i) => {
      if (y + 6 > pageH - mBot - 10) { doc.addPage(); y = mTop }
      if (i % 2 === 0) { setFill(doc, '#F8F8F5'); doc.rect(mL, y, usableW, 6, 'F') }
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');   setTxt(doc, '#555555')
      doc.text(r.bancoNome.split(' ')[0], mL + 2, y + 4.5)
      doc.setFont('helvetica', 'normal'); setTxt(doc, '#888888')
      doc.text(r.motivoInelegivel ?? 'Não elegível', mL + 32, y + 4.5)
      y += 6
    })
    y += 4
  }

  // ════════════════════════════════════════════════════════════════
  // RODAPÉ
  // ════════════════════════════════════════════════════════════════

  if (y + 20 > pageH - mBot) { doc.addPage(); y = mTop } else { y += 4 }

  setDraw(doc, COR_DOURADO); doc.setLineWidth(0.4)
  doc.line(mL, y, pageW - mR, y)
  y += 4

  const footerText = [
    'Atenção – Os valores apresentados são simulações baseadas nas condições vigentes das instituições financeiras na data de geração deste documento. Taxas, prazos e condições podem variar conforme política de cada banco, avaliação de crédito, garantias e critérios de aprovação.',
    'Este documento tem caráter meramente informativo e não constitui proposta de crédito nem garantia de aprovação de financiamento.',
  ]
  doc.setFontSize(6.5); doc.setFont('helvetica', 'italic'); setTxt(doc, '#666666')
  footerText.forEach((line) => {
    const wrapped = doc.splitTextToSize(line, usableW)
    doc.text(wrapped, mL, y, { lineHeightFactor: 1.4 })
    y += wrapped.length * 2.8 + 2
  })

  const nomeCliente = (options.clienteNome ?? '').trim()
  const nomeArquivo = nomeCliente
    ? `Simulação de Financiamento - ${nomeCliente}.pdf`
    : 'Simulação de Financiamento.pdf'

  if (options.mode === 'preview') {
    const url = doc.output('bloburl')
    window.open(url as unknown as string, '_blank')
  } else {
    doc.save(nomeArquivo)
  }
}
