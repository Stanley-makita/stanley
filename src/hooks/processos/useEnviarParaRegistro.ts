'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type Processo } from '@/types/processos'
import { toast } from 'sonner'

export function useEnviarParaRegistro() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (origem: Processo) => {
      const { data: primeiraFase } = await supabase.from('fases').select('id')
        .eq('empresa_id', usuario!.empresa_id).eq('modulo', 'registro')
        .eq('ativo', true).order('ordem', { ascending: true }).limit(1).maybeSingle()

      const { data, error } = await supabase
        .from('processos')
        .insert({
          empresa_id: usuario!.empresa_id,
          modalidade: 'Registro',
          pessoa_id: origem.pessoa_id ?? null,
          lead_id: null,
          nome_imovel: origem.nome_imovel,
          banco_id: origem.banco_id,
          valor_imovel: origem.valor_imovel,
          valor_financiado: origem.valor_financiado,
          valor_entrada: origem.valor_entrada,
          comercial_id: origem.comercial_id,
          operacional_id: origem.operacional_id,
          juridico_id: origem.juridico_id ?? null,
          status_processo: 'em_analise',
          status_emissao: 'nao_emitido',
          chance_emissao: 'certeza',
          tem_assessoria: origem.tem_assessoria,
          valor_assessoria: origem.valor_assessoria ?? null,
          comissao_comercial: origem.comissao_comercial,
          comissao_empresa: origem.comissao_empresa,
          corretor_nome: origem.corretor_nome,
          corretor_creci: origem.corretor_creci,
          data_inicio: new Date().toISOString().split('T')[0],
          fase_atual_id: primeiraFase?.id ?? null,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos'] })
      toast.success('Processo enviado ao módulo Registro.', {
        className: 'border-l-4 border-l-[#C2AA6A] bg-[#E7E0C4] text-[#253B29]',
      })
    },
    onError: (err: any) => {
      console.error('[useEnviarParaRegistro] erro:', err)
      toast.error(`Erro ao criar processo de Registro: ${err?.message ?? JSON.stringify(err)}`)
    },
  })
}
