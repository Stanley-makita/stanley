'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type Lead } from '@/types/leads'
import { toast } from 'sonner'

interface EditarLeadInput {
  id: string
  nome?: string
  telefone?: string
  email?: string
  cpf?: string
  rg?: string
  data_nascimento?: string | null
  profissao?: string
  estado_civil?: Lead['estado_civil']
  regime_casamento?: string | null
  conjuge_nome?: string | null
  conjuge_cpf?: string | null
  conjuge_data_nascimento?: string | null
  renda_formal?: number | null
  renda_informal?: number | null
  produto_interesse?: Lead['produto_interesse']
  responsavel_id?: string
  fase_id?: string
  origem?: Lead['origem']
  valor_pretendido?: number | null
  observacoes?: string | null
}

export function useEditarLead() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async ({ id, ...campos }: EditarLeadInput): Promise<Lead> => {
      const { data, error } = await supabase
        .from('leads')
        .update(campos)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      // Sincronizar todos os campos sobrepostos com a tabela pessoas
      if (data.pessoa_id) {
        const pessoaPayload: Record<string, unknown> = {}
        if (campos.nome        !== undefined) pessoaPayload.nome             = campos.nome
        if (campos.email       !== undefined) pessoaPayload.email            = campos.email || null
        if (campos.cpf         !== undefined) pessoaPayload.cpf              = campos.cpf?.trim() || null
        if (campos.data_nascimento !== undefined) pessoaPayload.data_nascimento = campos.data_nascimento || null
        if (campos.rg          !== undefined) pessoaPayload.rg               = campos.rg || null
        if (campos.profissao   !== undefined) pessoaPayload.profissao        = campos.profissao || null
        if (campos.estado_civil !== undefined) pessoaPayload.estado_civil    = campos.estado_civil || null
        if (campos.renda_formal !== undefined) pessoaPayload.renda_formal    = campos.renda_formal ?? null
        if (campos.renda_informal !== undefined) pessoaPayload.renda_informal = campos.renda_informal ?? null
        if (campos.conjuge_nome !== undefined) pessoaPayload.conjuge_nome    = campos.conjuge_nome ?? null
        if (campos.conjuge_cpf  !== undefined) pessoaPayload.conjuge_cpf     = campos.conjuge_cpf ?? null
        if (campos.conjuge_data_nascimento !== undefined) pessoaPayload.conjuge_data_nascimento = campos.conjuge_data_nascimento ?? null
        if (campos.regime_casamento !== undefined) pessoaPayload.regime_casamento = campos.regime_casamento ?? null

        if (Object.keys(pessoaPayload).length > 0) {
          await supabase.from('pessoas').update(pessoaPayload).eq('id', data.pessoa_id)

          // Registrar auditoria
          const camposAlterados = Object.keys(pessoaPayload)
          if (camposAlterados.length > 0 && usuario?.id && usuario?.empresa_id) {
            await supabase.from('pessoas_alteracoes').insert({
              pessoa_id: data.pessoa_id,
              empresa_id: usuario.empresa_id,
              usuario_id: usuario.id,
              campos_alterados: camposAlterados,
              valores_anteriores: {},
              valores_novos: pessoaPayload,
              origem: 'leads',
            })
          }
        }
      }

      return data
    },
    onSuccess: (data) => {
      // Atualização imediata no painel de detalhe — mescla com dados em cache
      // (o cache pode ter joins como `responsavel` e `fase` que a mutation não retorna)
      queryClient.setQueryData<Lead>(['leads', data.id], (old) =>
        old ? { ...old, ...data } : data
      )

      // Invalida todas as queries de leads para refetch em background:
      // — o detalhe individual (já atualizado acima via setQueryData)
      // — todas as colunas do kanban (incluindo fase de origem e destino)
      // — a visão lista (useLeadsTodos)
      queryClient.invalidateQueries({ queryKey: ['leads'] })

      // Pessoas vinculadas ao lead podem ter nome/telefone copiados
      if (data.pessoa_id) {
        queryClient.invalidateQueries({ queryKey: ['pessoa', data.pessoa_id] })
        queryClient.invalidateQueries({ queryKey: ['pessoas', data.pessoa_id, 'alteracoes'] })
        queryClient.invalidateQueries({ queryKey: ['pessoas', usuario?.empresa_id] })
      }

      toast.success('Lead atualizado.', {
        className: 'border-l-4 border-l-[#C2AA6A] bg-[#E7E0C4] text-[#253B29]',
      })
    },
    onError: (err: any) => {
      console.error('Erro ao editar lead:', err)
      toast.error(`Erro ao salvar: ${err?.message ?? 'Tente novamente'}`)
    },
  })
}