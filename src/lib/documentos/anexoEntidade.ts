import { supabase } from '@/lib/supabase'

const BUCKET = 'documentos-clientes'

// Tipos de entidade "privados" — o documento anexado fica visível só ali,
// nunca aparece automaticamente na aba Documentos geral do Lead/Negócio
// (decisão explícita: usuário anexa lá manualmente se quiser).
export type EntidadeAnexoTipo = 'lead_historico' | 'processo_comentario'

export interface AnexoEntidade {
  id: string
  nome_original: string
  mime_type: string | null
  storage_path: string
  storage_bucket: string
}

/**
 * Sobe um arquivo (colado ou anexado) pro Storage e cria o documento +
 * vínculo com uma nota/comentário específico. `pessoaId`/`processoId`:
 * `documentos` exige um dono (CHECK dominio/pessoa_id/processo_id) mesmo
 * quando o documento não deve aparecer nos Documentos gerais — o dono aqui
 * só satisfaz essa restrição de banco, nenhum vínculo com entidade_tipo
 * 'lead'/'processo' é criado.
 */
export async function anexarDocumentoEntidade(
  arquivo: File,
  opts: {
    empresaId: string
    usuarioId: string
    entidadeTipo: EntidadeAnexoTipo
    entidadeId: string
    pessoaId?: string | null
    processoId?: string | null
  },
): Promise<AnexoEntidade> {
  const dominio = opts.processoId ? 'processo_trabalho' : 'acervo_documental'
  if (dominio === 'acervo_documental' && !opts.pessoaId) {
    throw new Error('Pessoa não vinculada — não é possível anexar arquivos aqui ainda.')
  }

  const ext = arquivo.name.includes('.') ? arquivo.name.split('.').pop() : 'bin'
  const storagePath = `${opts.empresaId}/${opts.entidadeTipo}/${opts.entidadeId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, arquivo, { upsert: false })
  if (uploadError) throw new Error(uploadError.message)

  const { data: docInserido, error: dbError } = await supabase
    .from('documentos')
    .insert({
      empresa_id: opts.empresaId,
      dominio,
      pessoa_id: dominio === 'acervo_documental' ? opts.pessoaId : null,
      processo_id: dominio === 'processo_trabalho' ? opts.processoId : null,
      nome_original: arquivo.name,
      mime_type: arquivo.type || null,
      tamanho_bytes: arquivo.size,
      storage_bucket: BUCKET,
      storage_path: storagePath,
      origem: 'upload_manual',
      // Não entra na fila de OCR — anexo de nota/comentário é contexto de
      // conversa, não documento de identidade a extrair.
      status_ocr: 'ignorado',
    })
    .select('id, nome_original, mime_type, storage_path, storage_bucket')
    .single()

  if (dbError || !docInserido) {
    await supabase.storage.from(BUCKET).remove([storagePath])
    throw new Error(dbError?.message ?? 'Erro ao salvar documento')
  }

  const { error: vinculoError } = await supabase.from('documento_vinculos').insert({
    empresa_id: opts.empresaId,
    documento_id: docInserido.id,
    entidade_tipo: opts.entidadeTipo,
    entidade_id: opts.entidadeId,
    vinculado_por: opts.usuarioId,
  })
  if (vinculoError) {
    await supabase.from('documentos').delete().eq('id', docInserido.id)
    await supabase.storage.from(BUCKET).remove([storagePath])
    throw new Error(vinculoError.message)
  }

  return docInserido
}

export async function abrirAnexo(anexo: AnexoEntidade): Promise<string | null> {
  const { data } = await supabase.storage
    .from(anexo.storage_bucket)
    .createSignedUrl(anexo.storage_path, 3600)
  return data?.signedUrl ?? null
}
