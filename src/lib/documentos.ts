const CLASSIFICACOES_PERMANENTES = new Set(['rg', 'cpf'])

const CLASSIFICACOES_ATENCAO = new Set([
  'certidao_nascimento', 'certidao_casamento', 'certidao_divorcio', 'cnh',
])

const VALIDADE_DIAS_POR_TIPO: Record<string, number> = {
  comprovante_endereco: 90,
  comprovante_renda:    60,
  extrato_bancario:     60,
  extrato_fgts:         90,
  imposto_renda:        365,
}

export function inferirValidade(classificacao: string): {
  permanente: boolean
  validade_dias: number | null
} {
  if (CLASSIFICACOES_PERMANENTES.has(classificacao)) {
    return { permanente: true, validade_dias: null }
  }
  return {
    permanente:    false,
    validade_dias: VALIDADE_DIAS_POR_TIPO[classificacao] ?? null,
  }
}

export type StatusValidade =
  | 'permanente'  // RG, CPF — nunca vence
  | 'atencao'     // CNH, certidões — reutilizável mas estado pode ter mudado
  | 'ok'          // prazo confortável
  | 'expirando'   // < 30 dias restantes
  | 'expirado'    // passou da validade

export function calcularStatusValidade(doc: {
  classificacao: string | null
  permanente?: boolean | null
  validade_data?: string | null
  validade_dias?: number | null
  created_at: string
}): StatusValidade | null {
  const { classificacao, permanente, validade_data, validade_dias, created_at } = doc

  if (permanente) return 'permanente'

  if (CLASSIFICACOES_ATENCAO.has(classificacao ?? '')) return 'atencao'

  if (validade_data) {
    const venc = new Date(validade_data)
    const hoje = new Date()
    const diffDias = Math.floor((venc.getTime() - hoje.getTime()) / 86400000)
    if (diffDias < 0)  return 'expirado'
    if (diffDias < 30) return 'expirando'
    return 'ok'
  }

  if (validade_dias) {
    const upload = new Date(created_at)
    const venc   = new Date(upload.getTime() + validade_dias * 86400000)
    const hoje   = new Date()
    const diffDias = Math.floor((venc.getTime() - hoje.getTime()) / 86400000)
    if (diffDias < 0)  return 'expirado'
    if (diffDias < 30) return 'expirando'
    return 'ok'
  }

  return null
}

export const LABELS_VALIDADE: Record<StatusValidade, string> = {
  permanente: 'Permanente',
  atencao:    'Verificar',
  ok:         'Válido',
  expirando:  'Expirando',
  expirado:   'Expirado',
}

export const CORES_VALIDADE: Record<StatusValidade, string> = {
  permanente: 'bg-green-50 text-green-700 border-green-200',
  atencao:    'bg-amber-50 text-amber-700 border-amber-200',
  ok:         'bg-green-50 text-green-700 border-green-200',
  expirando:  'bg-amber-50 text-amber-700 border-amber-200',
  expirado:   'bg-red-50 text-red-600 border-red-200',
}

export const ICONES_VALIDADE: Record<StatusValidade, string> = {
  permanente: '🟢',
  atencao:    '🟡',
  ok:         '🟢',
  expirando:  '🟡',
  expirado:   '🔴',
}

export function preSelecionar(doc: {
  permanente?: boolean | null
  classificacao: string | null
  validade_data?: string | null
  validade_dias?: number | null
  created_at: string
}): boolean {
  const status = calcularStatusValidade(doc)
  if (!status) return false
  if (status === 'permanente') return true
  if (status === 'atencao')    return false
  if (status === 'expirado')   return false
  return true // ok, expirando
}
