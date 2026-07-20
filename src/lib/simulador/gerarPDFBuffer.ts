/**
 * Gerador de PDF server-side — variante buffer do simulador de custas.
 *
 * Usa o mesmo layout e lógica do gerador oficial (components/simulador/gerarPDF.ts),
 * mas sem APIs de browser (Image, canvas, window, document): os logos são
 * embutidos como base64 (logos-caixa.ts) em vez de carregados via <img>/canvas,
 * e o dimensionamento usa doc.getImageProperties() (suportado em Node) em vez
 * de img.naturalWidth/Height.
 * Retorna um Buffer pronto para envio via WhatsApp ou Storage.
 *
 * Nunca criar um segundo template. Este arquivo apenas adapta a saída.
 */

import type { ResultadoSimulador } from '@/types/simulador'
import { MODALIDADE_LABELS } from '@/types/simulador'
import { ajustarParaExibicaoCliente } from './calcular'
import { LOGO_AVAL, LOGO_CAIXA_AQUI, LOGO_FONTINHAS } from './logos-caixa'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const COR_VERDE   = '#253B29'
const COR_DOURADO = '#C2AA6A'
const COR_BEGE    = '#E7E0C4'

function isCaixa(banco: string): boolean {
  return banco.toLowerCase().includes('caixa')
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

// Substitui caracteres fora do WinAnsi (usados pelo Helvetica embutido no jsPDF)
// para evitar glifos errados e espaçamento largo nos PDFs gerados.
function pdf(text: string): string {
  return text
    .replace(/[★✓✗•◆►▸▶]/g, '*')
    .replace(/[""„‟]/g, '"')
    .replace(/['''‚‛]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/−/g, '-')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/×/g, 'x')
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
  doc.text(pdf(title), mL + 3, y + h / 2 + 2.5)
  return y + h + 1
}

export interface PDFBufferOptions {
  clienteNome?: string
  responsavelNome?: string
  numero?: string
  valorAssessoria?: number
  valorContratoServico?: number
}

export async function gerarPDFCustasBuffer(
  resultado: ResultadoSimulador,
  options: PDFBufferOptions = {},
): Promise<Buffer> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const e = resultado.entrada

  // Mesmo ajuste (Reciprocidade zerada) usado no resumo de texto do WhatsApp
  // (workflow-custas.ts) — nunca calcular esse recorte em mais de um lugar.
  const resultadoAjustado = ajustarParaExibicaoCliente(resultado)
  const visiveisPdf = resultadoAjustado.linhas.filter((l) => l.visivel)
  const totalSemPdf = resultadoAjustado.totalSemDesconto
  const totalComPdf = resultadoAjustado.totalComDesconto
  const pctSemPdf = resultadoAjustado.percentualSemDesconto
  const pctComPdf = resultadoAjustado.percentualComDesconto

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const mL = 12
  const mR = 12
  const mTop = 10
  const mBot = 12
  const usableW = pageW - mL - mR

  let y = mTop

  // ── CABEÇALHO ─────────────────────────────────────────────────────────────
  // Mesma lógica de components/simulador/gerarPDF.ts: Caixa mostra os logos
  // Aval Financiamentos + Correspondente Caixa Aqui; outros bancos mostram a
  // faixa verde Fontinhas Assessoria. Logos embutidos como base64
  // (logos-caixa.ts) — doc.getImageProperties() dá as dimensões naturais sem
  // precisar de Image()/canvas do browser.
  const HEADER_H = 24

  if (isCaixa(e.banco)) {
    const avalProps = doc.getImageProperties(LOGO_AVAL)
    const [avalW, avalH] = fitInBox(avalProps.width, avalProps.height, usableW * 0.45, HEADER_H - 2)
    const avalY = y + (HEADER_H - avalH) / 2
    doc.addImage(LOGO_AVAL, 'PNG', mL, avalY, avalW, avalH)

    const caixaProps = doc.getImageProperties(LOGO_CAIXA_AQUI)
    const [caixaW, caixaH] = fitInBox(caixaProps.width, caixaProps.height, 30, HEADER_H - 6)
    const labelText = 'Correspondente  Caixa aqui'
    doc.setFontSize(9); doc.setFont('helvetica', 'bold')
    const textW = doc.getTextWidth(labelText)
    const totalW = caixaW + 3 + textW
    const startX = pageW - mR - totalW
    const caixaY = y + (HEADER_H - caixaH) / 2
    doc.addImage(LOGO_CAIXA_AQUI, 'PNG', startX, caixaY, caixaW, caixaH)
    setTxt(doc, '#1A3A6B')
    doc.text(labelText, startX + caixaW + 3, y + HEADER_H / 2 + 3)
  } else {
    setFill(doc, COR_VERDE)
    doc.rect(mL, y, usableW, HEADER_H, 'F')

    const fontinhasProps = doc.getImageProperties(LOGO_FONTINHAS)
    const [fW, fH] = fitInBox(fontinhasProps.width, fontinhasProps.height, 75, HEADER_H - 4)
    const fY = y + (HEADER_H - fH) / 2
    doc.addImage(LOGO_FONTINHAS, 'JPEG', mL + 2, fY, fW, fH)
  }

  y += HEADER_H + 4

  // ── LINHA DE IDENTIFICAÇÃO ────────────────────────────────────────────────
  const rowH = 9
  setFill(doc, COR_VERDE)
  doc.rect(mL, y, usableW, rowH, 'F')
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)

  const d = new Date()
  const dataHoje = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  const infoText = [
    options.numero ? `No ${options.numero}` : null,
    options.clienteNome ?? '',
    dataHoje,
    options.responsavelNome ?? '',
  ].filter(Boolean).join('   |   ')

  doc.text(pdf(infoText), pageW / 2, y + rowH / 2 + 2.5, { align: 'center' })
  y += rowH + 4

  // ── SEÇÃO 1 — Estimativa de valor dos serviços ───────────────────────────
  y = drawSectionTitle(doc, 'Estimativa de valor dos servicos', y, mL, usableW)

  const col3W = usableW / 3
  const secItems: [string, string][] = [
    ['Valor Assessoria',        options.valorAssessoria ? BRL.format(options.valorAssessoria) : '-'],
    ['Valor do Contrato',       options.valorContratoServico ? BRL.format(options.valorContratoServico) : '-'],
    ['Valor Total de Servicos', options.valorAssessoria || options.valorContratoServico
      ? BRL.format((options.valorAssessoria ?? 0) + (options.valorContratoServico ?? 0))
      : '-'],
  ]

  const secH = 16
  secItems.forEach(([label, val], i) => {
    const x = mL + i * col3W
    setFill(doc, i % 2 === 0 ? '#F5F5F0' : '#FAFAF8')
    doc.rect(x, y, col3W, secH, 'F')
    setDraw(doc, '#DDDDDD')
    doc.setLineWidth(0.3)
    doc.rect(x, y, col3W, secH, 'S')

    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setTxt(doc, '#777777')
    doc.text(label, x + col3W / 2, y + 5, { align: 'center' })

    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
    doc.text(val, x + col3W / 2, y + 12, { align: 'center' })
  })
  y += secH + 5

  // ── SEÇÃO 2 — Dados da operação ───────────────────────────────────────────
  y = drawSectionTitle(doc, 'Dados da operacao', y, mL, usableW)

  const col2W = usableW / 2
  const dadosEsq: [string, string][] = [
    ['Tipo de imovel',     e.tipoImovel],
    ['Cidade do Imovel',   e.cidade],
    ['Isento FunRejus',    e.isentoFunRejus === 'sim' ? 'Sim' : e.isentoFunRejus === 'nao' ? 'Nao' : 'A confirmar'],
    ['Primeira Aquisicao', e.primeiraAquisicao === 'sim' ? 'Sim' : e.primeiraAquisicao === 'nao' ? 'Nao' : 'A confirmar'],
    ['Banco',              e.banco],
  ]
  const dadosDir: [string, string][] = [
    ['Compra e Venda',    BRL.format(e.valorCV)],
    ['Valor Financiado',  BRL.format(e.valorFinanciado)],
    ['Recursos Proprios', BRL.format(Math.max(0, e.valorCV - e.valorFinanciado))],
    ['Produto',           e.produto.replace('_', '-')],
    ['Modalidade',        MODALIDADE_LABELS[e.modalidade]],
  ]

  const dadoRowH = 7
  const dadosStartY = y

  dadosEsq.forEach(([label, val], i) => {
    const rowY = dadosStartY + i * dadoRowH
    if (i % 2 === 0) {
      setFill(doc, '#F7F7F4')
      doc.rect(mL, rowY, col2W, dadoRowH, 'F')
    }
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setTxt(doc, '#888888')
    doc.text(pdf(label), mL + 3, rowY + 3)
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
    doc.text(pdf(val), mL + 3, rowY + 6.5)
  })

  dadosDir.forEach(([label, val], i) => {
    const rowY = dadosStartY + i * dadoRowH
    if (i % 2 === 0) {
      setFill(doc, '#F7F7F4')
      doc.rect(mL + col2W, rowY, col2W, dadoRowH, 'F')
    }
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setTxt(doc, '#888888')
    doc.text(pdf(label), mL + col2W + 3, rowY + 3)
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
    doc.text(pdf(val), mL + col2W + 3, rowY + 6.5)
  })

  setDraw(doc, COR_DOURADO)
  doc.setLineWidth(0.3)
  doc.rect(mL, dadosStartY, usableW, dadosEsq.length * dadoRowH, 'S')
  doc.line(mL + col2W, dadosStartY, mL + col2W, dadosStartY + dadosEsq.length * dadoRowH)

  y = dadosStartY + dadosEsq.length * dadoRowH + 5

  // ── SEÇÃO 3 — Estimativa de custas ────────────────────────────────────────
  y = drawSectionTitle(doc, 'Estimativa de custas para contratacao (escritura)', y, mL, usableW)

  const colItem = 42
  const colSem = 30
  const colCom = 30
  const colDesc = usableW - colItem - colSem - colCom

  const thH = 8
  setFill(doc, COR_VERDE)
  doc.rect(mL, y, usableW, thH, 'F')
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text('Item', mL + 2, y + thH / 2 + 2.5)
  doc.text('Sem Desconto', mL + colItem + colSem / 2, y + thH / 2 + 2.5, { align: 'center' })
  doc.text('Com Desconto', mL + colItem + colSem + colCom / 2, y + thH / 2 + 2.5, { align: 'center' })
  doc.text('Descricao', mL + colItem + colSem + colCom + 2, y + thH / 2 + 2.5)
  y += thH

  const descFontSize = 6.5

  visiveisPdf.forEach((linha, idx) => {
    const xItem = mL
    const xSem = mL + colItem
    const xCom = mL + colItem + colSem
    const xDesc = mL + colItem + colSem + colCom

    doc.setFontSize(descFontSize)
    const descLines = doc.splitTextToSize(pdf(linha.descricaoPDF), colDesc - 3)
    const minRowH = 8
    const rowH = Math.max(minRowH, descLines.length * 3.5 + 3)

    if (y + rowH > pageH - mBot - 30) {
      doc.addPage()
      y = mTop
    }

    if (idx % 2 === 0) {
      setFill(doc, '#F8F8F5')
      doc.rect(xItem, y, usableW, rowH, 'F')
    }

    setDraw(doc, '#E0E0DC')
    doc.setLineWidth(0.2)
    doc.rect(xItem, y, usableW, rowH, 'S')
    doc.line(xSem, y, xSem, y + rowH)
    doc.line(xCom, y, xCom, y + rowH)
    doc.line(xDesc, y, xDesc, y + rowH)

    const midY = y + rowH / 2

    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
    doc.text(pdf(linha.label), xItem + 2, midY + 2)

    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); setTxt(doc, '#333333')
    doc.text(BRL.format(linha.semDesconto), xSem + colSem / 2, midY + 2, { align: 'center' })

    const isMenor = linha.comDesconto < linha.semDesconto
    if (isMenor) {
      setTxt(doc, '#1E7B34')
      doc.setFont('helvetica', 'bold')
    }
    doc.text(BRL.format(linha.comDesconto), xCom + colCom / 2, midY + 2, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    setTxt(doc, '#333333')

    doc.setFontSize(descFontSize); setTxt(doc, '#666666')
    doc.text(descLines, xDesc + 2, y + 4.5, { lineHeightFactor: 1.4 })

    y += rowH
  })

  // TOTAL
  if (y + 12 > pageH - mBot - 20) {
    doc.addPage()
    y = mTop
  }

  setFill(doc, COR_BEGE)
  doc.rect(mL, y, usableW, 12, 'F')
  setDraw(doc, COR_DOURADO)
  doc.setLineWidth(0.5)
  doc.rect(mL, y, usableW, 12, 'S')

  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
  doc.text('ESTIMATIVA TOTAL', mL + 2, y + 8)
  doc.text(BRL.format(totalSemPdf), mL + colItem + colSem / 2, y + 8, { align: 'center' })
  doc.text(BRL.format(totalComPdf), mL + colItem + colSem + colCom / 2, y + 8, { align: 'center' })

  doc.setFontSize(6); doc.setFont('helvetica', 'italic'); setTxt(doc, '#555555')
  const totalDesc =
    'ESTIMATIVA TOTAL - Os valores sao calculados estimando o total de custas que se pode atingir numa operacao de Aquisicao por meio de financiamento.'
  const totalDescLines = doc.splitTextToSize(totalDesc, colDesc - 3)
  doc.text(totalDescLines, mL + colItem + colSem + colCom + 2, y + 4)

  y += 12 + 3

  // % do imóvel
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setTxt(doc, '#888888')
  doc.text('% do Valor do Imovel', mL + 2, y + 5)
  doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
  doc.text(`${pctSemPdf.toFixed(1)}%`, mL + colItem + colSem / 2, y + 5, { align: 'center' })
  doc.text(`${pctComPdf.toFixed(1)}%`, mL + colItem + colSem + colCom / 2, y + 5, { align: 'center' })
  y += 10

  // RODAPÉ
  const footerText = [
    'Atencao - Estes valores sao estimados de acordo com a tabela dos orgaos competentes, instituicoes financeiras e tabela de servicos (assessoria). Nao e uma tabela de preco fixo. As instituicoes podem alterar o valor para mais ou para menos de acordo com a politica vigente na data da assinatura ou contratacao do servico.',
    'Este documento e valido como forma de orientar o cliente a organizar-se financeiramente para as custas de contratacao de um processo de financiamento imobiliario.',
  ]

  if (y + 20 > pageH - mBot) {
    doc.addPage()
    y = mTop
  } else {
    y += 4
  }

  setDraw(doc, COR_DOURADO)
  doc.setLineWidth(0.4)
  doc.line(mL, y, pageW - mR, y)
  y += 4

  doc.setFontSize(6.5); doc.setFont('helvetica', 'italic'); setTxt(doc, '#666666')
  footerText.forEach((line) => {
    const wrapped = doc.splitTextToSize(line, usableW)
    doc.text(wrapped, mL, y, { lineHeightFactor: 1.4 })
    y += wrapped.length * 2.8 + 2
  })

  return Buffer.from(doc.output('arraybuffer'))
}
