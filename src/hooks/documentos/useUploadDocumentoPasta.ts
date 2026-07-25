'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { useCatalogoPastasProcesso } from '@/hooks/documentos/useCatalogoPastasProcesso'
import { inferirValidade } from '@/lib/documentos'
import { toast } from 'sonner'

const BUCKET = 'documentos-clientes'

export interface UploadDocumentoInput {
  empresaId: string
  entidadeTipo: 'lead' | 'processo' | 'pessoa'
  entidadeId: string
  pessoaIdUpload: string
  pastaId: string | null
  arquivo: File
  tipoArquivo?: string
  token?: string
  extrairAposUpload?: boolean
}

/**
 * Upload de um único arquivo: storage + `documentos` + `documento_vinculos`
 * (+ trigger opcional de OCR). Núcleo extraído de `AbaDocumentos` pra ser
 * reaproveitado também pelas caixas fixas de upload do Construtor de
 * Contratos, sem duplicar a lógica de storage/insert/vínculo.
 */
export async function uploadDocumentoParaPasta(input: UploadDocumentoInput): Promise<string> {
  const {
    empresaId, entidadeTipo, entidadeId, pessoaIdUpload, pastaId,
    arquivo, tipoArquivo = 'auto', token, extrairAposUpload = true,
  } = input

  const ext = arquivo.name.split('.').pop() ?? 'bin'
  const storagePath = `${empresaId}/${entidadeId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, arquivo, { upsert: false })
  if (uploadError) throw new Error(uploadError.message)

  const rawMime = arquivo.type || ''
  const fileExt = arquivo.name.split('.').pop()?.toLowerCase() ?? ''
  const resolvedMime = rawMime === 'image/jpg'
    ? 'image/jpeg'
    : !rawMime && (fileExt === 'jpg' || fileExt === 'jpeg')
      ? 'image/jpeg'
      : rawMime || null

  const validade = tipoArquivo !== 'auto' ? inferirValidade(tipoArquivo) : { permanente: false, validade_dias: null }

  const { data: docInserido, error: dbError } = await supabase
    .from('documentos')
    .insert({
      empresa_id: empresaId,
      dominio: 'acervo_documental',
      pessoa_id: pessoaIdUpload,
      nome_original: arquivo.name,
      mime_type: resolvedMime,
      tamanho_bytes: arquivo.size,
      storage_bucket: BUCKET,
      storage_path: storagePath,
      origem: 'upload_manual',
      classificacao_legado: tipoArquivo,
      status_ocr: 'pendente',
      permanente: validade.permanente,
      validade_dias: validade.validade_dias,
    })
    .select('id')
    .single()

  if (dbError) {
    await supabase.storage.from(BUCKET).remove([storagePath])
    throw new Error(dbError.message)
  }

  if (entidadeTipo !== 'pessoa' && docInserido?.id) {
    await supabase.from('documento_vinculos').insert({
      empresa_id: empresaId,
      documento_id: docInserido.id,
      entidade_tipo: entidadeTipo,
      entidade_id: entidadeId,
      pasta_id: pastaId,
    })
  }

  if (docInserido?.id && token && extrairAposUpload) {
    fetch(`/api/documentos/${docInserido.id}/ocr-iniciar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(console.error)
  }

  return docInserido!.id as string
}

async function resolverPessoaPorPapel(
  processoId: string,
  empresaId: string,
  papel: 'comprador' | 'vendedor' | 'imovel',
): Promise<string | null> {
  if (papel === 'vendedor') {
    const { data: principal } = await supabase
      .from('processo_vendedores')
      .select('pessoa_id')
      .eq('processo_id', processoId)
      .eq('empresa_id', empresaId)
      .eq('principal', true)
      .maybeSingle()
    if (principal?.pessoa_id) return principal.pessoa_id
    const { data: qualquer } = await supabase
      .from('processo_vendedores')
      .select('pessoa_id')
      .eq('processo_id', processoId)
      .eq('empresa_id', empresaId)
      .limit(1)
      .maybeSingle()
    return qualquer?.pessoa_id ?? null
  }

  // Comprador e Imóvel: documentos ficam atribuídos ao comprador principal —
  // mesma convenção já usada no resto do sistema (ver resolverPessoaIdUpload
  // em AbaDocumentos.tsx), imóvel não tem "pessoa" própria.
  const { data } = await supabase
    .from('processo_compradores')
    .select('pessoa_id')
    .eq('processo_id', processoId)
    .eq('empresa_id', empresaId)
    .eq('principal', true)
    .maybeSingle()
  return data?.pessoa_id ?? null
}

/**
 * Upload direto pra uma pasta fixa do Processo (usado pelas 3 caixas do
 * Construtor de Contratos: Comprador / Vendedor / Imóvel) — sem seletor de
 * tipo/pasta manual, a pasta já vem definida pelo chamador.
 */
export function useUploadDocumentoPasta(processoId: string, pastaCodigo: 'comprador' | 'vendedor' | 'imovel') {
  const { usuario } = useAuth()
  const queryClient = useQueryClient()
  const { data: catalogoPastas = [] } = useCatalogoPastasProcesso()

  return useMutation({
    mutationFn: async (arquivo: File) => {
      if (!usuario) throw new Error('Usuário não autenticado.')
      const pessoaIdUpload = await resolverPessoaPorPapel(processoId, usuario.empresa_id, pastaCodigo)
      if (!pessoaIdUpload) {
        throw new Error(
          pastaCodigo === 'vendedor'
            ? 'Cadastre o vendedor antes de anexar os documentos dele.'
            : 'Cadastre o comprador antes de anexar documentos.',
        )
      }
      const pastaId = catalogoPastas.find((p) => p.codigo === pastaCodigo)?.id ?? null
      const { data: { session } } = await supabase.auth.getSession()

      return uploadDocumentoParaPasta({
        empresaId: usuario.empresa_id,
        entidadeTipo: 'processo',
        entidadeId: processoId,
        pessoaIdUpload,
        pastaId,
        arquivo,
        token: session?.access_token,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documentos-unificado', 'processo', processoId] })
      queryClient.invalidateQueries({ queryKey: ['documentos-resumo-processo', processoId] })
      queryClient.invalidateQueries({ queryKey: ['documentos-por-pasta', processoId] })
    },
    onError: (error) => {
      console.error('[contratos] erro no upload de documento:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar documento.')
    },
  })
}
