import { type TipoInteressado } from '@/types/comunicacao'

// lead_historico e processo_comentarios não têm coluna estruturada própria pro destinatário
// resolvido de uma comunicação manual (ver src/app/api/leads/[id]/atualizar-cliente/route.ts e
// src/app/api/processos/[id]/atualizar-cliente/route.ts) — o servidor grava um cabeçalho fixo e
// parseável na primeira linha do texto livre (tipo, id, nome usado), seguido da mensagem.
// Compartilhado entre AbaHistorico.tsx (Lead) e AbaTimeline.tsx/PainelComentarios.tsx
// (Processo) pra não duplicar a regex em cada lugar que precisa exibir a timeline.
const REGEX_CABECALHO_COMUNICACAO = /^\[COMUNICACAO tipo=(comprador|corretor|parceiro|imobiliaria|construtora) id=[^\s]+ nome="([^"]*)"\]\n?/

export interface ComunicacaoParseada {
  tipo: TipoInteressado
  nome: string
  mensagem: string
}

/** Retorna `null` se `texto` não tiver o cabeçalho (ex: registros antigos, anteriores a este
 * formato) — o chamador deve cair num título/exibição genérica nesse caso. */
export function parseCabecalhoComunicacao(texto: string | null | undefined): ComunicacaoParseada | null {
  if (!texto) return null
  const match = texto.match(REGEX_CABECALHO_COMUNICACAO)
  if (!match) return null
  const [cabecalho, tipo, nome] = match as unknown as [string, TipoInteressado, string]
  return { tipo, nome, mensagem: texto.slice(cabecalho.length) }
}

export const LABEL_TIPO_INTERESSADO_TIMELINE: Record<TipoInteressado, string> = {
  comprador:   'comprador',
  corretor:    'corretor',
  parceiro:    'parceiro',
  imobiliaria: 'imobiliária',
  construtora: 'construtora',
}
