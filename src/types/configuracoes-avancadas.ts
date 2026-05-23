export interface MetaEquipe {
  id: string
  empresa_id: string
  ano: number
  mes: number
  meta_valor: number
  meta_corte: number
  meta_plus: number
  meta_contratos: number
}

export interface ComissaoPadrao {
  id: string
  empresa_id: string
  banco_id: string
  comissao_empresa: number
  comissao_comercial: number
  banco?: { nome: string; cor: string | null }
}

export interface PersonalizacaoEmpresa {
  id: string
  nome: string
  logo_path: string | null
  email_contato: string | null
  telefone: string | null
  site: string | null
}