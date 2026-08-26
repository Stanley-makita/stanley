/**
 * Gerador de PDF do Simulador Preliminar de CGI / Home Equity.
 *
 * Mesmo padrão visual (jsPDF, cores, helpers) do PDF de financiamento imobiliário
 * (`simuladorFinanciamento/gerarPDFBuffer.ts`), mas replicado aqui — não importado —
 * porque aquele arquivo não exporta seus helpers internos e este é um produto isolado
 * (não deve importar nada do motor de financiamento imobiliário calibrado).
 *
 * `montarDocCgi` monta o documento jsPDF puro (sem Image/canvas/document/window), então
 * roda tanto no servidor (`gerarPDFCgiBuffer`, usado pelo bot e pela API de compartilhar)
 * quanto no browser (`baixarPDFCgi`, usado pelos simuladores web) — sem precisar de duas
 * variantes de layout como Financiamento/Consórcio precisam por causa de logos.
 */

import { NOTA_IOF_CGI, NOTA_IDADE_NAO_INFORMADA_CGI, notaTaxaCgi, notaLimitadoPelaIdadeCgi, BANCOS_CGI_CONFIG } from './constantes'
import type { ResultadoCgiCompleto } from './tipos'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const COR_VERDE   = '#253B29'
const COR_DOURADO = '#C2AA6A'

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

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

function fmtData(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
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

export interface PDFCgiOptions {
  clienteNome?: string
  responsavelNome?: string
  cpfCliente?: string | null
}

async function montarDocCgi(resultado: ResultadoCgiCompleto, options: PDFCgiOptions): Promise<Doc> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const mL = 12, mR = 12, mTop = 10, mBot = 12
  const usableW = pageW - mL - mR

  let y = mTop

  // ── CABEÇALHO ─────────────────────────────────────────────────────────────
  const HEADER_H = 30
  setFill(doc, COR_VERDE)
  doc.rect(mL, y, usableW, HEADER_H, 'F')
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text('FONTI', mL + 4, y + 11)
  doc.setFontSize(7);  doc.setFont('helvetica', 'normal'); setTxt(doc, '#CCCCCC')
  doc.text('Sistema Operacional de Credito', mL + 4, y + 19)
  doc.setFontSize(6.5); doc.setFont('helvetica', 'italic'); setTxt(doc, COR_DOURADO)
  doc.text('by Fontinhas Assessoria', mL + 4, y + 25)
  const rightEdge = pageW - mR - 2
  doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); setTxt(doc, COR_DOURADO)
  doc.text('SIMULACAO PRELIMINAR', rightEdge, y + 9, { align: 'right' })
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text('CGI / HOME EQUITY', rightEdge, y + 18, { align: 'right' })
  y += HEADER_H + 4

  // ── LINHA DE IDENTIFICAÇÃO ────────────────────────────────────────────────
  const rowH = 9
  setFill(doc, COR_VERDE)
  doc.rect(mL, y, usableW, rowH, 'F')
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  const d = new Date()
  const dataHoje = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  const infoText = [
    options.clienteNome ?? '',
    dataHoje,
    options.responsavelNome ?? '',
    'Simulação Preliminar',
  ].filter(Boolean).join('   |   ')
  doc.text(infoText, pageW / 2, y + rowH / 2 + 2.5, { align: 'center' })
  y += rowH + 4

  // ── DADOS DA OPERAÇÃO ────────────────────────────────────────────────────
  y = drawSectionTitle(doc, 'Dados da Operação', y, mL, usableW)
  const inp = resultado.input
  const dadosItems: [string, string][] = [
    ['Valor do Imóvel (garantia)', BRL.format(inp.valorImovel)],
    ['Crédito Solicitado',         BRL.format(inp.valorDesejado)],
    ['Prazo Pedido',               inp.prazoMeses ? `${inp.prazoMeses} meses` : 'Não informado (usado 240 meses)'],
    ['Data de Nascimento',         inp.dataNascimento ? fmtData(inp.dataNascimento) : 'Não informada'],
  ]
  const col2W = usableW / 2
  const dadoH = 14
  const ROWS = Math.ceil(dadosItems.length / 2)
  dadosItems.forEach(([label, val], i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = mL + col * col2W
    const ry = y + row * dadoH
    setFill(doc, col === 0 ? '#F5F5F0' : '#FAFAF8')
    doc.rect(x, ry, col2W, dadoH, 'F')
    setDraw(doc, '#DDDDDD'); doc.setLineWidth(0.3)
    doc.rect(x, ry, col2W, dadoH, 'S')
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setTxt(doc, '#777777')
    doc.text(pdf(label), x + col2W / 2, ry + 5, { align: 'center' })
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
    doc.text(pdf(val), x + col2W / 2, ry + 11, { align: 'center' })
  })
  y += ROWS * dadoH + 5

  // ── RESSALVA DE IDADE NÃO INFORMADA ──────────────────────────────────────
  if (!inp.dataNascimento) {
    if (y + 16 > pageH - mBot - 10) { doc.addPage(); y = mTop }
    const notaLinhas = doc.splitTextToSize(pdf(NOTA_IDADE_NAO_INFORMADA_CGI), usableW - 8)
    const notaH = Math.max(12, notaLinhas.length * 4 + 7)
    setFill(doc, '#FFF8E6'); setDraw(doc, '#D9B84A')
    doc.setLineWidth(0.3)
    doc.rect(mL, y, usableW, notaH, 'FD')
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); setTxt(doc, '#8A6D1F')
    doc.text('Atenção:', mL + 3, y + 5)
    doc.setFontSize(6); doc.setFont('helvetica', 'italic'); setTxt(doc, '#8A6D1F')
    doc.text(notaLinhas, mL + 3, y + 9)
    y += notaH + 4
  }

  // ── COMPARATIVO DE BANCOS ────────────────────────────────────────────────
  y = drawSectionTitle(doc, 'Comparativo de Bancos', y, mL, usableW)

  const cols = [
    { label: 'Banco',         w: usableW * 0.15 },
    { label: 'Sistema',       w: usableW * 0.09 },
    { label: 'Vlr Simulado',  w: usableW * 0.15 },
    { label: '% Imóvel',      w: usableW * 0.09 },
    { label: 'Taxa a.a.',     w: usableW * 0.11 },
    { label: 'Prazo Max.',    w: usableW * 0.10 },
    { label: 'Prazo Usado',   w: usableW * 0.10 },
    { label: 'IOF Estimado',  w: usableW * 0.11 },
    { label: 'Prestação',     w: usableW * 0.10 },
  ]
  const thH = 11
  setFill(doc, COR_VERDE)
  doc.rect(mL, y, usableW, thH, 'F')
  let cx = mL
  doc.setTextColor(255, 255, 255)
  cols.forEach((col) => {
    if (col.label === 'Taxa a.a.') {
      doc.setFontSize(4.6); doc.setFont('helvetica', 'normal')
      doc.text('A partir de', cx + col.w / 2, y + 4, { align: 'center' })
      doc.setFontSize(6.1); doc.setFont('helvetica', 'bold')
      doc.text(col.label, cx + col.w / 2, y + 8.5, { align: 'center' })
    } else {
      doc.setFontSize(6.1); doc.setFont('helvetica', 'bold')
      doc.text(col.label, cx + col.w / 2, y + thH / 2 + 1.8, { align: 'center' })
    }
    cx += col.w
  })
  y += thH

  resultado.bancos.forEach((b, idx) => {
    const rH = b.elegivel ? 10 : 14
    if (y + rH > pageH - mBot - 20) { doc.addPage(); y = mTop }
    const ehMenor = b.bancoId === resultado.bancoMenorPrestacaoId
    setFill(doc, !b.elegivel ? '#FFF0F0' : ehMenor ? '#EEF5EE' : idx % 2 === 0 ? '#F8F8F5' : '#FFFFFF')
    doc.rect(mL, y, usableW, rH, 'F')
    setDraw(doc, '#E0E0DC'); doc.setLineWidth(0.2)
    doc.rect(mL, y, usableW, rH, 'S')

    if (!b.elegivel) {
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); setTxt(doc, '#A03030')
      doc.text(pdf(b.bancoNome), mL + 3, y + 5)
      doc.setFontSize(6); doc.setFont('helvetica', 'italic'); setTxt(doc, '#A03030')
      const motivoLinhas = doc.splitTextToSize(pdf(b.motivoInelegivel ?? 'Não elegível'), usableW - 6)
      doc.text(motivoLinhas.slice(0, 2), mL + 3, y + 10)
      y += rH
      return
    }

    cx = mL
    const midY = y + rH / 2 + 2.5
    const row = [
      b.bancoNome,
      b.sistemaAmortizacao,
      BRL.format(b.valorSimulado),
      `${(b.percentualFinanciado * 100).toFixed(1)}%`,
      `${(b.taxaAnualReferencia * 100).toFixed(2)}%${b.indexadoIpca ? '+IPCA' : ''}`,
      `${b.prazoMaximoBanco}m`,
      `${b.prazoConsiderado}m`,
      BRL.format(b.iofEstimado),
      BRL.format(b.prestacaoEstimada),
    ]
    row.forEach((val, ci) => {
      doc.setFontSize(6.1)
      doc.setFont('helvetica', ci === 0 || ehMenor ? 'bold' : 'normal')
      setTxt(doc, ehMenor ? COR_VERDE : '#333333')
      doc.text(pdf(val), cx + cols[ci].w / 2, midY, { align: 'center' })
      cx += cols[ci].w
    })
    if (ehMenor) {
      doc.setFontSize(5); doc.setFont('helvetica', 'bold'); setTxt(doc, '#1E7B34')
      doc.text('menor prestação estimada', mL + 2, y + rH - 1)
    }
    y += rH
  })
  y += 5

  // ── IOF (seção própria, separada da prestação) ───────────────────────────
  if (y + 20 > pageH - mBot - 10) { doc.addPage(); y = mTop }
  y = drawSectionTitle(doc, 'IOF', y, mL, usableW)
  const iofLinhas = doc.splitTextToSize(pdf(NOTA_IOF_CGI), usableW - 8)
  const iofH = Math.max(12, iofLinhas.length * 4 + 7)
  setFill(doc, '#FFF8E6'); setDraw(doc, '#D9B84A')
  doc.setLineWidth(0.3)
  doc.rect(mL, y, usableW, iofH, 'FD')
  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); setTxt(doc, '#8A6D1F')
  doc.text('IOF estimado, exibido à parte da prestação:', mL + 3, y + 5)
  doc.setFontSize(6); doc.setFont('helvetica', 'italic'); setTxt(doc, '#8A6D1F')
  doc.text(iofLinhas, mL + 3, y + 9)
  y += iofH + 4

  // ── NOTAS DE TAXA POR BANCO (pós-fixados) ────────────────────────────────
  const bancosIpca = resultado.bancos.filter((b) => b.indexadoIpca)
  if (bancosIpca.length > 0) {
    if (y + 16 > pageH - mBot - 10) { doc.addPage(); y = mTop }
    const notasTexto = bancosIpca.map((b) => `${b.bancoNome}: ${notaTaxaCgi(BANCOS_CGI_CONFIG[b.bancoId])}`).join(' ')
    const notasLinhas = doc.splitTextToSize(pdf(notasTexto), usableW - 8)
    const notasH = Math.max(12, notasLinhas.length * 4 + 7)
    setFill(doc, '#EEF4FF'); setDraw(doc, '#AACCEE')
    doc.setLineWidth(0.3)
    doc.rect(mL, y, usableW, notasH, 'FD')
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); setTxt(doc, '#1A44AA')
    doc.text('Taxas pós-fixadas (IPCA não projetado nesta simulação):', mL + 3, y + 5)
    doc.setFontSize(6); doc.setFont('helvetica', 'italic'); setTxt(doc, '#2255AA')
    doc.text(notasLinhas, mL + 3, y + 9)
    y += notasH + 4
  }

  // ── LIMITAÇÕES (LTV/prazo do banco/idade) ────────────────────────────────
  const bancosLimitados = resultado.bancos.filter((b) => b.elegivel && (b.limitadoPeloLtv || b.limitadoPeloPrazoBanco || b.limitadoPelaIdade))
  if (bancosLimitados.length > 0) {
    if (y + 16 > pageH - mBot - 10) { doc.addPage(); y = mTop }
    const textoLimitacoes = bancosLimitados.map((b) => {
      const partes: string[] = []
      if (b.limitadoPeloLtv) partes.push(`limitado a ${BRL.format(b.valorMaximoPeloImovel)} (60% do imóvel)`)
      if (b.limitadoPeloPrazoBanco) partes.push(`prazo limitado a ${b.prazoMaximoBanco} meses (teto do banco)`)
      if (b.limitadoPelaIdade) partes.push(notaLimitadoPelaIdadeCgi(b.prazoConsiderado))
      return `${b.bancoNome}: ${partes.join('; ')}.`
    }).join(' ')
    const limLinhas = doc.splitTextToSize(pdf(textoLimitacoes), usableW - 8)
    const limH = Math.max(12, limLinhas.length * 4 + 7)
    setFill(doc, '#FFF0F0'); setDraw(doc, '#E0A0A0')
    doc.setLineWidth(0.3)
    doc.rect(mL, y, usableW, limH, 'FD')
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); setTxt(doc, '#A03030')
    doc.text('Limitações aplicadas nesta simulação:', mL + 3, y + 5)
    doc.setFontSize(6); doc.setFont('helvetica', 'italic'); setTxt(doc, '#A03030')
    doc.text(limLinhas, mL + 3, y + 9)
    y += limH + 4
  }

  // ── RODAPÉ ────────────────────────────────────────────────────────────────
  if (y + 30 > pageH - mBot) { doc.addPage(); y = mTop } else { y += 4 }
  setDraw(doc, COR_DOURADO); doc.setLineWidth(0.4)
  doc.line(mL, y, pageW - mR, y)
  y += 5

  const now = new Date()
  const dataGer = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
  const horaGer = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); setTxt(doc, '#555555')
  doc.text('Gerado automaticamente pelo Motor de Credito Fonti', mL, y + 4)
  doc.setFontSize(6.5); setTxt(doc, '#777777')
  doc.text(`${dataGer} as ${horaGer}`, mL, y + 9)
  y += 22

  const footerText = pdf(
    'Simulacao preliminar e comparativa. Taxas apresentadas sao referencias "a partir de", ' +
    'sujeitas a analise de credito, imovel, relacionamento e politica vigente de cada ' +
    'instituicao financeira na data da contratacao. IOF e demais encargos sao estimados ' +
    'para fins de simulacao e poderao sofrer alteracao no momento da contratacao. Esta ' +
    'simulacao nao representa aprovacao de credito.'
  )
  doc.setFontSize(6.5); doc.setFont('helvetica', 'italic'); setTxt(doc, '#666666')
  const wrapped = doc.splitTextToSize(footerText, usableW)
  doc.text(wrapped, mL, y, { lineHeightFactor: 1.4 })

  return doc
}

export async function gerarPDFCgiBuffer(
  resultado: ResultadoCgiCompleto,
  options: PDFCgiOptions = {},
): Promise<Buffer> {
  const doc = await montarDocCgi(resultado, options)
  return Buffer.from(doc.output('arraybuffer') as ArrayBuffer)
}

export async function baixarPDFCgi(
  resultado: ResultadoCgiCompleto,
  options: PDFCgiOptions & { nomeArquivo?: string } = {},
): Promise<void> {
  const doc = await montarDocCgi(resultado, options)
  const nome = options.nomeArquivo ?? `Simulacao CGI${options.clienteNome ? ` - ${options.clienteNome}` : ''}.pdf`
  doc.save(nome)
}

// "Ver na tela" — abre o PDF numa nova aba do navegador em vez de baixar.
export async function abrirPDFCgiNaTela(
  resultado: ResultadoCgiCompleto,
  options: PDFCgiOptions = {},
): Promise<void> {
  const doc = await montarDocCgi(resultado, options)
  const url = doc.output('bloburl')
  window.open(url.toString(), '_blank')
}
