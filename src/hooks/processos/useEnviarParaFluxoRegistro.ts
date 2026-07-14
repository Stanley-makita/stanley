'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type Processo } from '@/types/processos'
import { toast } from 'sonner'

/**
 * Envia o processo pro fluxo de Registro — NÃO cria uma linha nova: troca a
 * modalidade do mesmo processo (guardando a modalidade original em
 * `modalidade_origem`, pra permitir o retorno via useEnviarParaLiberacaoRecursos).
 * Substitui o antigo useEnviarParaRegistro (que duplicava a linha, sem vínculo
 * de volta ao processo de origem).
 */
export function useEnviarParaFluxoRegistro() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (processo: Processo) => {
      const { data: primeiraFase } = await supabase.from('fases').select('id')
        .eq('empresa_id', usuario!.empresa_id).eq('modulo', 'registro')
        .eq('ativo', true).order('ordem', { ascending: true }).limit(1).maybeSingle()

      if (!primeiraFase) throw new Error('Nenhuma fase configurada para o módulo Registro.')

      const { error: histError } = await supabase.from('processo_fases_historico').insert({
        processo_id: processo.id,
        empresa_id: usuario!.empresa_id,
        fase_id: primeiraFase.id,
        usuario_id: usuario!.id,
        observacao: 'Processo enviado ao fluxo de Registro',
      })
      if (histError) throw histError

      const { error } = await supabase.from('processos').update({
        modalidade: 'Registro',
        modalidade_origem: processo.modalidade,
        fase_atual_id: primeiraFase.id,
      }).eq('id', processo.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos'] })
      queryClient.invalidateQueries({ queryKey: ['negocios', 'dashboard', 'contagens'] })
      toast.success('Processo enviado ao fluxo de Registro.', {
        className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary',
      })
    },
    onError: (err: any) => {
      console.error('[useEnviarParaFluxoRegistro] erro:', err)
      toast.error(`Erro ao enviar para o fluxo de Registro: ${err?.message ?? JSON.stringify(err)}`)
    },
  })
}
