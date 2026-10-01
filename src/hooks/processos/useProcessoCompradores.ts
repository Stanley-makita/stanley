'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type ProcessoComprador } from '@/types/processos'
import { toast } from 'sonner'
import { editarNoNegocio, incluirNoNegocio, removerDoNegocio } from '@/lib/participantes/negocioCliente'

export function useProcessoCompradores(processoId: string) {
  return useQuery({
    queryKey: ['processos', processoId, 'compradores'],
    queryFn: async (): Promise<ProcessoComprador[]> => {
      const { data, error } = await supabase
        .from('processo_compradores')
        .select('*, pessoa:pessoas(rg, registro_cnh, profissao, nacionalidade, data_nascimento, data_emissao, orgao_emissor, estado_civil, regime_casamento, data_casamento, conjuge_nome, conjuge_cpf, conjuge_data_nascimento, endereco_rua, endereco_numero, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep)')
        .eq('processo_id', processoId)
        .order('principal', { ascending: false })
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!processoId,
  })
}


export function useAdicionarComprador(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (input: Omit<ProcessoComprador, 'id' | 'processo_id' | 'empresa_id' | 'created_at' | 'updated_at'>) => {
      // V2 (B2c-C1c): pelo serviço único (vincula a Pessoa pelo CPF no servidor)
      await incluirNoNegocio(processoId, 'compradores', input as Record<string, unknown>)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'compradores'] })
      queryClient.invalidateQueries({ queryKey: ['processos', processoId] })
      toast.success('Comprador adicionado.', { className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary' })
    },
    onError: (e: Error) => toast.error(e?.message || 'Erro ao adicionar comprador.'),
  })
}

export function useEditarComprador(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async ({ id, pessoa_id, telefone, ...input }: Partial<ProcessoComprador> & { id: string; pessoa_id?: string | null }) => {
      // V2 (B2c-C1c): linha pelo serviço único; ele vincula a Pessoa pelo CPF se ainda não houver
      const r = await editarNoNegocio(processoId, 'compradores', id, input as Record<string, unknown>)
      const resolvedPessoaId = pessoa_id ?? r.pessoa_id ?? null

      // Telefone vai por RPC própria (qualquer usuário ativo pode corrigir,
      // não só analista/gerente/gestor/admin — a policy de UPDATE desta
      // tabela é restrita a esses perfis, mas telefone é algo que o time
      // inteiro precisa poder corrigir). Sem pessoa_id vinculado, cai no
      // fallback de sempre (grava só aqui, sujeito à mesma restrição de perfil).
      if (telefone !== undefined) {
        const telefoneVal = telefone?.trim() || ''
        if (resolvedPessoaId && telefoneVal) {
          const { error: errTel } = await supabase.rpc('atualizar_telefone_pessoa', {
            p_pessoa_id: resolvedPessoaId,
            p_telefone: telefoneVal,
            p_origem: 'processos',
          })
          if (errTel) throw errTel
        } else {
          await editarNoNegocio(processoId, 'compradores', id, { telefone: telefoneVal || null })
        }
      }

      // Sincronizar campos compartilhados com pessoas
      if (resolvedPessoaId) {
        const pessoaPayload: Record<string, unknown> = {}
        if (input.nome  !== undefined) pessoaPayload.nome  = input.nome
        if (input.cpf   !== undefined) pessoaPayload.cpf   = input.cpf || null
        if (input.email !== undefined) pessoaPayload.email = input.email || null

        if (Object.keys(pessoaPayload).length > 0) {
          await supabase.from('pessoas').update(pessoaPayload).eq('id', resolvedPessoaId)

          // Propagar para leads vinculados
          await supabase.from('leads')
            .update(pessoaPayload)
            .eq('pessoa_id', resolvedPessoaId)
            .eq('empresa_id', usuario!.empresa_id)

          if (usuario?.id && usuario?.empresa_id) {
            await supabase.from('pessoas_alteracoes').insert({
              pessoa_id:          resolvedPessoaId,
              empresa_id:         usuario.empresa_id,
              usuario_id:         usuario.id,
              campos_alterados:   Object.keys(pessoaPayload),
              valores_anteriores: {},
              valores_novos:      pessoaPayload,
              origem:             'processos',
            })
          }
        }
      }
    },
    onSuccess: () => {
      // Invalida compradores E o processo (cujo título lê compradores via JOIN)
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'compradores'] })
      queryClient.invalidateQueries({ queryKey: ['processos', processoId] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success('Comprador atualizado.', { className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary' })
    },
    onError: (e: Error) => toast.error(e?.message || 'Erro ao atualizar comprador.'),
  })
}

export function useRemoverComprador(processoId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (compradorId: string) => {
      await removerDoNegocio(processoId, 'compradores', compradorId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'compradores'] })
      queryClient.invalidateQueries({ queryKey: ['processos', processoId] })
    },
    onError: (e: Error) => toast.error(e?.message || 'Erro ao remover comprador.'),
  })
}
