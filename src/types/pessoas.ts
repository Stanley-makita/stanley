export type StatusIdentidade = 'provisoria' | 'confirmada' | 'duplicada' | 'arquivada'
export type EstadoCivilPessoa = 'solteiro' | 'casado' | 'uniao_estavel' | 'divorciado' | 'viuvo'

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
  // Dados pessoais expandidos
  rg: string | null
  profissao: string | null
  estado_civil: EstadoCivilPessoa | null
  renda_formal: number | null
  renda_informal: number | null
  nacionalidade: string | null
  // Endereço
  endereco_rua: string | null
  endereco_numero: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_uf: string | null
  endereco_cep: string | null
  // Cônjuge / Companheiro(a)
  conjuge_nome: string | null
  conjuge_cpf: string | null
  conjuge_data_nascimento: string | null
  conjuge_telefone: string | null
  conjuge_profissao: string | null
  conjuge_renda_formal: number | null
  conjuge_renda_informal: number | null
  regime_casamento: string | null
  // Particularidade — observação livre sobre o cliente, exibida ao lado do nome
  // em Captação e em Negócios. Só editável por quem criou ou por admin (ver
  // ParticularidadeCliente.tsx).
  particularidade: string | null
  particularidade_criado_por: string | null
  particularidade_atualizado_em: string | null
  // Joins opcionais
  telefones?: PessoaTelefone[]
  leads?: { id: string; nome: string; status: string; fase: { nome: string } | null }[]
  particularidade_criado_por_usuario?: { nome: string } | null
}

export interface PessoaAlteracao {
  id: string
  pessoa_id: string
  empresa_id: string
  usuario_id: string | null
  campos_alterados: string[]
  valores_anteriores: Record<string, unknown>
  valores_novos: Record<string, unknown>
  origem: 'leads' | 'pessoas' | 'processos'
  alterado_em: string
  usuario?: { nome: string } | null
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

// ── Documentos de Identidade por Pessoa ─────────────────────────────────────

export type TipoDocumentoPessoa =
  | 'rg' | 'cnh' | 'cpf'
  | 'certidao_nascimento' | 'certidao_casamento'
  | 'passaporte' | 'rne' | 'outro'

export interface PessoaDocumento {
  id: string
  empresa_id: string
  pessoa_id: string
  tipo_documento: TipoDocumentoPessoa
  numero: string | null
  orgao_emissor: string | null
  uf_emissor: string | null
  data_emissao: string | null
  data_validade: string | null
  data_primeira_habilitacao: string | null
  cartorio: string | null
  matricula: string | null
  livro: string | null
  folha: string | null
  termo: string | null
  cidade_emissao: string | null
  uf_emissao: string | null
  payload_ocr: Record<string, unknown> | null
  documento_cliente_id: string | null
  criado_em: string
  atualizado_em: string
}

export const TIPO_DOCUMENTO_LABEL: Record<TipoDocumentoPessoa, string> = {
  rg:                  'RG / Identidade',
  cnh:                 'CNH',
  cpf:                 'CPF',
  certidao_nascimento: 'Certidão de Nascimento',
  certidao_casamento:  'Certidão de Casamento',
  passaporte:          'Passaporte',
  rne:                 'RNE',
  outro:               'Outro',
}
