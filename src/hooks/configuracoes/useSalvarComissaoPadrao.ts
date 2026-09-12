import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'

export interface SalvarComissaoPadraoInput {
  id?: string | null // presente = atualiza a linha existente; ausente/null = cria nova faixa
  bancoId: string
  modalidade: string
  comissaoEmpresa: number
  comissaoComercial: number
  comissaoOperacional: number
  comissaoParceiro: number
  pisoValor: number
  tetoValor: number
  valorMaximoComissao: number
}

export function useSalvarComissaoPadrao() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: SalvarComissaoPadraoInput) => {
      const payload = {
        empresa_id:             usuario!.empresa_id,
        banco_id:               input.bancoId,
        modalidade:             input.modalidade,
        comissao_empresa:       input.comissaoEmpresa,
        comissao_comercial:     input.comissaoComercial,
        comissao_operacional:   input.comissaoOperacional,
        comissao_parceiro:      input.comissaoParceiro,
        piso_valor:             input.pisoValor,
        teto_valor:             input.tetoValor,
        valor_maximo_comissao:  input.valorMaximoComissao,
      }

      // Sem constraint única de banco+modalidade (agora permite múltiplas
      // faixas de valor por banco+modalidade), upsert por onConflict não
      // serve mais — atualiza por id quando existe, senão insere nova linha.
      // Retorna o id (novo ou existente) pra quem chamou marcar a linha
      // local como salva e evitar reinserir a mesma linha duas vezes.
      const query = input.id
        ? supabase.from('comissoes_padrao').update(payload).eq('id', input.id).eq('empresa_id', usuario!.empresa_id)
        : supabase.from('comissoes_padrao').insert(payload)
      const { data, error } = await query.select('id').single()
      if (error) throw error
      return data.id as string
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
