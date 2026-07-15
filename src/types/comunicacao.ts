// Central de Comunicação com o Cliente (Fase 1 — comunicação manual).

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
