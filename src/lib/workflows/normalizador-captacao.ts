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
import type { BancoId } from '@/lib/simuladorFinanciamento/tipos'

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
}

// Mapa de aliases de bancos → BancoId
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

  // DD/MM/YYYY ou DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // MM/DD/YYYY (fallback improvável no contexto br, mas tratado)
  const mdyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (mdyMatch) return null  // ambíguo, não tenta

  // Apenas "45 anos" — converte para data aproximada
  const anosMatch = s.match(/^(\d{1,3})\s*anos?$/i)
  if (anosMatch) {
    const anos = parseInt(anosMatch[1], 10)
    const anoNasc = new Date().getFullYear() - anos
    return `${anoNasc}-01-01`  // aproximação (dia e mês desconhecidos)
  }

  return null
}

export function normalizarDadosCaptacao(raw: DadosCaptacaoRaw): DadosCaptacaoNormalizados {
  const valorImovel    = raw.valor_imovel    ?? null
  const valorEntradaRaw = raw.valor_entrada  ?? null
  const valorFinanciadoRaw = raw.valor_financiado ?? null
  const percentualRaw  = raw.percentual_financiado ?? null

  // Deriva campos faltantes a partir das combinações disponíveis
  let valorEntrada    = valorEntradaRaw
  let valorFinanciado = valorFinanciadoRaw

  if (valorImovel !== null) {
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

  return {
    nome:                raw.nome?.trim()   ?? null,
    cpf:                 normalizarCpf(raw.cpf),
    telefone:            normalizarTelefone(raw.telefone),
    data_nascimento:     normalizarData(raw.data_nascimento),
    cidade_imovel:       raw.cidade_imovel?.trim() ?? null,
    tipo_imovel:         tipoImovel,
    valor_imovel:        valorImovel,
    valor_entrada:       valorEntrada,
    valor_financiado:    valorFinanciado,
    renda_formal:        raw.renda_formal   ?? null,
    renda_informal:      raw.renda_informal ?? null,
    bancos_ids:          bancosIds,
    solicitar_simulacao: raw.solicitar_simulacao === true,
  }
}
