import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DominioDocumento } from '@/types/documentos'

interface MoverParaPastaInput {
  documentoId: string
  /** dominio do documento — decide em qual tabela a pasta é gravada, sem a UI
   * precisar saber disso (ver comentário abaixo). */
  dominio: DominioDocumento
  /** obrigatório quando dominio = 'acervo_documental' — é o vínculo (documento
   * reaproveitado) que carrega a pasta, não o documento em si. */
  processoId?: string
  novaPastaId: string | null
}

/**
 * Único ponto de gravação da "pasta" de um documento dentro de um Processo.
 * A UI (dropdown "mover de pasta" no card, ou a gravação inicial no upload)
 * nunca decide diretamente qual tabela tocar — só chama esta função.
 *
 * Motivo de ter duas tabelas: pasta é conceito de Processo, não do documento
 * em si. Um documento do Acervo (dominio_documental) pode ser reaproveitado
 * em vários Processos e, em teoria, estar em pastas diferentes em cada um —
 * por isso a pasta mora em documento_vinculos (por vínculo) para esse caso.
 * Já um documento processo_trabalho é dono direto de um único Processo (não
 * passa por documento_vinculos), então a pasta mora direto em documentos.
 */
export function useMoverDocumentoParaPasta() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ documentoId, dominio, processoId, novaPastaId }: MoverParaPastaInput) => {
      if (dominio === 'processo_trabalho') {
        const { error } = await supabase
          .from('documentos')
          .update({ pasta_id: novaPastaId })
          .eq('id', documentoId)
        if (error) throw error
        return
      }

      if (!processoId) {
        throw new Error('processoId é obrigatório para mover documento do Acervo de pasta.')
      }
      const { error } = await supabase
        .from('documento_vinculos')
        .update({ pasta_id: novaPastaId })
        .eq('documento_id', documentoId)
        .eq('entidade_tipo', 'processo')
        .eq('entidade_id', processoId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documentos-unificado'], exact: false })
    },
  })
}
