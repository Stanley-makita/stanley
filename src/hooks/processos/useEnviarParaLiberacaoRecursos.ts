'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type Processo } from '@/types/processos'
import { MODULO_POR_MODALIDADE } from '@/lib/processos/fasesConfig'
import { normalizarTexto } from '@/lib/utils'
import { toast } from 'sonner'

/**
 * Retorna o processo do fluxo de Registro pro fluxo de Financiamento, na fase
 * "Liberação de Recursos" — reverte a troca de modalidade feita por
 * useEnviarParaFluxoRegistro, restaurando `modalidade_origem` e limpando o
 * campo. Processos de Registro criados antes desta feature (mecanismo antigo,
 * sem `modalidade_origem`) não têm pra onde voltar — erro amigável.
 */
export function useEnviarParaLiberacaoRecursos() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (processo: Processo) => {
      const modalidadeOrigem = processo.modalidade_origem
      if (!modalidadeOrigem) {
        throw new Error('Este processo não tem modalidade de origem registrada — não é possível voltar automaticamente.')
      }

      const modulo = MODULO_POR_MODALIDADE[modalidadeOrigem] ?? 'processos'
      const { data: fasesModulo } = await supabase.from('fases').select('id, nome')
        .eq('empresa_id', usuario!.empresa_id).eq('modulo', modulo).eq('ativo', true)

      const faseLiberacao = (fasesModulo ?? []).find(
        f => normalizarTexto(f.nome) === normalizarTexto('Liberação de Recursos')
      )
      if (!faseLiberacao) {
        throw new Error('Fase "Liberação de Recursos" não encontrada — configure em Configurações > Fases.')
      }

      const { error: histError } = await supabase.from('processo_fases_historico').insert({
        processo_id: processo.id,
        empresa_id: usuario!.empresa_id,
        fase_id: faseLiberacao.id,
        usuario_id: usuario!.id,
        observacao: 'Processo retornou ao fluxo de Financiamento',
      })
      if (histError) throw histError

      const { error } = await supabase.from('processos').update({
        modalidade: modalidadeOrigem,
        modalidade_origem: null,
        fase_atual_id: faseLiberacao.id,
      }).eq('id', processo.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos'] })
      queryClient.invalidateQueries({ queryKey: ['negocios', 'dashboard', 'contagens'] })
      toast.success('Processo retornado ao fluxo de Financiamento — Liberação de Recursos.', {
        className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary',
      })
    },
    onError: (err: any) => {
      console.error('[useEnviarParaLiberacaoRecursos] erro:', err)
      toast.error(`Erro ao retornar para Financiamento: ${err?.message ?? JSON.stringify(err)}`)
    },
  })
}
