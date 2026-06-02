export type BotEstado = 'INICIO' | 'COLETANDO_DADOS' | 'CONFIRMANDO' | 'CONCLUIDO'
export type CampoAguardado = 'produto' | 'nome' | 'valor' | 'renda' | 'confirmacao'

export interface BotDados {
  produto?: string
  nome?: string
  valor_imovel?: number
  renda_mensal?: number
  aguardando?: CampoAguardado
  tentativas?: number   // contagem de extrações falhas consecutivas no mesmo campo
}

export interface TransicaoEstado {
  novoEstado: BotEstado
  novosDados: BotDados
  criarLead: boolean
  forcarEncerramento?: boolean  // true quando tentativas >= 3 no mesmo campo
}

const MAX_TENTATIVAS = 3

const AFIRMACOES = /\b(sim|s|ok|certo|correto|isso|pode|claro|perfeito|exato|confirmo|confirmado|tá|ta|tudo\s+certo|isso\s+mesmo|pode\s+ser)\b/i

export function extrairNumero(texto: string): number | null {
  const semMoeda = texto.replace(/R\$\s*/gi, '').trim()

  // "300 mil" | "300mil" → 300000
  const milMatch = semMoeda.match(/(\d[\d.,]*)\s*mil\b/i)
  if (milMatch) {
    const base = parseFloat(milMatch[1].replace(/\./g, '').replace(',', '.'))
    return isNaN(base) ? null : base * 1000
  }

  // "30m" | "30k" | "5M" → abreviações comuns no Brasil
  const abrevMatch = semMoeda.match(/(\d[\d.,]*)\s*[mk]\b/i)
  if (abrevMatch) {
    const base = parseFloat(abrevMatch[1].replace(/\./g, '').replace(',', '.'))
    return isNaN(base) ? null : base * 1000
  }

  // "300.000" | "300000" | "300.000,00"
  const numMatch = semMoeda.match(/\d[\d.,]*/)
  if (!numMatch) return null
  const raw = numMatch[0]
  // vírgula presente → separador decimal brasileiro (ex: "5.000,00")
  const num = raw.includes(',')
    ? parseFloat(raw.replace(/\./g, '').replace(',', '.'))
    : parseFloat(raw.replace(/\./g, ''))
  return isNaN(num) || num < 100 ? null : num  // ignora números pequenos (ex: "olá, tudo bem?")
}

export function extrairProduto(texto: string): string | null {
  const t = texto.toLowerCase()
  // CGI tem prioridade — cliente que tem imóvel e quer crédito
  if (/\bcgi\b|garantia\s+de\s+im[oó]v|cr[eé]dito\s+(com|usando)\s+im[oó]v|im[oó]vel\s+como\s+garantia|empr[eé]stimo\s+(com\s+)?im[oó]v/.test(t)) return 'CGI'
  if (/financ|compr[ao]\s+(um\s+)?im[oó]v|casa\s+pr[oó]pria|apartamento\s+pr[oó]prio/.test(t)) return 'Financiamento Imobiliário'
  if (/cons[oó]rcio/.test(t)) return 'Consórcio'
  if (/contrat/.test(t)) return 'Contrato'
  return null
}

export function processarEstado(
  estadoAtual: BotEstado,
  dadosAtuais: BotDados,
  mensagem: string,
): TransicaoEstado {
  const dados: BotDados = { ...dadosAtuais }

  // ─── INICIO ────────────────────────────────────────────────────────────────
  if (estadoAtual === 'INICIO') {
    const produto = extrairProduto(mensagem)
    dados.produto = produto ?? undefined
    dados.aguardando = produto ? 'nome' : 'produto'
    return { novoEstado: 'COLETANDO_DADOS', novosDados: dados, criarLead: false }
  }

  // ─── COLETANDO_DADOS ───────────────────────────────────────────────────────
  if (estadoAtual === 'COLETANDO_DADOS') {
    const ag = dados.aguardando
    let extraiu = false

    if (ag === 'produto') {
      const produto = extrairProduto(mensagem)
      if (produto) {
        dados.produto = produto
        dados.aguardando = 'nome'
        extraiu = true
      }
    } else if (ag === 'nome') {
      const nome = mensagem.trim()
      if (nome.length >= 2) {
        dados.nome = nome
        dados.aguardando = 'valor'
        extraiu = true
      }
    } else if (ag === 'valor') {
      const num = extrairNumero(mensagem)
      if (num !== null) {
        dados.valor_imovel = num
        dados.aguardando = 'renda'
        extraiu = true
      }
    } else if (ag === 'renda') {
      const num = extrairNumero(mensagem)
      if (num !== null) {
        dados.renda_mensal = num
        dados.tentativas = 0
        if (dados.produto && dados.nome) {
          dados.aguardando = 'confirmacao'
          return { novoEstado: 'CONFIRMANDO', novosDados: dados, criarLead: false }
        }
        extraiu = true
      }
    }

    if (extraiu) {
      dados.tentativas = 0
    } else {
      dados.tentativas = (dados.tentativas ?? 0) + 1
      if (dados.tentativas >= MAX_TENTATIVAS) {
        return { novoEstado: 'COLETANDO_DADOS', novosDados: dados, criarLead: false, forcarEncerramento: true }
      }
    }

    return { novoEstado: 'COLETANDO_DADOS', novosDados: dados, criarLead: false }
  }

  // ─── CONFIRMANDO ───────────────────────────────────────────────────────────
  if (estadoAtual === 'CONFIRMANDO') {
    if (AFIRMACOES.test(mensagem)) {
      return { novoEstado: 'CONCLUIDO', novosDados: dados, criarLead: true }
    }
    // Cliente quer corrigir → mantém produto, recomeça coleta de nome/valor/renda
    dados.nome = undefined
    dados.valor_imovel = undefined
    dados.renda_mensal = undefined
    dados.aguardando = 'nome'
    return { novoEstado: 'COLETANDO_DADOS', novosDados: dados, criarLead: false }
  }

  // ─── CONCLUIDO → novo contato reinicia fluxo ───────────────────────────────
  return { novoEstado: 'INICIO', novosDados: {}, criarLead: false }
}
