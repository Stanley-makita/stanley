// Central de Comunicação com o Cliente (Fase 1 — comunicação manual).

export type TipoInteressado = 'comprador' | 'corretor' | 'parceiro' | 'imobiliaria' | 'construtora'

/** Destinatário possível de comunicação manual (Lead ou Processo) — devolvido por
 * GET /api/leads/[id]/interessados e GET /api/processos/[id]/interessados. */
export interface Interessado {
  tipo_interessado: TipoInteressado
  interessado_id: string
  nome: string
  apto: boolean
  motivo_indisponibilidade: string | null
}

/** Resultado individual de um envio dentro de uma seleção múltipla de destinatários. */
export interface ResultadoEnvio {
  chave: string
  tipo: TipoInteressado
  nome: string
  ok: boolean
  erro?: string
}

export interface ComunicacaoTemplate {
  id: string
  empresa_id: string
  canal: string
  /** Chave estável usada pela aplicação — nunca usar `nome` (rótulo de exibição) em código. */
  codigo: string
  nome: string
  /** Corpo com placeholders {{variavel}}, ver src/lib/comunicacao/substituirVariaveis.ts */
  corpo: string
  ativo: boolean
  created_at: string
  updated_at: string
}
