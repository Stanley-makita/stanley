export const TIPOS_BEM = ['Imóvel', 'Veículo', 'Serviço', 'Linha Amarela'] as const

export type TipoParcela = 'linear' | 'reduzida'

export const LABEL_TIPO_PARCELA: Record<TipoParcela, string> = {
  linear: 'Linear',
  reduzida: 'Reduzida',
}

// Tipo de lance do consórcio (migration 336): por cota (processo_cotas.tipo_lance) e padrão do negócio
// (processos.tipo_lance, "Dados da Carta"). Nulo = não informado.
export type TipoLance = 'fixo' | 'livre'

export const LABEL_TIPO_LANCE: Record<TipoLance, string> = {
  fixo:  'Lance fixo',
  livre: 'Lance livre',
}

// Tipo de lance que vale para a cota: o da própria cota; sem ele, o padrão do negócio.
export function tipoLanceDaCota(cota: { tipo_lance?: string | null }, negocio: { tipo_lance?: string | null }): TipoLance | null {
  const v = cota.tipo_lance ?? negocio.tipo_lance ?? null
  return v === 'fixo' || v === 'livre' ? v : null
}
