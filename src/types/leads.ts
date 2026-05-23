export type LeadOrigem =
  | 'indicacao'
  | 'site'
  | 'whatsapp'
  | 'instagram'
  | 'facebook'
  | 'outros'

export type EstadoCivil =
  | 'solteiro'
  | 'casado'
  | 'uniao_estavel'
  | 'divorciado'
  | 'viuvo'

export type ProdutoInteresse = 'financiamento' | 'consorcio' | 'cgi' | 'portabilidade' | 'contrato'

export interface Lead {
  id: string
  empresa_id: string
  nome: string
  telefone: string
  email: string | null
  cpf: string | null
  rg: string | null
  data_nascimento: string | null
  profissao: string | null
  estado_civil: EstadoCivil | null
  regime_casamento: string | null
  conjuge_nome: string | null
  conjuge_cpf: string | null
  conjuge_data_nascimento: string | null
  renda_formal: number | null
  renda_informal: number | null
  produto_interesse: ProdutoInteresse | null
  fase_id: string
  responsavel_id: string | null
  pessoa_id: string | null
  origem: LeadOrigem
  valor_pretendido: number | null
  observacoes: string | null
  ordem_kanban: number
  ultimo_contato: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  convertido_em: string | null
  // Joins
  responsavel?: { id: string; nome: string } | null
  fase?: { id: string; nome: string; cor: string } | null
}

export interface LeadHistorico {
  id: string
  lead_id: string
  empresa_id: string
  usuario_id: string
  tipo: 'fase_mudanca' | 'criacao' | 'edicao' | 'comentario'
  fase_anterior_id: string | null
  fase_nova_id: string | null
  descricao: string | null
  created_at: string
  usuario?: { nome: string }
  fase_anterior?: { nome: string } | null
  fase_nova?: { nome: string } | null
}

export interface MoverLeadInput {
  lead_id: string
  fase_id_destino: string
  ordem_destino: number
}