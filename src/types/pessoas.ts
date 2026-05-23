export type StatusIdentidade = 'provisoria' | 'confirmada' | 'duplicada' | 'arquivada'

export type CanalOrigemDocumento = 'whatsapp' | 'upload_manual' | 'email' | 'outros'
export type OcrStatus = 'pendente' | 'processando' | 'concluido' | 'erro' | 'ignorado'

export interface Pessoa {
  id: string
  empresa_id: string
  nome: string
  cpf: string | null
  data_nascimento: string | null
  email: string | null
  observacoes: string | null
  status_identidade: StatusIdentidade
  created_at: string
  updated_at: string
  deleted_at: string | null
  // Joins opcionais
  telefones?: PessoaTelefone[]
  leads?: { id: string; nome: string; status: string; fase: { nome: string } | null }[]
}

export interface PessoaTelefone {
  id: string
  pessoa_id: string
  empresa_id: string
  telefone: string
  whatsapp: boolean
  principal: boolean
  ativo: boolean
  created_at: string
}

export interface DocumentoCliente {
  id: string
  empresa_id: string
  conversa_id: string | null
  pessoa_id: string | null
  lead_id: string | null
  processo_id: string | null
  nome_original: string
  mime_type: string | null
  tamanho_bytes: number | null
  storage_bucket: string
  storage_path: string
  canal_origem: CanalOrigemDocumento
  classificacao: string | null
  ocr_status: OcrStatus
  ocr_texto: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  // Joins opcionais
  pessoa?: { id: string; nome: string } | null
  conversa?: { id: string; contato_nome: string | null; contato_telefone: string | null } | null
}

export const STATUS_IDENTIDADE_LABELS: Record<StatusIdentidade, string> = {
  provisoria: 'Provisória',
  confirmada: 'Confirmada',
  duplicada: 'Duplicada',
  arquivada: 'Arquivada',
}

export const STATUS_IDENTIDADE_CORES: Record<StatusIdentidade, string> = {
  provisoria: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  confirmada: 'bg-green-100 text-green-700 border-green-200',
  duplicada:  'bg-orange-100 text-orange-700 border-orange-200',
  arquivada:  'bg-gray-100 text-gray-500 border-gray-200',
}
