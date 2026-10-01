'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type ProcessoVendedor } from '@/types/processos'
import { toast } from 'sonner'
import { SELECT_LINHAS_NEGOCIO, comoVendedores, type LinhaParticipacao } from '@/lib/participantes/linhasNegocio'
import { editarNoNegocio, incluirNoNegocio, removerDoNegocio } from '@/lib/participantes/negocioCliente'



export function useProcessoVendedores(processoId: string) {
  return useQuery({
    queryKey: ['processos', processoId, 'vendedores'],
    queryFn: async (): Promise<ProcessoVendedor[]> => {
      // V2 C2: cada linha é uma participação; dados da Pessoa (linhasNegocio.ts)
      const { data, error } = await supabase
        .from('participacoes')
        .select(SELECT_LINHAS_NEGOCIO)
        .eq('processo_id', processoId)
        .in('papel', ['vendedor'])
      if (error) throw error
      return comoVendedores((data ?? []) as unknown as LinhaParticipacao[])
    },
    enabled: !!processoId,
  })
}

export function useAdicionarVendedor(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (input: Omit<ProcessoVendedor, 'id' | 'processo_id' | 'empresa_id' | 'created_at' | 'updated_at' | 'pessoa'>) => {
      // V2 (B2c-C1c): pelo serviço único (vincula a Pessoa pelo CPF no servidor)
      await incluirNoNegocio(processoId, 'vendedores', input as Record<string, unknown>)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'vendedores'] })
      queryClient.invalidateQueries({ queryKey: ['processos', processoId] })
      toast.success('Vendedor adicionado.', { className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary' })
    },
    onError: (e: Error) => toast.error(e?.message || 'Erro ao adicionar vendedor.'),
  })
}

export function useEditarVendedor(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async ({ id, pessoa_id, telefone, ...input }: Partial<ProcessoVendedor> & { id: string; pessoa_id?: string | null }) => {
      // V2: linha (participação) pelo serviço único — principal, renda e cônjuge do vendedor
      const r = await editarNoNegocio(processoId, 'vendedores', id, input as Record<string, unknown>)
      const resolvedPessoaId = pessoa_id ?? r.pessoa_id ?? null

      // Telefone vai por RPC própria (qualquer usuário ativo pode corrigir,
      // não só analista/gerente/gestor/admin — mesma lógica de
      // useEditarComprador). Sem pessoa_id vinculado, cai no fallback de
      // sempre (sujeito à restrição de perfil da policy desta tabela).
      if (telefone !== undefined) {
        const telefoneVal = telefone?.trim() || ''
        if (resolvedPessoaId && telefoneVal) {
          const { error: errTel } = await supabase.rpc('atualizar_telefone_pessoa', {
            p_pessoa_id: resolvedPessoaId,
            p_telefone: telefoneVal,
            p_origem: 'processos',
          })
          if (errTel) throw errTel
        }
      }

      // Sincronizar campos compartilhados com pessoas
      if (resolvedPessoaId) {
        const pessoaPayload: Record<string, unknown> = {}
        if (input.nome          !== undefined) pessoaPayload.nome          = input.nome
        if (input.cpf           !== undefined) pessoaPayload.cpf           = input.cpf || null
        if (input.email         !== undefined) pessoaPayload.email         = input.email || null
        if (input.estado_civil  !== undefined) pessoaPayload.estado_civil  = input.estado_civil || null
        // Conta bancária: Pessoa é a fonte dos formulários (V2 B2a) — edição aqui precisa chegar lá.
        if (input.banco   !== undefined) pessoaPayload.conta_bancaria_banco   = input.banco || null
        if (input.agencia !== undefined) pessoaPayload.conta_bancaria_agencia = input.agencia || null
        if (input.conta   !== undefined) pessoaPayload.conta_bancaria_numero  = input.conta || null

        if (Object.keys(pessoaPayload).length > 0) {
          const { error: errPessoa } = await supabase.from('pessoas').update(pessoaPayload).eq('id', resolvedPessoaId)
          if (errPessoa) throw errPessoa
          if (usuario?.id && usuario?.empresa_id) {
            await supabase.from('pessoas_alteracoes').insert({
              pessoa_id: resolvedPessoaId,
              empresa_id: usuario.empresa_id,
              usuario_id: usuario.id,
              campos_alterados: Object.keys(pessoaPayload),
              valores_anteriores: {},
              valores_novos: pessoaPayload,
              origem: 'processos',
            })
          }
        }
        // Cônjuge do vendedor: o serviço (editarNoNegocio) já registrou — Pessoa própria + casamento.
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'vendedores'] })
      queryClient.invalidateQueries({ queryKey: ['processos', processoId] })
      toast.success('Vendedor atualizado.', { className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary' })
    },
    onError: (e: Error) => toast.error(e?.message || 'Erro ao atualizar vendedor.'),
  })
}

export function useRemoverVendedor(processoId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vendedorId: string) => {
      await removerDoNegocio(processoId, 'vendedores', vendedorId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'vendedores'] })
      queryClient.invalidateQueries({ queryKey: ['processos', processoId] })
    },
    onError: (e: Error) => toast.error(e?.message || 'Erro ao remover vendedor.'),
  })
}
