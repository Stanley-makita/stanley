/**
 * Gerador de PDF server-side — variante buffer do gerarPDFFinanciamento.
 *
 * Usa o mesmo layout e lógica do gerador oficial (gerarPDFFinanciamento.ts),
 * mas sem APIs de browser (Image, canvas, window, document).
 * Retorna um Buffer pronto para envio via WhatsApp ou Storage.
 *
 * Nunca criar um segundo template. Este arquivo apenas adapta a saída.
 */

import type { ResultadoCompleto, ResultadoBanco } from './tipos'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const COR_VERDE   = '#253B29'
const COR_DOURADO = '#C2AA6A'
const COR_BEGE    = '#E7E0C4'

const BANCO_ABREV: Record<string, string> = {
  caixa: 'Caixa', itau: 'Itau', bradesco: 'Bradesco',
  santander: 'Santander', bb: 'BB', inter: 'Inter', daycoval: 'Daycoval',
}
function abrevBanco(bancoId: string, bancoNome: string): string {
  const id = bancoId.split('-')[0]
  return BANCO_ABREV[id] ?? bancoNome.split(' ')[0]
}

const MODALIDADE_LABEL: Record<string, string> = {
  aquisicao:                  'Aquisicao de Imovel Residencial',
  comercial:                  'Aquisicao de Imovel Comercial',
  lote_urbanizado:            'Aquisicao de Lote Urbanizado',
  construcao_terreno_proprio: 'Construcao em Terreno Proprio',
  terreno_mais_construcao:    'Aquisicao de Terreno + Construcao',
}
const MODALIDADE_SUBTITULO: Record<string, string> = {
  lote_urbanizado: '(Terreno / Lote / Data / Gleba)',
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
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/−/g, '-')   // sinal de menos (U+2212)
    .replace(/≥/g, '>=')  // >=
    .replace(/≤/g, '<=')  // <=
    .replace(/×/g, 'x')   // ×
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

export interface PDFBufferOptions {
  clienteNome?: string
  responsavelNome?: string
  numero?: string
}

export async function gerarPDFFinanciamentoBuffer(
  resultado: ResultadoCompleto,
  options: PDFBufferOptions = {},
): Promise<Buffer> {
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

  const tipoOp = resultado.input.tipoOperacao ?? 'aquisicao'
  const modalidadeLabel     = MODALIDADE_LABEL[tipoOp] ?? 'Financiamento Imobiliario'
  const modalidadeSubtitulo = MODALIDADE_SUBTITULO[tipoOp] ?? null

  // ── CABEÇALHO ─────────────────────────────────────────────────────────────
  const HEADER_H = 34
  setFill(doc, COR_VERDE)
  doc.rect(mL, y, usableW, HEADER_H, 'F')
  // Identidade Fonti (esquerda)
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text('FONTI', mL + 4, y + 11)
  doc.setFontSize(7);  doc.setFont('helvetica', 'normal'); setTxt(doc, '#CCCCCC')
  doc.text('Sistema Operacional de Credito', mL + 4, y + 19)
  doc.setFontSize(6.5); doc.setFont('helvetica', 'italic'); setTxt(doc, COR_DOURADO)
  doc.text('by Fontinhas Assessoria', mL + 4, y + 25)
  // Título do documento (direita)
  const rightEdge = pageW - mR - 2
  doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); setTxt(doc, COR_DOURADO)
  doc.text('SIMULACAO PRELIMINAR', rightEdge, y + 7, { align: 'right' })
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text('FINANCIAMENTO IMOBILIARIO', rightEdge, y + 15, { align: 'right' })
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_DOURADO)
  doc.text(pdf(modalidadeLabel), rightEdge, y + 23, { align: 'right' })
  if (modalidadeSubtitulo) {
    doc.setFontSize(6); doc.setFont('helvetica', 'normal'); setTxt(doc, COR_BEGE)
    doc.text(modalidadeSubtitulo, rightEdge, y + 29, { align: 'right' })
  }
  y += HEADER_H + 4

  // ── LINHA DE IDENTIFICAÇÃO ────────────────────────────────────────────────
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
    'Simulação Preliminar',
  ].filter(Boolean).join('   |   ')

  doc.text(infoText, pageW / 2, y + rowH / 2 + 2.5, { align: 'center' })
  y += rowH + 4

  // ── MELHOR CENÁRIO ────────────────────────────────────────────────────────
  const melhorBanco = resultado.bancos.find((b) => b.elegivel)
  const melhorH     = 24
  const stripH      = 12  // strip inferior com modalidade+produto quando elegível
  const orientH     = 36  // altura quando sem elegíveis (texto orientativo)
  const totalCardH  = melhorBanco ? melhorH + stripH : orientH

  setFill(doc, '#EEF5EE')
  doc.rect(mL, y, usableW, totalCardH, 'F')
  setFill(doc, COR_VERDE)
  doc.rect(mL, y, 3, totalCardH, 'F')
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
  doc.text('Melhor Cenario Encontrado', mL + 6, y + 6)

  if (melhorBanco) {
    const cellWidths = [
      usableW * 0.30,
      usableW * 0.20,
      usableW * 0.18,
      usableW * 0.16,
      usableW * 0.16,
    ]
    const cells: [string, string][] = [
      ['Banco',       pdf(melhorBanco.bancoNome)],
      ['Financiado',  BRL.format(melhorBanco.valorFinanciado)],
      ['1a Parcela',  BRL.format(melhorBanco.primeiraParcela)],
      ['Prazo',       `${melhorBanco.parcelas} meses`],
      ['Amortizacao', melhorBanco.tipoAmortizacao],
    ]
    let cx = mL
    cells.forEach(([label, val], i) => {
      const cw = cellWidths[i]
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); setTxt(doc, '#777777')
      doc.text(label, cx + cw / 2, y + 13, { align: 'center' })
      doc.setFontSize(i === 0 ? 8 : 9); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
      if (i === 0) {
        const lines = doc.splitTextToSize(val, cw - 4)
        const lineY = lines.length > 1 ? y + 17 : y + 20
        doc.text(lines.slice(0, 2), cx + cw / 2, lineY, { align: 'center' })
      } else {
        doc.text(val, cx + cw / 2, y + 20, { align: 'center' })
      }
      cx += cw
    })

    // Strip inferior: Modalidade | Produto | Banco
    const stripY = y + melhorH
    setFill(doc, '#D8E8D8')
    doc.rect(mL + 3, stripY, usableW - 3, stripH, 'F')
    const stripFields: [string, string][] = [
      ['Modalidade', pdf(modalidadeLabel)],
      ['Produto',    pdf(melhorBanco.programa)],
      ['Banco',      pdf(melhorBanco.bancoNome)],
    ]
    const sfW = (usableW - 3) / 3
    stripFields.forEach(([label, val], i) => {
      const sx = mL + 3 + i * sfW
      doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); setTxt(doc, '#557755')
      doc.text(label, sx + sfW / 2, stripY + 4, { align: 'center' })
      doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
      doc.text(doc.splitTextToSize(val, sfW - 4)[0], sx + sfW / 2, stripY + 9.5, { align: 'center' })
    })
  } else {
    // Resposta orientativa quando nenhum banco é elegível
    const rendaMensal = resultado.input.rendaMensal
    const parcelaMax  = rendaMensal * 0.30
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); setTxt(doc, '#B00000')
    doc.text('Nenhum banco elegivel automaticamente com os dados informados.', mL + 6, y + 12)
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setTxt(doc, '#444444')
    const orientText = pdf(
      `Com a renda de ${BRL.format(rendaMensal)}, a parcela maxima estimada e de ` +
      `${BRL.format(parcelaMax)} (30% da renda — o limite pode variar conforme a modalidade). ` +
      `Para atingir o objetivo, considere aumentar a entrada, buscar imovel de menor valor ` +
      `ou compor renda com outra pessoa. Nossa equipe esta disponivel para avaliar alternativas.`
    )
    const wrapped = doc.splitTextToSize(orientText, usableW - 12)
    doc.text(wrapped, mL + 6, y + 19)
  }
  y += totalCardH + 5

  // ── SEÇÃO 1 — Dados da simulação ──────────────────────────────────────────
  y = drawSectionTitle(doc, 'Dados da Simulação', y, mL, usableW)

  const inp = resultado.input
  // Entrada/financiado exibidos aqui refletem o CENÁRIO VENCEDOR (`melhorBanco`), não o
  // `inp.valorEntrada` bruto — corrigido jul/2026: desde que "financiando valor máximo"
  // passou a recalcular a entrada por programa e por sistema (SAC/PRICE, cada um com sua
  // própria cota/comprometimento — ver `construirCenariosCaixa`, engine.ts),
  // `inp.valorEntrada` ficou sendo só a estimativa genérica inicial (usada pra rodar a
  // simulação), que pode não bater com NENHUM resultado específico exibido — confuso pro
  // usuário ver aqui um número diferente do card "Melhor Cenário" logo acima. Quando não
  // há cenário elegível (`melhorBanco` undefined), mantém o valor bruto do input.
  const valorFinanciado = melhorBanco ? melhorBanco.valorFinanciado : (inp.valorImovel - inp.valorEntrada)
  const valorEntradaExibida = melhorBanco ? (inp.valorImovel - melhorBanco.valorFinanciado) : inp.valorEntrada

  let idadeStr = '—'
  if (inp.dataNascimento) {
    const hoje = new Date()
    const nasc = new Date(inp.dataNascimento)
    const anos = hoje.getFullYear() - nasc.getFullYear() -
      (hoje < new Date(hoje.getFullYear(), nasc.getMonth(), nasc.getDate()) ? 1 : 0)
    idadeStr = `${anos} anos`
  }

  const dadosItems: [string, string][] = [
    ['Valor do Imóvel',  BRL.format(inp.valorImovel)],
    ['Entrada',          BRL.format(valorEntradaExibida)],
    ['Valor Financiado', BRL.format(valorFinanciado)],
    ['Renda Mensal',     inp.rendaInformada === false ? 'Não informada' : BRL.format(inp.rendaMensal)],
    // Reflete a amortização do Melhor Cenário (não o valor global solicitado): a Caixa
    // pode gerar SAC e PRICE ao mesmo tempo, e o vencedor pode divergir do input global.
    ['Amortização',      melhorBanco?.tipoAmortizacao ?? inp.tipoAmortizacao],
    [inp.idadeEstimada ? 'Idade estimada' : 'Idade', idadeStr],
  ]

  const col3W = usableW / 3
  const dadoH = 16
  const ROWS = Math.ceil(dadosItems.length / 3)

  dadosItems.forEach(([label, val], i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    const x  = mL + col * col3W
    const ry = y + row * dadoH

    setFill(doc, col % 2 === 0 ? '#F5F5F0' : '#FAFAF8')
    doc.rect(x, ry, col3W, dadoH, 'F')
    setDraw(doc, '#DDDDDD'); doc.setLineWidth(0.3)
    doc.rect(x, ry, col3W, dadoH, 'S')

    doc.setFontSize(7);  doc.setFont('helvetica', 'normal'); setTxt(doc, '#777777')
    doc.text(label, x + col3W / 2, ry + 5, { align: 'center' })
    doc.setFontSize(9);  doc.setFont('helvetica', 'bold');   setTxt(doc, COR_VERDE)
    doc.text(val,   x + col3W / 2, ry + 12, { align: 'center' })
  })

  y += ROWS * dadoH + 5

  // Nota de idade estimada — a idade usada no cálculo não veio de uma data de nascimento
  // completa e confirmada (aproximada por "X anos" ou assumida para viabilizar prazo
  // máximo sem nascimento informado). Prazo/parcela/elegibilidade dependem dela.
  if (inp.idadeEstimada) {
    if (y + 16 > pageH - mBot - 10) { doc.addPage(); y = mTop }
    const notaIdadeTexto = pdf(
      'Idade estimada — nao confirmada por data de nascimento completa. Prazo, parcela e ' +
      'elegibilidade calculados a partir dela sao estimativas e podem mudar apos confirmacao ' +
      'da data de nascimento real do cliente.'
    )
    const notaLinhas = doc.splitTextToSize(notaIdadeTexto, usableW - 8)
    const notaH = Math.max(12, notaLinhas.length * 4 + 7)
    setFill(doc, '#FFF8E6'); setDraw(doc, '#D9B84A')
    doc.setLineWidth(0.3)
    doc.rect(mL, y, usableW, notaH, 'FD')
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); setTxt(doc, '#8A6D1F')
    doc.text('Atencao:', mL + 3, y + 5)
    doc.setFontSize(6); doc.setFont('helvetica', 'italic'); setTxt(doc, '#8A6D1F')
    doc.text(notaLinhas, mL + 3, y + 9)
    y += notaH + 4
  }

  // Nota de modalidade — exibida quando a operação não é aquisição simples (lote,
  // construção, comercial). Sem isso, o PDF anexado no WhatsApp nunca explicava por que
  // só a Caixa aparece elegível nessas modalidades.
  const observacaoModalidade = resultado.bancos.find((b) => b.observacao)?.observacao ?? ''
  if (observacaoModalidade) {
    if (y + 16 > pageH - mBot - 10) { doc.addPage(); y = mTop }
    const obsLines = doc.splitTextToSize(pdf(observacaoModalidade), usableW - 8)
    const obsH = Math.max(12, obsLines.length * 4 + 7)
    setFill(doc, '#EEF4FF'); setDraw(doc, '#AACCEE')
    doc.setLineWidth(0.3)
    doc.rect(mL, y, usableW, obsH, 'FD')
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); setTxt(doc, '#1A44AA')
    doc.text('Nota:', mL + 3, y + 5)
    doc.setFontSize(6); doc.setFont('helvetica', 'italic'); setTxt(doc, '#2255AA')
    doc.text(obsLines, mL + 3, y + 9)
    y += obsH + 4
  }

  // ── SEÇÃO 2 — Comparativo ─────────────────────────────────────────────────
  const elegiveis    = resultado.bancos.filter((r) => r.elegivel)
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
    doc.text('Banco',      cx + 2,               y + thH / 2 + 2.5); cx += colBanco
    doc.text('Programa',   cx + 2,               y + thH / 2 + 2.5); cx += colPrograma
    doc.text('1ª Parcela', cx + colParcela / 2,  y + thH / 2 + 2.5, { align: 'center' }); cx += colParcela
    doc.text('Última',     cx + colUltima / 2,   y + thH / 2 + 2.5, { align: 'center' }); cx += colUltima
    doc.text('Parcelas',   cx + colParcelas / 2, y + thH / 2 + 2.5, { align: 'center' }); cx += colParcelas
    doc.text('Taxa a.a.',  cx + colTaxa / 2,     y + thH / 2 + 2.5, { align: 'center' }); cx += colTaxa
    doc.text('Total Pago', cx + colTotal / 2,    y + thH / 2 + 2.5, { align: 'center' })
    y += thH

    elegiveis.forEach((r, idx) => {
      const rH = 10
      if (y + rH > pageH - mBot - 20) { doc.addPage(); y = mTop }

      setFill(doc, idx === 0 ? '#EEF5EE' : idx % 2 === 0 ? '#F8F8F5' : '#FFFFFF')
      doc.rect(mL, y, usableW, rH, 'F')
      setDraw(doc, '#E0E0DC'); doc.setLineWidth(0.2)
      doc.rect(mL, y, usableW, rH, 'S')

      const midY = y + rH / 2 + 2.5
      cx = mL

      doc.setFontSize(7.5); doc.setFont('helvetica', idx === 0 ? 'bold' : 'normal')
      setTxt(doc, idx === 0 ? COR_VERDE : '#333333')
      // Melhor banco: desloca o nome para cima e adiciona badge "melhor" abaixo
      const nameY = idx === 0 ? midY - 1.5 : midY
      const grupoTemMultiplosCenariosTabela = elegiveis.filter((x) => x.bancoId === r.bancoId && x.programa === r.programa).length > 1
      const nomeBancoLinha = grupoTemMultiplosCenariosTabela
        ? `${abrevBanco(r.bancoId, r.bancoNome)} ${r.tipoAmortizacao}`
        : abrevBanco(r.bancoId, r.bancoNome)
      doc.text(pdf(nomeBancoLinha), cx + 2, nameY)
      if (idx === 0) {
        doc.setFontSize(5.5); doc.setFont('helvetica', 'bold'); setTxt(doc, '#1E7B34')
        doc.text('melhor', cx + 2, nameY + 3.5)
      }
      cx += colBanco

      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setTxt(doc, '#555555')
      const progLines = doc.splitTextToSize(pdf(r.programa), colPrograma - 3)
      doc.text(progLines[0], cx + 2, midY); cx += colPrograma

      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); setTxt(doc, '#111111')
      doc.text(BRL.format(r.primeiraParcela), cx + colParcela / 2, midY, { align: 'center' }); cx += colParcela

      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setTxt(doc, '#555555')
      doc.text(BRL.format(r.ultimaParcela),        cx + colUltima / 2,   midY, { align: 'center' }); cx += colUltima
      doc.text(`${r.parcelas}`,                    cx + colParcelas / 2, midY, { align: 'center' }); cx += colParcelas
      doc.text(`${(r.taxaAnual * 100).toFixed(2)}%`, cx + colTaxa / 2,  midY, { align: 'center' }); cx += colTaxa
      doc.text(BRL.format(r.totalPago),            cx + colTotal / 2,    midY, { align: 'center' })

      y += rH
    })
    y += 5
  } else {
    doc.setFontSize(8); doc.setFont('helvetica', 'italic'); setTxt(doc, '#888888')
    doc.text('Nenhum banco elegível para os parâmetros informados.', mL + 2, y + 6)
    y += 12
  }

  // ── SEÇÃO 3 — Detalhes por banco ──────────────────────────────────────────
  if (elegiveis.length > 0) {
    y = drawSectionTitle(doc, 'Detalhes por Banco', y, mL, usableW)
    const col2W = usableW / 2

    elegiveis.forEach((r, idx) => {
      const cardH = 44
      if (y + cardH > pageH - mBot - 10) { doc.addPage(); y = mTop }

      const isLeft = idx % 2 === 0
      const x      = mL + (isLeft ? 0 : col2W)
      const cardW  = col2W - 1

      const [br, bg, bb] = hexToRgb(r.corBanco?.startsWith('#') ? r.corBanco : COR_VERDE)
      doc.setFillColor(br, bg, bb)
      doc.rect(x, y, cardW, 8, 'F')
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
      // Comparação de Cenários: quando o grupo banco+programa tem mais de 1 resultado
      // elegível (hoje só a Caixa, via SAC/PRICE), o título do card fica ambíguo sem o
      // cenário — dois cards "Caixa Econômica Federal - SBPE" ficariam indistinguíveis.
      const grupoTemMultiplosCenarios = elegiveis.filter((x) => x.bancoId === r.bancoId && x.programa === r.programa).length > 1
      const cenarioSufixo = grupoTemMultiplosCenarios ? ` (${r.tipoAmortizacao})` : ''
      doc.text(pdf(`${r.bancoNome} - ${r.programa}${cenarioSufixo}`), x + 3, y + 5.5)

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
        const my = y + 13 + mi * 5.5
        doc.setFontSize(6);   doc.setFont('helvetica', 'normal'); setTxt(doc, '#888888')
        doc.text(pdf(label), x + 3, my)
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');   setTxt(doc, COR_VERDE)
        doc.text(pdf(val), x + metW - 2, my, { align: 'right' })
      })
      metC2.forEach(([label, val], mi) => {
        const my = y + 13 + mi * 5.5
        const mx = x + cardW / 2 + 2
        doc.setFontSize(6);   doc.setFont('helvetica', 'normal'); setTxt(doc, '#888888')
        doc.text(pdf(label), mx, my)
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');   setTxt(doc, COR_VERDE)
        doc.text(pdf(val), x + cardW - 3, my, { align: 'right' })
      })

      setDraw(doc, '#DDDDDD'); doc.setLineWidth(0.2)
      doc.line(x + cardW / 2, y + 8, x + cardW / 2, y + cardH)

      if (!isLeft || idx === elegiveis.length - 1) y += cardH + 3
    })
    y += 3
  }

  // ── SEÇÃO 3.5 — Comparação de Cenários ────────────────────────────────────
  // Agrupa `elegiveis` por banco+programa; para grupos com 2+ cenários (hoje só a Caixa,
  // via SAC/PRICE), desenha um bloco dedicado com um card por cenário. Genérico de
  // propósito: não sabe nada sobre "Caixa" nem "SAC/PRICE", só sobre "grupos banco+
  // programa com múltiplos resultados elegíveis" — se outro banco ganhar um segundo
  // cenário no futuro, esta seção passa a desenhá-lo também, sem alteração de código.
  {
    const grupos = new Map<string, ResultadoBanco[]>()
    for (const r of elegiveis) {
      const chave = `${r.bancoId}::${r.programa}`
      grupos.set(chave, [...(grupos.get(chave) ?? []), r])
    }
    const gruposComparativos = Array.from(grupos.values()).filter((rs) => rs.length >= 2)

    for (const cenarios of gruposComparativos) {
      const cardH = 44
      if (y + 12 + cardH > pageH - mBot - 10) { doc.addPage(); y = mTop }
      y = drawSectionTitle(doc, `${cenarios[0].bancoNome} — Comparação de Cenários (${cenarios[0].programa})`, y, mL, usableW)

      const colW = usableW / cenarios.length
      cenarios.forEach((r, idx) => {
        const x     = mL + idx * colW
        const cardW = colW - (idx < cenarios.length - 1 ? 1 : 0)

        const [br, bg, bb] = hexToRgb(r.corBanco?.startsWith('#') ? r.corBanco : COR_VERDE)
        doc.setFillColor(br, bg, bb)
        doc.rect(x, y, cardW, 8, 'F')
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
        doc.text(pdf(r.tipoAmortizacao), x + 3, y + 5.5)

        setFill(doc, '#F8FAF8'); setDraw(doc, '#E0E0DC')
        doc.setLineWidth(0.2)
        doc.rect(x, y + 8, cardW, cardH - 8, 'FD')

        const rendaMinima = Math.ceil(r.primeiraParcela / 0.30)
        // Entrada específica DESTE cenário (SAC/PRICE de UM programa), não a entrada
        // genérica de `resultado.input` — mesmo motivo do fix em "Dados da Simulação"
        // acima: desde que cada cenário passou a recalcular sua própria entrada
        // (cota/comprometimento podem diferir entre SAC e PRICE, e entre programas),
        // `resultado.input.valorEntrada` deixou de bater com o financiado exibido aqui.
        const entradaCenario = resultado.input.valorImovel - r.valorFinanciado
        const metricas: [string, string][] = [
          ['Prazo',           `${r.parcelas} meses`],
          ['Taxa a.a.',       `${(r.taxaAnual * 100).toFixed(2)}%`],
          ['Valor do Imóvel', BRL.format(resultado.input.valorImovel)],
          ['Entrada',         BRL.format(entradaCenario)],
          ['Valor Financiado', BRL.format(r.valorFinanciado)],
          ['1ª Parcela',      BRL.format(r.primeiraParcela)],
          ['Renda mínima',    BRL.format(rendaMinima)],
          ['CET',             'N/A'],
        ]

        const metC1 = metricas.slice(0, 4)
        const metC2 = metricas.slice(4)
        const metW  = cardW / 2 - 3

        metC1.forEach(([label, val], mi) => {
          const my = y + 13 + mi * 5.5
          doc.setFontSize(6);   doc.setFont('helvetica', 'normal'); setTxt(doc, '#888888')
          doc.text(pdf(label), x + 3, my)
          doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');   setTxt(doc, COR_VERDE)
          doc.text(pdf(val), x + metW - 2, my, { align: 'right' })
        })
        metC2.forEach(([label, val], mi) => {
          const my = y + 13 + mi * 5.5
          const mx = x + cardW / 2 + 2
          doc.setFontSize(6);   doc.setFont('helvetica', 'normal'); setTxt(doc, '#888888')
          doc.text(pdf(label), mx, my)
          doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');   setTxt(doc, COR_VERDE)
          doc.text(pdf(val), x + cardW - 3, my, { align: 'right' })
        })

        if (r.avisoRenda) {
          doc.setFontSize(5.5); doc.setFont('helvetica', 'bold'); setTxt(doc, '#B8860B')
          doc.text(pdf('⚠ comprometimento de renda acima de 30%'), x + 3, y + cardH - 2)
        }

        if (idx < cenarios.length - 1) {
          setDraw(doc, '#DDDDDD'); doc.setLineWidth(0.2)
          doc.line(x + cardW, y + 8, x + cardW, y + cardH)
        }
      })
      y += cardH + 4
    }
  }

  // ── SEÇÃO 4 — Análise preditiva ───────────────────────────────────────────
  if (y + 50 > pageH - mBot - 10) { doc.addPage(); y = mTop }
  y = drawSectionTitle(doc, 'Analise de Viabilidade Preditiva', y, mL, usableW)

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
  doc.text('Indice de Viabilidade', mL + boxW / 2, y + 7, { align: 'center' })
  doc.setFontSize(22);  doc.setFont('helvetica', 'bold'); setTxt(doc, scoreHex)
  doc.text(`${a.score}`, mL + boxW / 2, y + 19, { align: 'center' })
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); setTxt(doc, scoreHex)
  doc.text(SCORE_LABEL[a.classificacao] ?? a.classificacao, mL + boxW / 2, y + 26, { align: 'center' })

  const rightX = mL + boxW + 6
  const summaryItems: [string, string][] = [
    ['Comprometimento de Renda',     a.comprometimentoRenda == null ? 'N/D (renda não informada)' : `${a.comprometimentoRenda.toFixed(1)}%`],
    ['Máx. Financiável (30% renda)', a.maxFinanciavel == null ? 'N/D (renda não informada)' : BRL.format(a.maxFinanciavel)],
    ['Renda Mínima Necessária',      BRL.format(a.rendaMinimaNecessaria)],
  ]
  summaryItems.forEach(([label, val], i) => {
    const iy = y + 2 + i * 9
    doc.setFontSize(7);   doc.setFont('helvetica', 'normal'); setTxt(doc, '#888888')
    doc.text(label, rightX, iy + 4)
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');   setTxt(doc, COR_VERDE)
    doc.text(val, rightX, iy + 9)
  })
  y += boxH + 4

  if (a.fatores.length > 0) {
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
    doc.text('Fatores Identificados:', mL, y + 4)
    y += 7
    a.fatores.forEach((f) => {
      if (y + 6 > pageH - mBot - 20) { doc.addPage(); y = mTop }
      const fHex = f.impacto === 'positivo' ? '#1E7B34' : f.impacto === 'critico' ? '#CC0000' : '#B8860B'
      const icon = f.impacto === 'positivo' ? '+' : f.impacto === 'critico' ? '!!' : '-'
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); setTxt(doc, fHex)
      doc.text(icon, mL + 2, y + 4)
      doc.setFont('helvetica', 'normal'); setTxt(doc, '#444444')
      doc.text(pdf(f.descricao), mL + 8, y + 4)
      y += 5.5
    })
    y += 3
  }

  // ── SEÇÃO 5 — Bancos não elegíveis ────────────────────────────────────────
  if (inaplicaveis.length > 0) {
    if (y + 20 > pageH - mBot) { doc.addPage(); y = mTop }
    y = drawSectionTitle(doc, 'Bancos Não Elegíveis', y, mL, usableW)
    inaplicaveis.forEach((r, i) => {
      if (y + 6 > pageH - mBot - 10) { doc.addPage(); y = mTop }
      if (i % 2 === 0) { setFill(doc, '#F8F8F5'); doc.rect(mL, y, usableW, 6, 'F') }
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');   setTxt(doc, '#555555')
      doc.text(abrevBanco(r.bancoId, r.bancoNome), mL + 2, y + 4.5)
      doc.setFont('helvetica', 'normal'); setTxt(doc, '#888888')
      doc.text(r.motivoInelegivel ?? 'Não elegível', mL + 32, y + 4.5)
      y += 6
    })
    y += 4
  }

  // ── RODAPÉ ────────────────────────────────────────────────────────────────
  if (y + 30 > pageH - mBot) { doc.addPage(); y = mTop } else { y += 4 }
  setDraw(doc, COR_DOURADO); doc.setLineWidth(0.4)
  doc.line(mL, y, pageW - mR, y)
  y += 5

  // Assinatura (esquerda)
  const now = new Date()
  const dataGer = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
  const horaGer = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); setTxt(doc, '#555555')
  doc.text('Gerado automaticamente pelo Motor de Credito Fonti', mL, y + 4)
  doc.setFontSize(6.5); setTxt(doc, '#777777')
  doc.text(`${dataGer} as ${horaGer}`, mL, y + 9)
  y += 22

  // Disclaimer institucional
  const footerText = 'Esta simulacao possui carater exclusivamente informativo e nao representa aprovacao de credito. A contratacao esta sujeita a analise documental e as politicas vigentes de cada instituicao financeira. Os valores apresentados sao estimativas baseadas nas condicoes vigentes na data de geracao.'
  doc.setFontSize(6.5); doc.setFont('helvetica', 'italic'); setTxt(doc, '#666666')
  const wrapped = doc.splitTextToSize(footerText, usableW)
  doc.text(wrapped, mL, y, { lineHeightFactor: 1.4 })

  return Buffer.from(doc.output('arraybuffer') as ArrayBuffer)
}

// ── PDF de Capacidade Máxima pela Renda ──────────────────────────────────────
// Estrutura de dados diferente do ResultadoCompleto — layout simplificado.

export interface PDFCapacidadeMaximaInput {
  rendaMensal:      number
  idadeAnos:        number
  tipoAmortizacao:  'SAC' | 'PRICE'
  prazoLabel:       string
  nomeCliente?:     string | null
  cpfCliente?:      string | null
  valorImovelRef?:  number | null
  cidadeImovel?:    string | null
  tipoImovel?:      'novo' | 'usado' | null
  dataSimulacao:    string
  tipoVinculo?:     'AVULSA_SEM_CPF'
  bancos: Array<{
    bancoNome:      string
    maxFinanciavel: number
    entradaMinima:  number | null
    prazoUsado:     number
    taxaAnual:      number
  }>
}

export async function gerarPDFCapacidadeMaximaBuffer(
  input: PDFCapacidadeMaximaInput,
  options: PDFBufferOptions = {},
): Promise<Buffer> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageW  = doc.internal.pageSize.getWidth()
  const pageH  = doc.internal.pageSize.getHeight()
  const mL = 12, mR = 12, mTop = 10, mBot = 12
  const usableW = pageW - mL - mR

  let y = mTop

  // ── CABEÇALHO ─────────────────────────────────────────────────────────────
  const HEADER_H = 24
  setFill(doc, COR_VERDE)
  doc.rect(mL, y, usableW, HEADER_H, 'F')
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text('FONTI', mL + 4, y + 9)
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setTxt(doc, '#CCCCCC')
  doc.text('Sistema Operacional de Credito', mL + 4, y + 15)
  doc.setFontSize(6.5); doc.setFont('helvetica', 'italic'); setTxt(doc, COR_DOURADO)
  doc.text('by Fontinhas Assessoria', mL + 4, y + 21)
  doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text('Capacidade Maxima de Financiamento', pageW - mR - 2, y + HEADER_H / 2 + 3, { align: 'right' })
  y += HEADER_H + 4

  // ── LINHA DE IDENTIFICAÇÃO ────────────────────────────────────────────────
  const rowH = 9
  setFill(doc, COR_VERDE)
  doc.rect(mL, y, usableW, rowH, 'F')
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)

  const d = new Date(input.dataSimulacao)
  const dataHoje = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  const horaHoje = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

  const identificacao = input.tipoVinculo === 'AVULSA_SEM_CPF'
    ? 'Simulacao Avulsa (sem CPF)'
    : [input.nomeCliente, input.cpfCliente ? `CPF: ${input.cpfCliente}` : null].filter(Boolean).join('   |   ')
  const infoText = [identificacao, `${dataHoje} ${horaHoje}`, options.responsavelNome].filter(Boolean).join('   |   ')
  doc.text(infoText, pageW / 2, y + rowH / 2 + 2.5, { align: 'center' })
  y += rowH + 4

  // ── PARÂMETROS ───────────────────────────────────────────────────────────
  y = drawSectionTitle(doc, 'Parametros da Simulacao', y, mL, usableW)

  const params: [string, string][] = [
    ['Renda Mensal',    BRL.format(input.rendaMensal)],
    ['Amortizacao',     input.tipoAmortizacao],
    ['Prazo',           input.prazoLabel],
    ['Idade estimada',  `${input.idadeAnos} anos`],
  ]
  if (input.valorImovelRef)  params.push(['Imovel de referencia', BRL.format(input.valorImovelRef)])
  if (input.cidadeImovel)    params.push(['Cidade/UF',            input.cidadeImovel])
  if (input.tipoImovel)      params.push(['Tipo Imovel',          input.tipoImovel === 'novo' ? 'Novo/Lancamento' : 'Usado'])
  params.push(['Modo',       'Capacidade Maxima pela Renda'])

  const colW = usableW / 3
  let px = mL
  params.forEach(([label, val], i) => {
    if (i > 0 && i % 3 === 0) { px = mL; y += 13 }
    if (i % 3 === 0 && i > 0 && i % 3 === 0) { /* already reset */ }
    const cx = mL + (i % 3) * colW
    if (i % 3 === 0 && i > 0) y += 0  // handled above
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); setTxt(doc, '#888888')
    doc.text(pdf(label), cx + 2, y + 4)
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); setTxt(doc, '#222222')
    doc.text(pdf(val),   cx + 2, y + 9.5)
    px += colW
  })
  y += 16

  // ── TABELA DE BANCOS ──────────────────────────────────────────────────────
  y = drawSectionTitle(doc, 'Financiamento Maximo Suportado pela Renda', y, mL, usableW)

  // Cabeçalho da tabela
  const cols = [
    { label: 'Banco',           w: usableW * 0.25 },
    { label: 'Max. Financiavel',w: usableW * 0.25 },
    { label: 'Entrada Minima',  w: usableW * 0.20 },
    { label: 'Prazo',           w: usableW * 0.15 },
    { label: 'Taxa a.a.',       w: usableW * 0.15 },
  ]
  setFill(doc, '#E8F0E8')
  doc.rect(mL, y, usableW, 7, 'F')
  let cx = mL
  cols.forEach((col) => {
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
    doc.text(col.label, cx + col.w / 2, y + 4.5, { align: 'center' })
    cx += col.w
  })
  y += 7

  const elegiveisMap = input.bancos.filter((b) => b.maxFinanciavel > 0)
  elegiveisMap.forEach((b, i) => {
    if (y + 8 > pageH - mBot - 15) { doc.addPage(); y = mTop }
    if (i % 2 === 0) { setFill(doc, '#F8FAF8'); doc.rect(mL, y, usableW, 8, 'F') }
    let bx = mL
    const row = [
      pdf(b.bancoNome),
      BRL.format(b.maxFinanciavel),
      b.entradaMinima !== null ? BRL.format(b.entradaMinima) : '—',
      `${b.prazoUsado} meses`,
      `${(b.taxaAnual * 100).toFixed(2).replace('.', ',')}%`,
    ]
    row.forEach((val, ci) => {
      doc.setFontSize(7.5)
      doc.setFont('helvetica', ci === 0 ? 'bold' : 'normal')
      setTxt(doc, ci === 0 ? '#222222' : '#444444')
      doc.text(val, bx + cols[ci].w / 2, y + 5, { align: 'center' })
      bx += cols[ci].w
    })
    y += 8
  })

  if (elegiveisMap.length === 0) {
    doc.setFontSize(8); doc.setFont('helvetica', 'italic'); setTxt(doc, '#888888')
    doc.text('Renda insuficiente para todos os bancos analisados.', mL + 4, y + 6)
    y += 12
  } else {
    y += 4
    // Nota sobre 1ª prestação
    doc.setFontSize(6.5); doc.setFont('helvetica', 'italic'); setTxt(doc, '#777777')
    doc.text(pdf('1a prestacao nao calculada neste modo — estimativa baseada em 30% de comprometimento de renda.'), mL, y)
    y += 10
  }

  // ── RODAPÉ ────────────────────────────────────────────────────────────────
  if (y + 30 > pageH - mBot) { doc.addPage(); y = mTop } else { y += 4 }
  setDraw(doc, COR_DOURADO); doc.setLineWidth(0.4)
  doc.line(mL, y, pageW - mR, y)
  y += 5

  const now2 = new Date()
  const dg = `${String(now2.getDate()).padStart(2, '0')}/${String(now2.getMonth() + 1).padStart(2, '0')}/${now2.getFullYear()}`
  const hg = `${String(now2.getHours()).padStart(2, '0')}:${String(now2.getMinutes()).padStart(2, '0')}`
  doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); setTxt(doc, '#555555')
  doc.text('Gerado automaticamente pelo Motor de Credito Fonti', mL, y + 4)
  doc.setFontSize(6.5); setTxt(doc, '#777777')
  doc.text(`${dg} as ${hg}`, mL, y + 9)
  y += 22

  const footerText = 'Simulacao preliminar sujeita a analise de credito, regras do banco e validacao documental. Estimativa de capacidade calculada com base em 30% de comprometimento de renda (SAC). Valores, taxas e prazos estao sujeitos a alteracao conforme politicas vigentes de cada instituicao.'
  doc.setFontSize(6.5); doc.setFont('helvetica', 'italic'); setTxt(doc, '#666666')
  const wrapped2 = doc.splitTextToSize(footerText, usableW)
  doc.text(wrapped2, mL, y, { lineHeightFactor: 1.4 })

  return Buffer.from(doc.output('arraybuffer') as ArrayBuffer)
}

// ── PDF Comparativo de Prazos ────────────────────────────────────────────────
// Gerado quando o operador pede mais de um prazo na mesma mensagem (ex.: "5 anos,
// 10 anos, 15 anos"). Uma seção por banco elegível, com uma tabela de prazos dentro.

export interface PDFComparacaoPrazosInput {
  clienteNome?:     string | null
  cpfCliente?:      string | null
  valorImovel:      number | null
  valorFinanciado:  number | null
  tipoAmortizacao:  'SAC' | 'PRICE'
  dataSimulacao:    string
  itens: Array<{
    prazoMeses: number
    bancos: Array<{ bancoNome: string; parcela: number; taxaAnual: number; rendaMinima: number }>
  }>
}

export async function gerarPDFComparacaoPrazosBuffer(
  input: PDFComparacaoPrazosInput,
  options: PDFBufferOptions = {},
): Promise<Buffer> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageW  = doc.internal.pageSize.getWidth()
  const pageH  = doc.internal.pageSize.getHeight()
  const mL = 12, mR = 12, mTop = 10, mBot = 12
  const usableW = pageW - mL - mR

  let y = mTop

  // ── CABEÇALHO ─────────────────────────────────────────────────────────────
  const HEADER_H = 24
  setFill(doc, COR_VERDE)
  doc.rect(mL, y, usableW, HEADER_H, 'F')
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text('FONTI', mL + 4, y + 9)
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setTxt(doc, '#CCCCCC')
  doc.text('Sistema Operacional de Credito', mL + 4, y + 15)
  doc.setFontSize(6.5); doc.setFont('helvetica', 'italic'); setTxt(doc, COR_DOURADO)
  doc.text('by Fontinhas Assessoria', mL + 4, y + 21)
  doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text('Simulacao Comparativa de Prazos', pageW - mR - 2, y + HEADER_H / 2 + 3, { align: 'right' })
  y += HEADER_H + 4

  // ── LINHA DE IDENTIFICAÇÃO ────────────────────────────────────────────────
  const rowH = 9
  setFill(doc, COR_VERDE)
  doc.rect(mL, y, usableW, rowH, 'F')
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)

  const d = new Date(input.dataSimulacao)
  const dataHoje = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  const horaHoje = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

  const identificacao = [input.clienteNome, input.cpfCliente ? `CPF: ${input.cpfCliente}` : null]
    .filter(Boolean).join('   |   ') || 'Cliente nao identificado'
  const infoText = [identificacao, `${dataHoje} ${horaHoje}`, options.responsavelNome].filter(Boolean).join('   |   ')
  doc.text(infoText, pageW / 2, y + rowH / 2 + 2.5, { align: 'center' })
  y += rowH + 4

  // ── DADOS DA SIMULAÇÃO ────────────────────────────────────────────────────
  y = drawSectionTitle(doc, 'Dados da Simulacao', y, mL, usableW)

  const dadosItems: [string, string][] = [
    ['Valor do Imovel',     input.valorImovel != null ? BRL.format(input.valorImovel) : '—'],
    ['Valor Financiado',    input.valorFinanciado != null ? BRL.format(input.valorFinanciado) : '—'],
    ['Amortizacao',         input.tipoAmortizacao],
  ]
  const col3W = usableW / 3
  dadosItems.forEach(([label, val], i) => {
    const x = mL + i * col3W
    setFill(doc, i % 2 === 0 ? '#F5F5F0' : '#FAFAF8')
    doc.rect(x, y, col3W, 14, 'F')
    setDraw(doc, '#DDDDDD'); doc.setLineWidth(0.3)
    doc.rect(x, y, col3W, 14, 'S')
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setTxt(doc, '#777777')
    doc.text(pdf(label), x + col3W / 2, y + 5, { align: 'center' })
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
    doc.text(pdf(val), x + col3W / 2, y + 11, { align: 'center' })
  })
  y += 14 + 5

  // ── UMA SEÇÃO POR BANCO ───────────────────────────────────────────────────
  const bancosNomes = Array.from(new Set(input.itens.flatMap((item) => item.bancos.map((b) => b.bancoNome))))

  const cols = [
    { label: 'Prazo',        w: usableW * 0.25 },
    { label: 'Parcela',      w: usableW * 0.30 },
    { label: 'Taxa a.a.',    w: usableW * 0.20 },
    { label: 'Renda Minima', w: usableW * 0.25 },
  ]

  bancosNomes.forEach((bancoNome) => {
    const linhasBanco = input.itens
      .map((item) => ({ prazoMeses: item.prazoMeses, banco: item.bancos.find((b) => b.bancoNome === bancoNome) }))
      .filter((r): r is { prazoMeses: number; banco: NonNullable<typeof r.banco> } => !!r.banco)

    if (linhasBanco.length === 0) return

    const secaoH = 8 + 7 + linhasBanco.length * 8
    if (y + secaoH > pageH - mBot - 10) { doc.addPage(); y = mTop }

    y = drawSectionTitle(doc, pdf(bancoNome), y, mL, usableW)

    setFill(doc, '#E8F0E8')
    doc.rect(mL, y, usableW, 7, 'F')
    let cx = mL
    cols.forEach((col) => {
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); setTxt(doc, COR_VERDE)
      doc.text(col.label, cx + col.w / 2, y + 4.5, { align: 'center' })
      cx += col.w
    })
    y += 7

    linhasBanco.forEach(({ prazoMeses, banco }, i) => {
      if (y + 8 > pageH - mBot - 15) { doc.addPage(); y = mTop }
      if (i % 2 === 0) { setFill(doc, '#F8FAF8'); doc.rect(mL, y, usableW, 8, 'F') }
      let bx = mL
      const row = [
        `${prazoMeses} meses`,
        BRL.format(banco.parcela),
        `${(banco.taxaAnual * 100).toFixed(2).replace('.', ',')}%`,
        BRL.format(banco.rendaMinima),
      ]
      row.forEach((val, ci) => {
        doc.setFontSize(7.5)
        doc.setFont('helvetica', ci === 0 ? 'bold' : 'normal')
        setTxt(doc, ci === 0 ? '#222222' : '#444444')
        doc.text(val, bx + cols[ci].w / 2, y + 5, { align: 'center' })
        bx += cols[ci].w
      })
      y += 8
    })
    y += 5
  })

  if (bancosNomes.length === 0) {
    doc.setFontSize(8); doc.setFont('helvetica', 'italic'); setTxt(doc, '#888888')
    doc.text('Nenhum banco elegivel para os prazos informados.', mL + 2, y + 6)
    y += 12
  }

  // ── RODAPÉ ────────────────────────────────────────────────────────────────
  if (y + 30 > pageH - mBot) { doc.addPage(); y = mTop } else { y += 4 }
  setDraw(doc, COR_DOURADO); doc.setLineWidth(0.4)
  doc.line(mL, y, pageW - mR, y)
  y += 5

  const now3 = new Date()
  const dg3 = `${String(now3.getDate()).padStart(2, '0')}/${String(now3.getMonth() + 1).padStart(2, '0')}/${now3.getFullYear()}`
  const hg3 = `${String(now3.getHours()).padStart(2, '0')}:${String(now3.getMinutes()).padStart(2, '0')}`
  doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); setTxt(doc, '#555555')
  doc.text('Gerado automaticamente pelo Motor de Credito Fonti', mL, y + 4)
  doc.setFontSize(6.5); setTxt(doc, '#777777')
  doc.text(`${dg3} as ${hg3}`, mL, y + 9)
  y += 22

  const footerText = 'Esta simulacao possui carater exclusivamente informativo e nao representa aprovacao de credito. Renda minima estimada com base em 30% de comprometimento de renda (SAC). Taxas, parcelas e prazos estao sujeitos a alteracao conforme analise documental e politicas vigentes de cada instituicao financeira.'
  doc.setFontSize(6.5); doc.setFont('helvetica', 'italic'); setTxt(doc, '#666666')
  const wrapped3 = doc.splitTextToSize(footerText, usableW)
  doc.text(wrapped3, mL, y, { lineHeightFactor: 1.4 })

  return Buffer.from(doc.output('arraybuffer') as ArrayBuffer)
}
