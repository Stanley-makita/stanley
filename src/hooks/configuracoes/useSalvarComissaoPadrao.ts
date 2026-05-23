import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'

export function useSalvarComissaoPadrao() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      bancoId,
      comissaoEmpresa,
      comissaoComercial,
    }: {
      bancoId: string
      comissaoEmpresa: number
      comissaoComercial: number
    }) => {
      const { error } = await supabase
        .from('comissoes_padrao')
        .upsert({
          empresa_id:         usuario!.empresa_id,
          banco_id:           bancoId,
          comissao_empresa:   comissaoEmpresa,
          comissao_comercial: comissaoComercial,
        }, { onConflict: 'empresa_id,banco_id' })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comissoes-padrao', usuario?.empresa_id] })
    },
  })
}