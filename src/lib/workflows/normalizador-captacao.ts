/**
 * Normalizador de Captação — responsabilidade única: limpar, padronizar e derivar dados.
 *
 * Recebe o JSON bruto do Parser e devolve dados prontos para uso.
 * Não interpreta texto. Não valida dados mínimos. Não decide.
 *
 * Responsabilidades:
 * - Normalizar CPF, telefone, datas, valores monetários, nomes de bancos
 * - Calcular campos derivados (entrada ↔ financiado ↔ percentual)
 * - Mapear nomes de bancos para BancoId
 */

import type { DadosCaptacaoRaw } from './parser-captacao'
import type { BancoId, TipoOperacao } from '@/lib/simuladorFinanciamento/tipos'

export interface DadosCaptacaoNormalizados {
  nome:                  string | null
  cpf:                   string | null   // apenas dígitos, 11 chars
  telefone:              string | null   // apenas dígitos, com DDD
  data_nascimento:       string | null   // ISO YYYY-MM-DD
  cidade_imovel:         string | null
  tipo_imovel:           'novo' | 'usado' | null
  valor_imovel:          number | null
  valor_entrada:         number | null
  valor_financiado:      number | null
  renda_formal:          number | null
  renda_informal:        number | null
  bancos_ids:            BancoId[]       // mapeados para o motor de crédito
  solicitar_simulacao:   boolean
  // Campos do Workflow de Consulta Comercial (*simula)
  prazo_meses:           number | null   // 120–420; null = usar máximo do banco
  tipo_amortizacao:      'SAC' | 'PRICE' // padrão: 'SAC'
  correntista:           boolean         // true se relacionamento bancário informado
  produto:               string | null   // "SBPE", "MCMV", etc. (informativo)
  fgts_valor:            number | null   // valor FGTS disponível (informativo)
  usa_fgts:              boolean         // true se fgts_valor > 0 ou menção a FGTS
  todos_bancos:          boolean         // true se usuário pediu todos os bancos
  modo_calculo:          'VALOR_MAXIMO_PELA_RENDA' | null
  prazo_maximo:          boolean         // true se "prazo máximo" foi solicitado
  prazos_detectados:     number[] | null // todos os prazos numéricos válidos (120–420)
  produto_normalizado:   'AQUISICAO' | 'CGI_HOME_EQUITY' | 'CONSTRUCAO' | 'CONSORCIO' | 'PORTABILIDADE'
  usou_idade_aproximada: boolean
  conflito_valores:      boolean
  conflito_valores_descricao: string | null
  // Campos de modalidade de operação (novos)
  tipo_operacao:         TipoOperacao
  finalidade_efetiva:    'residencial' | 'comercial'
  valor_terreno:         number | null
  valor_obra:            number | null
  pedir_esclarecimento_operacao: boolean   // true quando a intenção é ambígua
  pergunta_esclarecimento:       string | null
}

// ── Classificador determinístico de tipo de operação ──────────────────────────
// Aplica regras de palavras-chave sobre o texto original normalizado.
// Tem precedência sobre qualquer valor vindo do LLM parser para evitar
// que o default 'aquisicao residencial' seja aplicado indevidamente.

interface ClassificacaoOperacao {
  tipoOperacao: TipoOperacao
  finalidade: 'residencial' | 'comercial'
  pedirEsclarecimento: boolean
  pergunta: string | null
}

function norm(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function classificarIntencaoOperacao(textoOriginal: string): ClassificacaoOperacao {
  const t = norm(textoOriginal)

  // 1. Comercial — prioridade máxima, nunca pode cair como residencial
  const termosComercial = [
    'comercial', 'sala comercial', 'loja', 'ponto comercial',
    'conjunto comercial', 'imovel misto', 'imovel comercial', 'misto',
  ]
  if (termosComercial.some((k) => t.includes(norm(k)))) {
    return { tipoOperacao: 'comercial', finalidade: 'comercial', pedirEsclarecimento: false, pergunta: null }
  }

  // 2. Terreno + construção (COMPRA do terreno + obra)
  const termosTerrCons = [
    'comprar terreno e construir', 'comprar lote e construir', 'comprar data e construir',
    'financiar terreno e obra', 'financiar lote e obra', 'financiar data e obra',
    'terreno mais construcao', 'terreno + construcao', 'lote mais construcao',
    'data mais construcao', 'lote + construcao', 'data + construcao',
  ]
  if (termosTerrCons.some((k) => t.includes(norm(k)))) {
    return { tipoOperacao: 'terreno_mais_construcao', finalidade: 'residencial', pedirEsclarecimento: false, pergunta: null }
  }

  // 3. Construção em terreno próprio (JÁ TEM o terreno)
  const temTerreno = [
    'tenho um terreno', 'tenho terreno', 'tenho lote', 'tenho uma data',
    'tenho data', 'tenho gleba', 'tenho greba', 'meu terreno', 'minha data',
    'meu lote', 'minha gleba',
  ].some((k) => t.includes(norm(k)))

  const querConstruir = [
    'quero construir', 'construir no meu', 'construir na minha',
    'construcao em terreno proprio', 'construcao no terreno', 'vou construir',
  ].some((k) => t.includes(norm(k)))
  // "obra" como palavra isolada também indica construção quando há terreno
  const temObra = /\bobra\b/.test(t)

  if (temTerreno && (querConstruir || temObra)) {
    return { tipoOperacao: 'construcao_terreno_proprio', finalidade: 'residencial', pedirEsclarecimento: false, pergunta: null }
  }

  // 4. Lote urbanizado (terreno/lote/data/gleba SEM intenção de construção)
  const termosLote = ['terreno', 'lote', 'gleba', 'greba', 'data de terra', 'lote urbano', 'lote urbanizado']
  // "data" como terreno: não confundir com data de nascimento
  const temDataTerreno = /\bdata\b(?!\s*(?:de\s+nasci|nasc|\/|\d{2}[\/\-\.]))/.test(t)
    && !t.includes('data de nascimento') && !t.includes('data nasc')
  const temLote = termosLote.some((k) => t.includes(norm(k))) || temDataTerreno
  // 'constru' captura 'construir', 'construção', 'construcao', 'construção' — necessário
  // porque 'quero construir' não contém o substring 'construc' (sem acento e sem ão).
  const temConstrucao = t.includes('construc') || t.includes('constru') || temObra

  if (temLote && !temConstrucao) {
    return { tipoOperacao: 'lote_urbanizado', finalidade: 'residencial', pedirEsclarecimento: false, pergunta: null }
  }

  // 5. Terreno + intenção de construção sem deixar claro se já tem ou vai comprar
  if (temLote && temConstrucao) {
    return {
      tipoOperacao: 'aquisicao', // placeholder — pede esclarecimento antes de simular
      finalidade: 'residencial',
      pedirEsclarecimento: true,
      pergunta: 'Você já possui o terreno/lote ou pretende comprar o terreno e depois construir? Isso define a modalidade de financiamento.',
    }
  }

  // 6. Construção mencionada sem contexto de terreno — pede esclarecimento
  if (temConstrucao) {
    return {
      tipoOperacao: 'aquisicao',
      finalidade: 'residencial',
      pedirEsclarecimento: true,
      pergunta: 'Você já tem o terreno onde vai construir ou quer financiar a compra do terreno + obra?',
    }
  }

  // 7. Default seguro: aquisição residencial
  return { tipoOperacao: 'aquisicao', finalidade: 'residencial', pedirEsclarecimento: false, pergunta: null }
}

// ── Mapa de aliases de bancos → BancoId ───────────────────────────────────────
const BANCO_ALIAS_MAP: Record<string, BancoId> = {
  caixa:           'caixa',
  'caixa economica':'caixa',
  'cef':            'caixa',
  itau:            'itau',
  'itaú':          'itau',
  bradesco:        'bradesco',
  santander:       'santander',
  inter:           'inter',
  'banco inter':   'inter',
  bb:              'bb',
  'banco do brasil':'bb',
  'brasil':        'bb',
  daycoval:        'daycoval',
}

function normalizarBanco(nome: string): BancoId | null {
  const chave = nome.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // remove acentos
    .trim()
  return BANCO_ALIAS_MAP[chave] ?? null
}

function normalizarCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null
  const digits = cpf.replace(/\D/g, '')
  return digits.length === 11 ? digits : null
}

function normalizarTelefone(tel: string | null | undefined): string | null {
  if (!tel) return null
  const digits = tel.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 13) return null
  // Remove DDI 55 se presente, mantém DDD + número
  const semDDI = digits.startsWith('55') && digits.length >= 12
    ? digits.slice(2) : digits
  return semDDI.length >= 10 ? semDDI : null
}

function normalizarData(data: string | null | undefined): string | null {
  if (!data) return null
  const s = data.trim()

  // YYYY-MM-DD (já no formato correto)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (ano com 4 dígitos)
  const dmy4 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/)
  if (dmy4) {
    const [, d, m, y] = dmy4
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // DD/MM/YY, DD-MM-YY, DD.MM.YY (ano com 2 dígitos — ex: 93 → 1993)
  const dmy2 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/)
  if (dmy2) {
    const [, d, m, yy] = dmy2
    const yyNum   = parseInt(yy, 10)
    const anoAtual = new Date().getFullYear()
    // Escolhe século com base em faixa etária plausível para financiamento (18–80 anos)
    const ano19    = 1900 + yyNum
    const idade19  = anoAtual - ano19
    const anoFinal = (idade19 >= 18 && idade19 <= 90) ? ano19 : (2000 + yyNum)
    return `${anoFinal}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Apenas "45 anos" — converte para data aproximada
  const anosMatch = s.match(/^(\d{1,3})\s*anos?$/i)
  if (anosMatch) {
    const anos = parseInt(anosMatch[1], 10)
    const anoNasc = new Date().getFullYear() - anos
    return `${anoNasc}-01-01`
  }

  return null
}

function normalizarProduto(produto: string | null | undefined): DadosCaptacaoNormalizados['produto_normalizado'] {
  if (!produto) return 'AQUISICAO'
  const p = produto.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim()
  if (p === 'cgi' || p.includes('home equity') || p.includes('homeequity') || p.includes('home_equity'))
    return 'CGI_HOME_EQUITY'
  if (p.includes('constru')) return 'CONSTRUCAO'
  if (p.includes('consorcio')) return 'CONSORCIO'
  if (p.includes('portab')) return 'PORTABILIDADE'
  return 'AQUISICAO'
}

/**
 * Ponto de entrada único para os dois comandos (*simula e *cria já simula).
 * Chama o parser (Claude Haiku) e em seguida o normalizador.
 * Qualquer melhoria no parser ou normalizer beneficia automaticamente ambos os fluxos.
 */
export async function normalizarPedidoSimulacao(texto: string): Promise<DadosCaptacaoNormalizados> {
  const { parsearTextoCaptacao } = await import('./parser-captacao')
  const [raw, classificacao] = await Promise.all([
    parsearTextoCaptacao(texto),
    Promise.resolve(classificarIntencaoOperacao(texto)),
  ])
  return normalizarDadosCaptacao(raw, classificacao)
}

export function normalizarDadosCaptacao(raw: DadosCaptacaoRaw, classificacao?: ClassificacaoOperacao): DadosCaptacaoNormalizados {
  const valorImovel        = raw.valor_imovel    ?? null
  const valorEntradaRaw    = raw.valor_entrada   ?? null
  const valorFinanciadoRaw = raw.valor_financiado ?? null
  const percentualFinRaw   = raw.percentual_financiado ?? null
  const percentualEntRaw   = raw.percentual_entrada    ?? null

  // Converte percentual_entrada → percentual_financiado quando o segundo não veio
  const percentualRaw = percentualFinRaw !== null
    ? percentualFinRaw
    : percentualEntRaw !== null
      ? Math.round(100 - percentualEntRaw)
      : null

  // Detecta conflito: todos três informados e imóvel ≠ entrada + financiado (tolerância R$100)
  const TOLERANCIA_CONFLITO = 100
  const conflito = valorImovel !== null && valorEntradaRaw !== null && valorFinanciadoRaw !== null
    && Math.abs(valorImovel - (valorEntradaRaw + valorFinanciadoRaw)) > TOLERANCIA_CONFLITO
  const conflitoDescricao = conflito
    ? `Imóvel R$${valorImovel.toLocaleString('pt-BR')}, entrada R$${valorEntradaRaw!.toLocaleString('pt-BR')} + financiamento R$${valorFinanciadoRaw!.toLocaleString('pt-BR')} = R$${(valorEntradaRaw! + valorFinanciadoRaw!).toLocaleString('pt-BR')} (diferença: R$${Math.abs(valorImovel - valorEntradaRaw! - valorFinanciadoRaw!).toLocaleString('pt-BR')})`
    : null

  // Deriva campos faltantes a partir das combinações disponíveis
  // Quando há conflito, não tenta derivar — deixa os valores como vieram para que o workflow sinalize
  let valorEntrada    = valorEntradaRaw
  let valorFinanciado = valorFinanciadoRaw

  if (!conflito && valorImovel !== null) {
    if (valorEntrada === null && valorFinanciado !== null) {
      // imóvel + financiado → entrada
      valorEntrada = Math.round(valorImovel - valorFinanciado)
    } else if (valorFinanciado === null && valorEntrada !== null) {
      // imóvel + entrada → financiado
      valorFinanciado = Math.round(valorImovel - valorEntrada)
    } else if (valorEntrada === null && valorFinanciado === null && percentualRaw !== null) {
      // imóvel + percentual → financiado e entrada
      valorFinanciado = Math.round(valorImovel * (percentualRaw / 100))
      valorEntrada    = Math.round(valorImovel - valorFinanciado)
    }
  }

  // Mapeia nomes de bancos → BancoId (dedup, preserva ordem)
  const bancosIds: BancoId[] = []
  const seen = new Set<string>()
  for (const nome of raw.bancos_raw ?? []) {
    const id = normalizarBanco(nome)
    if (id && !seen.has(id)) {
      bancosIds.push(id)
      seen.add(id)
    }
  }

  const tipoImovelRaw = (raw.tipo_imovel ?? '').toLowerCase()
  const tipoImovel: 'novo' | 'usado' | null =
    tipoImovelRaw.includes('novo') || tipoImovelRaw.includes('lançamento') || tipoImovelRaw.includes('planta')
      ? 'novo'
      : tipoImovelRaw.includes('usado') || tipoImovelRaw.includes('revenda')
        ? 'usado'
        : null

  // Prazo: converter "30 anos"→360, "35 anos"→420, número direto → mantém; limite 120–420
  let prazoMeses: number | null = null
  if (typeof raw.prazo_meses === 'number') {
    const p = Math.round(raw.prazo_meses)
    prazoMeses = p >= 120 && p <= 420 ? p : null
  }

  // Amortização: SAC por padrão
  const tipoAmortizacaoRaw = (raw.tipo_amortizacao_raw ?? '').toUpperCase()
  const tipoAmortizacao: 'SAC' | 'PRICE' =
    tipoAmortizacaoRaw.includes('PRICE') ? 'PRICE' : 'SAC'

  // Correntista: qualquer relacionamento bancário ativa a flag
  const correntista = !!raw.relacionamento_bancario

  // FGTS
  const fgtsValor = typeof raw.fgts_valor === 'number' ? raw.fgts_valor : null
  const usaFgts = fgtsValor !== null && fgtsValor > 0

  // Idade aproximada — detectada quando data_nascimento vier como "X anos"
  const usouIdadeAproximada = /^\d{1,3}\s*anos?$/i.test((raw.data_nascimento ?? '').trim())

  // Classificação de operação (determinística, baseada em palavras-chave)
  const cls = classificacao ?? { tipoOperacao: 'aquisicao' as const, finalidade: 'residencial' as const, pedirEsclarecimento: false, pergunta: null }

  // Para construção: valorImovel = terreno + obra (override do parser)
  const valorTerreno = typeof raw.valor_terreno === 'number' ? raw.valor_terreno : null
  const valorObra    = typeof raw.valor_obra    === 'number' ? raw.valor_obra    : null
  const ehConstrucao = cls.tipoOperacao === 'construcao_terreno_proprio' || cls.tipoOperacao === 'terreno_mais_construcao'
  if (ehConstrucao && valorTerreno !== null && valorObra !== null) {
    // valorImovel será recalculado abaixo; já está em valorImovel caso o parser extraiu
    // Se o parser não extraiu valor_imovel separado, computar a partir dos dois
  }
  const valorImovelEfetivo = ehConstrucao && valorTerreno !== null && valorObra !== null
    ? valorTerreno + valorObra
    : valorImovel

  // Produto normalizado
  const produtoNormalizado = normalizarProduto(raw.produto)

  // Modo de cálculo
  const modoCalculo = raw.modo_calculo === 'VALOR_MAXIMO_PELA_RENDA'
    ? 'VALOR_MAXIMO_PELA_RENDA' as const
    : null

  // Prazo máximo
  const prazoMaximo = raw.prazo_maximo === true

  // Todos os prazos numéricos detectados (validados 120–420)
  const prazosDetectados = Array.isArray(raw.prazos_detectados)
    ? raw.prazos_detectados
        .filter((p): p is number => typeof p === 'number')
        .map((p) => Math.round(p))
        .filter((p) => p >= 120 && p <= 420)
    : null
  const prazosDetectadosFinal = prazosDetectados && prazosDetectados.length > 0
    ? prazosDetectados
    : null

  return {
    nome:                raw.nome?.trim()   ?? null,
    cpf:                 normalizarCpf(raw.cpf),
    telefone:            normalizarTelefone(raw.telefone),
    data_nascimento:     normalizarData(raw.data_nascimento),
    cidade_imovel:       raw.cidade_imovel?.trim() ?? null,
    tipo_imovel:         tipoImovel,
    valor_imovel:        valorImovelEfetivo,
    valor_entrada:       valorEntrada,
    valor_financiado:    valorFinanciado,
    renda_formal:        raw.renda_formal   ?? null,
    renda_informal:      raw.renda_informal ?? null,
    bancos_ids:          bancosIds,
    solicitar_simulacao: raw.solicitar_simulacao === true,
    prazo_meses:         prazoMeses,
    tipo_amortizacao:    tipoAmortizacao,
    correntista,
    produto:             raw.produto?.trim() ?? null,
    fgts_valor:          fgtsValor,
    usa_fgts:            usaFgts,
    todos_bancos:        raw.todos_bancos === true,
    modo_calculo:             modoCalculo,
    prazo_maximo:             prazoMaximo,
    prazos_detectados:        prazosDetectadosFinal,
    produto_normalizado:      produtoNormalizado,
    usou_idade_aproximada:    usouIdadeAproximada,
    conflito_valores:         conflito,
    conflito_valores_descricao: conflitoDescricao,
    // Campos de modalidade
    tipo_operacao:                cls.tipoOperacao,
    finalidade_efetiva:           cls.finalidade,
    valor_terreno:                valorTerreno,
    valor_obra:                   valorObra,
    pedir_esclarecimento_operacao: cls.pedirEsclarecimento,
    pergunta_esclarecimento:      cls.pergunta,
  }
}
