import type { ResultadoSimulador } from '@/types/simulador'
import { MODALIDADE_LABELS } from '@/types/simulador'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const COR_VERDE  = '#253B29'
const COR_DOURADO = '#C2AA6A'
const COR_BEGE   = '#E7E0C4'

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

function setFill(doc: InstanceType<typeof import('jspdf')['jsPDF']>, hex: string) {
  doc.setFillColor(...hexToRgb(hex))
}

function setDraw(doc: InstanceType<typeof import('jspdf')['jsPDF']>, hex: string) {
  doc.setDrawColor(...hexToRgb(hex))
}

function setTextColor(doc: InstanceType<typeof import('jspdf')['jsPDF']>, hex: string) {
  doc.setTextColor(...hexToRgb(hex))
}

export interface PDFOptions {
  clienteNome?: string
  responsavelNome?: string
  numero?: string
  valorAssessoria?: number
  valorContratoServico?: number
  mode?: 'download' | 'preview'
}

export async function gerarPDFSimulacao(
  resultado: ResultadoSimulador,
  options: PDFOptions = {},
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const e = resultado.entrada
  const isCaixa = e.banco.toLowerCase().includes('caixa')
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const mL = 12
  const mR = 12
  const mTop = 10
  const mBot = 12
  const usableW = pageW - mL - mR

  let y = mTop

  // ════════════════════════════════════════════════════════════════
  // CABEÇALHO
  // ════════════════════════════════════════════════════════════════

  const HEADER_H = 24

  if (isCaixa) {
    const [imgAval, imgCaixa] = await Promise.all([
      loadImage('/images/logos/Logo%20Aval%20Financiamentos%20(fundo%20branco)%20(1).png'),
      loadImage('/images/logos/logotipocaixaaqui.png'),
    ])

    // Aval logo — zona esquerda (até 45% da largura), proporção preservada
    if (imgAval) {
      const [w, h] = fitInBox(imgAval.naturalW, imgAval.naturalH, usableW * 0.45, HEADER_H - 2)
      const lY = y + (HEADER_H - h) / 2
      doc.addImage(imgAval.dataUrl, 'PNG', mL, lY, w, h)
    } else {
      doc.setFontSize(10); doc.setFont('helvetica', 'bold')
      setTextColor(doc, COR_VERDE)
      doc.text('Aval Financiamentos', mL, y + HEADER_H / 2 + 2)
    }

    // Caixa Aqui logo + texto "Correspondente Caixa aqui" — inline na zona direita
    if (imgCaixa) {
      const [w, h] = fitInBox(imgCaixa.naturalW, imgCaixa.naturalH, 30, HEADER_H - 6)
      const labelText = 'Correspondente  Caixa aqui'
      doc.setFontSize(9); doc.setFont('helvetica', 'bold')
      const textW = doc.getTextWidth(labelText)
      const totalW = w + 3 + textW
      const startX = pageW - mR - totalW
      const lY = y + (HEADER_H - h) / 2
      doc.addImage(imgCaixa.dataUrl, 'PNG', startX, lY, w, h)
      setTextColor(doc, '#1A3A6B')
      doc.text(labelText, startX + w + 3, y + HEADER_H / 2 + 3)
    }
  } else {
    // Fontinhas — faixa verde escura full-width (mesma cor do fundo do logo)
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
      doc.text('Fontinhas Assessoria Imobiliária', mL + 4, y + HEADER_H / 2 + 3)
    }
  }

  y += HEADER_H + 4

  // ════════════════════════════════════════════════════════════════
  // LINHA DE IDENTIFICAÇÃO (fundo verde)
  // ════════════════════════════════════════════════════════════════

  const rowH = 9
  setFill(doc, COR_VERDE)
  doc.rect(mL, y, usableW, rowH, 'F')

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)

  const d = new Date()
  const dataHoje = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  const infoText = [
    options.numero ? `Nº ${options.numero}` : null,
    options.clienteNome ?? '',
    dataHoje,
    options.responsavelNome ?? '',
  ]
    .filter(Boolean)
    .join('   |   ')

  doc.text(infoText, pageW / 2, y + rowH / 2 + 2.5, { align: 'center' })
  y += rowH + 4

  // ════════════════════════════════════════════════════════════════
  // SEÇÃO 1 — Estimativa de valor dos serviços
  // ════════════════════════════════════════════════════════════════

  y = drawSectionTitle(doc, 'Estimativa de valor dos serviços', y, mL, usableW)

  const col3W = usableW / 3
  const secItems: [string, string][] = [
    ['Valor Assessoria',         options.valorAssessoria ? BRL.format(options.valorAssessoria) : '—'],
    ['Valor do Contrato',        options.valorContratoServico ? BRL.format(options.valorContratoServico) : '—'],
    ['Valor Total de Serviços',  options.valorAssessoria || options.valorContratoServico
      ? BRL.format((options.valorAssessoria ?? 0) + (options.valorContratoServico ?? 0))
      : '—'],
  ]

  const secH = 16
  secItems.forEach(([label, val], i) => {
    const x = mL + i * col3W
    setFill(doc, i % 2 === 0 ? '#F5F5F0' : '#FAFAF8')
    doc.rect(x, y, col3W, secH, 'F')
    setDraw(doc, '#DDDDDD')
    doc.setLineWidth(0.3)
    doc.rect(x, y, col3W, secH, 'S')

    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    setTextColor(doc, '#777777')
    doc.text(label, x + col3W / 2, y + 5, { align: 'center' })

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    setTextColor(doc, COR_VERDE)
    doc.text(val, x + col3W / 2, y + 12, { align: 'center' })
  })
  y += secH + 5

  // ════════════════════════════════════════════════════════════════
  // SEÇÃO 2 — Dados da operação
  // ════════════════════════════════════════════════════════════════

  y = drawSectionTitle(doc, 'Dados da operação', y, mL, usableW)

  const col2W = usableW / 2
  const dadosEsq: [string, string][] = [
    ['Tipo de imóvel',     e.tipoImovel],
    ['Cidade do Imóvel',   e.cidade],
    ['Isento FunRejus',    e.isentoFunRejus === 'sim' ? 'Sim' : e.isentoFunRejus === 'nao' ? 'Não' : 'A confirmar'],
    ['Primeira Aquisição', e.primeiraAquisicao === 'sim' ? 'Sim' : e.primeiraAquisicao === 'nao' ? 'Não' : 'A confirmar'],
    ['Banco',              e.banco],
  ]
  const dadosDir: [string, string][] = [
    ['Compra e Venda',     BRL.format(e.valorCV)],
    ['Valor Financiado',   BRL.format(e.valorFinanciado)],
    ['Recursos Próprios',  BRL.format(Math.max(0, e.valorCV - e.valorFinanciado))],
    ['Produto',            e.produto.replace('_', '-')],
    ['Modalidade',         MODALIDADE_LABELS[e.modalidade]],
  ]

  const dadoRowH = 7
  const dadosStartY = y

  dadosEsq.forEach(([label, val], i) => {
    const rowY = dadosStartY + i * dadoRowH
    if (i % 2 === 0) {
      setFill(doc, '#F7F7F4')
      doc.rect(mL, rowY, col2W, dadoRowH, 'F')
    }
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setTextColor(doc, '#888888')
    doc.text(label, mL + 3, rowY + 3)
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); setTextColor(doc, COR_VERDE)
    doc.text(val, mL + 3, rowY + 6.5)
  })

  dadosDir.forEach(([label, val], i) => {
    const rowY = dadosStartY + i * dadoRowH
    if (i % 2 === 0) {
      setFill(doc, '#F7F7F4')
      doc.rect(mL + col2W, rowY, col2W, dadoRowH, 'F')
    }
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setTextColor(doc, '#888888')
    doc.text(label, mL + col2W + 3, rowY + 3)
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); setTextColor(doc, COR_VERDE)
    doc.text(val, mL + col2W + 3, rowY + 6.5)
  })

  // Borda da seção dados
  setDraw(doc, COR_DOURADO)
  doc.setLineWidth(0.3)
  doc.rect(mL, dadosStartY, usableW, dadosEsq.length * dadoRowH, 'S')
  doc.line(mL + col2W, dadosStartY, mL + col2W, dadosStartY + dadosEsq.length * dadoRowH)

  y = dadosStartY + dadosEsq.length * dadoRowH + 5

  // ════════════════════════════════════════════════════════════════
  // SEÇÃO 3 — Estimativa de custas
  // ════════════════════════════════════════════════════════════════

  y = drawSectionTitle(
    doc,
    'Estimativa de custas para contratação (escritura)',
    y,
    mL,
    usableW,
  )

  // Cabeçalho da tabela
  const colItem = 42
  const colSem = 30
  const colCom = 30
  const colDesc = usableW - colItem - colSem - colCom

  const thH = 8
  setFill(doc, COR_VERDE)
  doc.rect(mL, y, usableW, thH, 'F')
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('Item', mL + 2, y + thH / 2 + 2.5)
  doc.text('Sem Desconto', mL + colItem + colSem / 2, y + thH / 2 + 2.5, { align: 'center' })
  doc.text('Com Desconto', mL + colItem + colSem + colCom / 2, y + thH / 2 + 2.5, { align: 'center' })
  doc.text('Descrição', mL + colItem + colSem + colCom + 2, y + thH / 2 + 2.5)
  y += thH

  // Linhas
  const linhasVisiveis = resultado.linhas.filter((l) => l.visivel)
  const descFontSize = 6.5

  linhasVisiveis.forEach((linha, idx) => {
    const xItem = mL
    const xSem = mL + colItem
    const xCom = mL + colItem + colSem
    const xDesc = mL + colItem + colSem + colCom

    // Quebrar descrição em linhas
    doc.setFontSize(descFontSize)
    const descLines = doc.splitTextToSize(linha.descricaoPDF, colDesc - 3)
    const minRowH = 8
    const rowH = Math.max(minRowH, descLines.length * 3.5 + 3)

    // Check page break
    if (y + rowH > pageH - mBot - 30) {
      doc.addPage()
      y = mTop
    }

    // Background alternado
    if (idx % 2 === 0) {
      setFill(doc, '#F8F8F5')
      doc.rect(xItem, y, usableW, rowH, 'F')
    }

    // Borda linha
    setDraw(doc, '#E0E0DC')
    doc.setLineWidth(0.2)
    doc.rect(xItem, y, usableW, rowH, 'S')

    // Separadores de coluna
    doc.line(xSem, y, xSem, y + rowH)
    doc.line(xCom, y, xCom, y + rowH)
    doc.line(xDesc, y, xDesc, y + rowH)

    const midY = y + rowH / 2

    // Item label
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    setTextColor(doc, COR_VERDE)
    doc.text(linha.label, xItem + 2, midY + 2)

    // Sem Desconto
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    setTextColor(doc, '#333333')
    doc.text(BRL.format(linha.semDesconto), xSem + colSem / 2, midY + 2, { align: 'center' })

    // Com Desconto
    const isMenor = linha.comDesconto < linha.semDesconto
    if (isMenor) {
      setTextColor(doc, '#1E7B34')
      doc.setFont('helvetica', 'bold')
    }
    doc.text(BRL.format(linha.comDesconto), xCom + colCom / 2, midY + 2, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    setTextColor(doc, '#333333')

    // Descrição (multi-linha)
    doc.setFontSize(descFontSize)
    setTextColor(doc, '#666666')
    doc.text(descLines, xDesc + 2, y + 4.5, { lineHeightFactor: 1.4 })

    y += rowH
  })

  // Linha TOTAL
  if (y + 12 > pageH - mBot - 20) {
    doc.addPage()
    y = mTop
  }

  setFill(doc, COR_BEGE)
  doc.rect(mL, y, usableW, 12, 'F')
  setDraw(doc, COR_DOURADO)
  doc.setLineWidth(0.5)
  doc.rect(mL, y, usableW, 12, 'S')

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  setTextColor(doc, COR_VERDE)
  doc.text('ESTIMATIVA TOTAL', mL + 2, y + 8)

  doc.text(BRL.format(resultado.totalSemDesconto), mL + colItem + colSem / 2, y + 8, { align: 'center' })
  doc.text(BRL.format(resultado.totalComDesconto), mL + colItem + colSem + colCom / 2, y + 8, { align: 'center' })

  doc.setFontSize(6)
  doc.setFont('helvetica', 'italic')
  setTextColor(doc, '#555555')
  const totalDesc =
    'ESTIMATIVA TOTAL - Os valores são calculados estimando o total de custas que se pode atingir numa operação de Aquisição por meio de financiamento.'
  const totalDescLines = doc.splitTextToSize(totalDesc, colDesc - 3)
  doc.text(totalDescLines, mL + colItem + colSem + colCom + 2, y + 4)

  y += 12 + 3

  // Linha % do imóvel
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  setTextColor(doc, '#888888')
  doc.text('% do Valor do Imóvel', mL + 2, y + 5)
  doc.setFont('helvetica', 'bold')
  setTextColor(doc, COR_VERDE)
  doc.text(
    `${resultado.percentualSemDesconto.toFixed(1)}%`,
    mL + colItem + colSem / 2,
    y + 5,
    { align: 'center' },
  )
  doc.text(
    `${resultado.percentualComDesconto.toFixed(1)}%`,
    mL + colItem + colSem + colCom / 2,
    y + 5,
    { align: 'center' },
  )
  y += 10

  // ════════════════════════════════════════════════════════════════
  // RODAPÉ
  // ════════════════════════════════════════════════════════════════

  // Garantir que o rodapé fique na última página com espaço
  const footerText = [
    'Atenção - Estes valores são estimados de acordo com a tabela dos órgãos competentes, instituições financeiras e tabela de serviços (assessoria). Não é uma tabela de preço fixo. As instituições podem alterar o valor para mais ou para menos de acordo com a política vigente na data da assinatura ou contratação do serviço.',
    'Este documento é válido como forma de orientar o cliente a organizar-se financeiramente para as custas de contratação de um processo de financiamento imobiliário.',
  ]

  if (y + 20 > pageH - mBot) {
    doc.addPage()
    y = mTop
  } else {
    y += 4
  }

  // Linha separadora do rodapé
  setDraw(doc, COR_DOURADO)
  doc.setLineWidth(0.4)
  doc.line(mL, y, pageW - mR, y)
  y += 4

  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'italic')
  setTextColor(doc, '#666666')

  footerText.forEach((line) => {
    const wrapped = doc.splitTextToSize(line, usableW)
    doc.text(wrapped, mL, y, { lineHeightFactor: 1.4 })
    y += wrapped.length * 2.8 + 2
  })

  const nomeCliente = (options.clienteNome ?? '').trim()
  const nomeArquivo = nomeCliente
    ? `Estimativa de Custas - ${nomeCliente}.pdf`
    : `Estimativa de Custas.pdf`

  if (options.mode === 'preview') {
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank', 'noopener,noreferrer')
    if (!win) {
      // popup blocker ativo — faz download como fallback
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

// ── Helpers ────────────────────────────────────────────────────────────────

function drawSectionTitle(
  doc: InstanceType<typeof import('jspdf')['jsPDF']>,
  title: string,
  y: number,
  mL: number,
  usableW: number,
): number {
  const h = 8
  setFill(doc, COR_VERDE)
  doc.rect(mL, y, usableW, h, 'F')
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(title, mL + 3, y + h / 2 + 2.5)
  return y + h + 1
}
