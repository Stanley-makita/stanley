import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { valorPorExtenso } from '@/lib/contratos/substituirVariaveis'
import { LOGO_RECIBO } from './logoRecibo'

// Recibo de um lançamento do Financeiro do negócio com situação 'recebido' (cliente pagou
// a empresa). Quem pagou = nome/CPF salvos no lançamento ou, vazio, o proponente principal.

export interface EmpresaRecibo {
  nome: string
  razao_social: string | null
  cnpj: string | null
  telefone: string | null
  email: string | null
  endereco_rua: string | null
  endereco_numero: string | null
  endereco_complemento: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_uf: string | null
  endereco_cep: string | null
}

export interface DadosRecibo {
  numero: number
  valor: number
  descricao: string
  recebidoEm: Date
  pagadorNome: string
  pagadorCpf: string | null
  processoNumero: string | null
  empresa: EmpresaRecibo
  /** data URL (PNG/JPEG) da logo; padrão = logo da Fontinhas (LOGO_RECIBO). null = sem logo. */
  logoDataUrl?: string | null
}

const BRL_FMT = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
// Intl usa espaço não separável depois do "R$" — troca por espaço comum (texto e PDF).
const BRL = { format: (v: number) => BRL_FMT.format(v).replace(/ /g, ' ') }

export function formatarCpfRecibo(cpf: string | null | undefined): string | null {
  const d = (cpf ?? '').replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  return cpf?.trim() || null
}

export function numeroRecibo(n: number): string {
  return String(n).padStart(4, '0')
}

export function enderecoEmpresa(e: EmpresaRecibo): string | null {
  const rua = [e.endereco_rua, e.endereco_numero].filter(Boolean).join(', ')
  const partes = [
    rua ? [rua, e.endereco_complemento].filter(Boolean).join(' - ') : null,
    e.endereco_bairro,
    e.endereco_cidade && e.endereco_uf ? `${e.endereco_cidade}/${e.endereco_uf}` : e.endereco_cidade,
    e.endereco_cep ? `CEP ${e.endereco_cep}` : null,
  ].filter(Boolean)
  return partes.length ? partes.join(' · ') : null
}

/** Frase principal do recibo — separada do PDF para ser testável. */
export function textoRecibo(d: DadosRecibo): string {
  const cpf = formatarCpfRecibo(d.pagadorCpf)
  const quem = cpf ? `${d.pagadorNome}, CPF ${cpf}` : d.pagadorNome
  return `Recebemos de ${quem}, a quantia de ${BRL.format(d.valor)} (${valorPorExtenso(d.valor)}), referente a ${d.descricao}.`
}

/** "Maringá, 29 de outubro de 2026" (sem cidade cadastrada, só a data). */
export function localEData(d: DadosRecibo): string {
  const data = format(d.recebidoEm, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
  return d.empresa.endereco_cidade ? `${d.empresa.endereco_cidade}, ${data}` : data
}

// Helvetica embutido no jsPDF só tem WinAnsi.
function pdf(text: string): string {
  return text.replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...')
}

const VERDE: [number, number, number] = [37, 59, 41]
const DOURADO: [number, number, number] = [194, 170, 106]
const CINZA: [number, number, number] = [110, 110, 110]

export async function gerarReciboPdf(d: DadosRecibo): Promise<Buffer> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const mL = 20
  const mR = W - 20
  let y = 20

  // Cabeçalho: logo à esquerda, dados da empresa à direita
  let logoAltura = 0
  const logo = d.logoDataUrl === undefined ? LOGO_RECIBO : d.logoDataUrl
  if (logo) {
    try {
      const props = doc.getImageProperties(logo)
      const proporcao = props.width / props.height
      let h = 18
      let w = proporcao * h
      if (w > 60) { w = 60; h = w / proporcao }
      doc.addImage(logo, props.fileType, mL, y, w, h)
      logoAltura = h
    } catch {
      logoAltura = 0
    }
  }

  const e = d.empresa
  const linhasEmpresa = [
    e.razao_social || e.nome,
    e.cnpj ? `CNPJ ${e.cnpj}` : null,
    enderecoEmpresa(e),
    [e.telefone, e.email].filter(Boolean).join(' · ') || null,
  ].filter((l): l is string => !!l)

  doc.setTextColor(...VERDE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(pdf(linhasEmpresa[0]), mR, y + 4, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...CINZA)
  linhasEmpresa.slice(1).forEach((l, i) => doc.text(pdf(l), mR, y + 9 + i * 4.2, { align: 'right', maxWidth: 110 }))

  y += Math.max(logoAltura, 9 + (linhasEmpresa.length - 1) * 4.2) + 6
  doc.setDrawColor(...DOURADO)
  doc.setLineWidth(0.6)
  doc.line(mL, y, mR, y)
  y += 14

  // Título + valor
  doc.setTextColor(...VERDE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('RECIBO', mL, y)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...CINZA)
  doc.text(`Nº ${numeroRecibo(d.numero)}`, mL, y + 6)

  const valorTxt = BRL.format(d.valor)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  const vw = doc.getTextWidth(valorTxt) + 12
  doc.setFillColor(231, 224, 196)
  doc.roundedRect(mR - vw, y - 9, vw, 14, 2, 2, 'F')
  doc.setTextColor(...VERDE)
  doc.text(valorTxt, mR - vw / 2, y, { align: 'center' })
  y += 22

  // Corpo
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(40, 40, 40)
  const corpo = doc.splitTextToSize(pdf(textoRecibo(d)), mR - mL)
  doc.text(corpo, mL, y, { lineHeightFactor: 1.6 })
  y += corpo.length * 12 * 0.3528 * 1.6 + 6

  if (d.processoNumero) {
    doc.setFontSize(9)
    doc.setTextColor(...CINZA)
    doc.text(pdf(`Negócio ${d.processoNumero}`), mL, y)
    y += 6
  }

  y += 8
  doc.setFontSize(11)
  doc.setTextColor(40, 40, 40)
  doc.text(pdf(localEData(d)), mR, y, { align: 'right' })

  // No lugar da assinatura (o recibo não é assinado à mão): só nome da empresa + CNPJ.
  y += 24
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...VERDE)
  doc.text(pdf(e.razao_social || e.nome), W / 2, y, { align: 'center' })
  if (e.cnpj) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...CINZA)
    doc.text(`CNPJ ${e.cnpj}`, W / 2, y + 5.5, { align: 'center' })
  }

  return Buffer.from(doc.output('arraybuffer'))
}
