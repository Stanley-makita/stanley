import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Histórico de alterações da Pessoa (`pessoas_alteracoes`).
 *
 * Regra: só entra no histórico o campo cujo valor MUDOU de verdade, sempre com o valor
 * anterior e o novo. Antes, 4 telas gravavam todos os campos do formulário a cada
 * "Salvar" (com `valores_anteriores` vazio) — o histórico listava ~40 campos iguais para
 * qualquer usuário e não dava para saber o que mudou. Todo caminho novo que grava em
 * `pessoas` deve usar `lerValoresAtuaisPessoa` (antes do UPDATE) + `registrarAlteracoesPessoa`.
 */

export type OrigemAlteracao = 'leads' | 'pessoas' | 'processos' | 'ocr'

/** null, undefined e '' contam como vazio; número/booleano comparados pelo texto. */
function normalizar(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') {
    const t = v.trim()
    return t === '' ? null : t
  }
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return JSON.stringify(v)
}

export interface DiffAlteracoes {
  campos: string[]
  anteriores: Record<string, unknown>
  novos: Record<string, unknown>
}

/** Compara só as chaves de `novo` (chave com valor `undefined` = campo não enviado, ignorado). */
export function calcularAlteracoes(
  anterior: Record<string, unknown> | null | undefined,
  novo: Record<string, unknown>,
): DiffAlteracoes {
  const campos: string[] = []
  const anteriores: Record<string, unknown> = {}
  const novos: Record<string, unknown> = {}
  for (const [campo, valorNovo] of Object.entries(novo)) {
    if (valorNovo === undefined) continue
    const valorAnterior = anterior?.[campo] ?? null
    if (normalizar(valorAnterior) !== normalizar(valorNovo)) {
      campos.push(campo)
      anteriores[campo] = valorAnterior
      novos[campo] = valorNovo ?? null
    }
  }
  return { campos, anteriores, novos }
}

/** Lê do banco os valores atuais dos campos que vão ser salvos (chamar ANTES do UPDATE). */
export async function lerValoresAtuaisPessoa(
  client: SupabaseClient,
  pessoaId: string,
  campos: string[],
): Promise<Record<string, unknown> | null> {
  const lista = Array.from(new Set(campos.filter(c => /^[a-z_]+$/.test(c))))
  if (lista.length === 0) return {}
  const { data, error } = await client.from('pessoas').select(lista.join(',')).eq('id', pessoaId).maybeSingle()
  if (error) {
    console.warn('[historico-pessoa] não foi possível ler valores atuais:', error.message)
    return null
  }
  return (data as Record<string, unknown> | null) ?? {}
}

/**
 * Grava no histórico só o que mudou. Nunca lança (histórico não pode derrubar o salvamento);
 * sem os valores anteriores (leitura falhou) não grava nada, para não registrar campo que
 * não mudou. Devolve os campos registrados.
 */
export async function registrarAlteracoesPessoa(
  client: SupabaseClient,
  args: {
    pessoaId: string
    empresaId: string
    usuarioId: string | null
    anterior: Record<string, unknown> | null
    novo: Record<string, unknown>
    origem: OrigemAlteracao
    extrasValoresNovos?: Record<string, unknown>
  },
): Promise<string[]> {
  if (args.anterior === null) return []
  const diff = calcularAlteracoes(args.anterior, args.novo)
  if (diff.campos.length === 0) return []
  const { error } = await client.from('pessoas_alteracoes').insert({
    pessoa_id:          args.pessoaId,
    empresa_id:         args.empresaId,
    usuario_id:         args.usuarioId,
    campos_alterados:   diff.campos,
    valores_anteriores: diff.anteriores,
    valores_novos:      { ...diff.novos, ...(args.extrasValoresNovos ?? {}) },
    origem:             args.origem,
  })
  if (error) console.warn('[historico-pessoa] falha ao gravar histórico:', error.message)
  return diff.campos
}
