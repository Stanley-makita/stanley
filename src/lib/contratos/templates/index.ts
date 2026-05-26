export { TEMPLATE_COMPRA_VENDA } from './compra-venda'
export { TEMPLATE_DISTRATO_LOCACAO } from './distrato-locacao'
export { TEMPLATE_LOCACAO_IMOVEL } from './locacao-imovel'
export { TEMPLATE_PRESTACAO_SERVICOS } from './prestacao-servicos'

export const TODOS_TEMPLATES = [
  { id: 'compra_venda', titulo: 'Compromisso de Venda e Compra', descricao: 'Contrato de compra e venda de imóvel com partes, valores e condições de pagamento.' },
  { id: 'distrato_locacao', titulo: 'Distrato de Locação', descricao: 'Rescisão amigável de contrato de locação com acerto de valores entre as partes.' },
  { id: 'locacao_imovel', titulo: 'Locação de Imóvel', descricao: 'Contrato de locação residencial ou comercial com fiador e condições de pagamento.' },
  { id: 'prestacao_servicos', titulo: 'Prestação de Serviços', descricao: 'Contrato de prestação de serviços de assessoria imobiliária ou jurídica.' },
] as const

export type TipoModelo = typeof TODOS_TEMPLATES[number]['id']
