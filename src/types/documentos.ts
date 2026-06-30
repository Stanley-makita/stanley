export interface ProcessoDocumento {
  id: string
  empresa_id: string
  processo_id: string
  nome: string
  storage_path: string
  tamanho: number | null
  mime_type: string | null
  enviado_por: string
  criado_em: string
  enviado_por_usuario?: { nome: string }
}

export type FiltroTipoDoc = 'todos' | 'imagem' | 'pdf' | 'planilha' | 'outro'

export type DominioDocumento = 'acervo_documental' | 'processo_trabalho'

export interface CatalogoTipoDocumento {
  id: string
  codigo: string
  nome: string
  grupo: 'identificacao' | 'comprovante' | 'financeiro' | 'juridico' | 'geral'
  dominio_permitido: DominioDocumento[]
  permanente: boolean
  validade_dias: number | null
  permite_ocr: boolean
  permite_compartilhamento: boolean
  gera_formulario: boolean
  utilizado_pelo_normi: boolean
  obrigatorio_por_operacao: Record<string, unknown> | null
  schema_extracao: Record<string, unknown> | null
  ordem_exibicao: number
  ativo: boolean
  icone: string | null
}

export interface UploadProgresso {
  arquivo: string
  progresso: number // 0–100
  erro?: string
}