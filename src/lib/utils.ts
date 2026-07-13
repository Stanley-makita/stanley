import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normaliza texto pra comparação tolerante a acento/maiúscula (ex.: nomes de
 * fase configurados livremente pelo usuário em Configurações — "Análise de
 * Crédito" vs "Analise de Credito" devem casar).
 */
const DIACRITICOS_REGEX = /[̀-ͯ]/g

export function normalizarTexto(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(DIACRITICOS_REGEX, '').toLowerCase().trim()
}

export function formatarMoeda(valor: number | null | undefined): string {
  if (valor == null) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(valor)
}

/**
 * Formata uma data para exibição no padrão brasileiro DD/MM/YYYY.
 * Aceita string ISO (YYYY-MM-DD), Date, ou timestamp ISO completo.
 * Usa offset T12:00:00 para evitar variação de fuso ao converter strings de data pura.
 */
export function fmtData(valor: string | Date | null | undefined, incluirHora = false): string {
  if (!valor) return '—'
  try {
    const d = valor instanceof Date
      ? valor
      : new Date(typeof valor === 'string' && valor.length === 10 ? `${valor}T12:00:00` : valor)
    if (isNaN(d.getTime())) return String(valor)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    if (incluirHora) {
      const hh = String(d.getHours()).padStart(2, '0')
      const mi = String(d.getMinutes()).padStart(2, '0')
      return `${dd}/${mm}/${yyyy} às ${hh}:${mi}`
    }
    return `${dd}/${mm}/${yyyy}`
  } catch {
    return String(valor)
  }
}
