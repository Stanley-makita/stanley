import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'

export interface SalvarComissaoPadraoInput {
  bancoId: string
  modalidade: string
  comissaoEmpresa: number
  comissaoComercial: number
  comissaoOperacional: number
  comissaoParceiro: number
  pisoValor: number
  tetoValor: number
}

export function useSalvarComissaoPadrao() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: SalvarComissaoPadraoInput) => {
      const { error } = await supabase
        .from('comissoes_padrao')
        .upsert({
          empresa_id:            usuario!.empresa_id,
          banco_id:              input.bancoId,
          modalidade:            input.modalidade,
          comissao_empresa:      input.comissaoEmpresa,
          comissao_comercial:    input.comissaoComercial,
          comissao_operacional:  input.comissaoOperacional,
          comissao_parceiro:     input.comissaoParceiro,
          piso_valor:            input.pisoValor,
          teto_valor:            input.tetoValor,
        }, { onConflict: 'empresa_id,banco_id,modalidade' })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comissoes-padrao', usuario?.empresa_id] })
    },
  })
}

export function useExcluirComissaoPadrao() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('comissoes_padrao')
        .delete()
        .eq('id', id)
        .eq('empresa_id', usuario!.empresa_id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comissoes-padrao', usuario?.empresa_id] })
    },
  })
}
