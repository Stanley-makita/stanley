'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type FinAnaliseComissaoLinha, type FinAnaliseComissaoContratoLinha } from '@/types/financeiro'
import { toast } from 'sonner'

// Ao vivo, sempre — mesmo padrão de useEmissoesPreview/useContasAReceberVivo:
// uma linha por processo de financiamento emitido no mês (mesmo filtro de
// emissoes_mes_preview), com a comissão cheia calculada pela mesma tabela
// comissoes_padrao usada em "A Receber". cgi_manual e responsavel_registro
// vêm direto da coluna em `processos` (edição grava lá, sem tabela extra).
export function useAnaliseComissoesMes(mes: number, ano: number) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'analise_comissoes', usuario?.empresa_id, mes, ano],
    queryFn: async (): Promise<FinAnaliseComissaoLinha[]> => {
      const { data, error } = await supabase.rpc('analise_comissoes_mes', {
        p_empresa_id: usuario!.empresa_id,
        p_mes: mes,
        p_ano: ano,
      })
      if (error) throw error
      return data ?? []
    },
    enabled: !!usuario,
  })
}

export function useAtualizarCgiManual() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ processo_id, cgi_manual }: { processo_id: string; cgi_manual: number | null }) => {
      const { error } = await supabase
        .from('processos')
        .update({ cgi_manual })
        .eq('id', processo_id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'analise_comissoes'] })
    },
    onError: () => toast.error('Erro ao salvar o valor de CGI 1%.'),
  })
}

export function useAnaliseComissoesContratosMes(mes: number, ano: number) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'analise_comissoes_contratos', usuario?.empresa_id, mes, ano],
    queryFn: async (): Promise<FinAnaliseComissaoContratoLinha[]> => {
      const { data, error } = await supabase.rpc('analise_comissoes_contratos_mes', {
        p_empresa_id: usuario!.empresa_id,
        p_mes: mes,
        p_ano: ano,
      })
      if (error) throw error
      return data ?? []
    },
    enabled: !!usuario,
  })
}
