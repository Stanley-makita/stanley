'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { type PessoaDocumento, type TipoDocumentoPessoa } from '@/types/pessoas'

const QK = (pessoaId: string) => ['pessoa-documentos', pessoaId]

export function usePessoaDocumentos(pessoaId: string | null | undefined) {
  return useQuery({
    queryKey: QK(pessoaId ?? ''),
    enabled: !!pessoaId,
    queryFn: async (): Promise<PessoaDocumento[]> => {
      const { data, error } = await supabase
        .from('pessoa_documentos_identificacao')
        .select('*')
        .eq('pessoa_id', pessoaId!)
        .order('tipo_documento', { ascending: true })

      if (error) throw error
      return data as PessoaDocumento[]
    },
  })
}

export type UpsertDocumentoInput = Omit<PessoaDocumento,
  'id' | 'criado_em' | 'atualizado_em'
>

export function useUpsertPessoaDocumento() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpsertDocumentoInput) => {
      const { data, error } = await supabase
        .from('pessoa_documentos_identificacao')
        .upsert(input, { onConflict: 'pessoa_id,tipo_documento' })
        .select('*')
        .single()

      if (error) throw error
      return data as PessoaDocumento
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: QK(vars.pessoa_id) })
    },
  })
}

export function useRemoverPessoaDocumento() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, pessoaId }: { id: string; pessoaId: string }) => {
      const { error } = await supabase
        .from('pessoa_documentos_identificacao')
        .delete()
        .eq('id', id)

      if (error) throw error
      return { pessoaId }
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: QK(res.pessoaId) })
    },
  })
}

// Helper: monta payload de upsert para o tipo dado, sincronizando
// campos flat de `pessoas` via callback externo quando necessário.
export function camposPorTipo(tipo: TipoDocumentoPessoa): (keyof PessoaDocumento)[] {
  switch (tipo) {
    case 'rg':
      return ['numero', 'orgao_emissor', 'uf_emissor', 'data_emissao']
    case 'cnh':
      return ['numero', 'orgao_emissor', 'data_emissao', 'data_validade', 'data_primeira_habilitacao']
    case 'certidao_nascimento':
    case 'certidao_casamento':
      return ['cartorio', 'matricula', 'livro', 'folha', 'termo', 'cidade_emissao', 'uf_emissao', 'data_emissao']
    default:
      return ['numero', 'orgao_emissor', 'data_emissao', 'data_validade']
  }
}
