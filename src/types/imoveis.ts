export interface RegistroImoveis {
  id: string
  empresa_id: string
  nome: string
  cidade: string | null
  uf: string | null
  telefone: string | null
  observacao: string | null
  ativo: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type OrigemImovel = 'empreendimento' | 'individual'
export type CategoriaImovel = 'residencial' | 'comercial' | 'industrial' | 'rural'
export type TipoImovel = 'apartamento' | 'casa' | 'sobrado' | 'terreno' | 'barracao'
export type CondicaoImovel = 'novo' | 'usado'

export interface Imovel {
  id: string
  empresa_id: string
  origem: OrigemImovel
  categoria: CategoriaImovel
  tipo: TipoImovel | null
  condicao: CondicaoImovel | null
  matricula: string | null
  cadastro_imobiliario: string | null
  registro_imoveis_id: string | null
  registro_imoveis?: RegistroImoveis | null
  area_construida: number | null
  area_terreno: number | null
  zona: string | null
  rua: string | null
  numero: string | null
  quadra: string | null
  lote: string | null
  bloco: string | null
  apto_unidade: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  garagem: boolean
  observacoes: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  ultimo_processo?: { id: string; numero_processo: string; modalidade: string } | null
}

export const TIPO_IMOVEL_LABELS: Record<TipoImovel, string> = {
  apartamento: 'Apartamento',
  casa: 'Casa',
  sobrado: 'Sobrado',
  terreno: 'Terreno',
  barracao: 'Barracão',
}

export const CATEGORIA_IMOVEL_LABELS: Record<CategoriaImovel, string> = {
  residencial: 'Residencial',
  comercial: 'Comercial',
  industrial: 'Industrial',
  rural: 'Rural',
}

export const ORIGEM_IMOVEL_LABELS: Record<OrigemImovel, string> = {
  individual: 'Individual',
  empreendimento: 'Empreendimento',
}

export const CONDICAO_IMOVEL_LABELS: Record<CondicaoImovel, string> = {
  novo: 'Novo',
  usado: 'Usado',
}
