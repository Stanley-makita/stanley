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

export interface UploadProgresso {
  arquivo: string
  progresso: number // 0–100
  erro?: string
}