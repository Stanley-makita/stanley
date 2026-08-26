export const TIPOS_BEM = ['Imóvel', 'Veículo', 'Serviço', 'Linha Amarela'] as const

export type TipoParcela = 'linear' | 'reduzida'

export const LABEL_TIPO_PARCELA: Record<TipoParcela, string> = {
  linear: 'Linear',
  reduzida: 'Reduzida',
}
