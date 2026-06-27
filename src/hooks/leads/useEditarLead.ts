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
  conjuge_renda_formal?: number | null
  conjuge_renda_informal?: number | null
  renda_formal?: number | null
  renda_informal?: number | null
  vendedor_nome?: string | null
  vendedor_cpf?: string | null
  vendedor_telefone?: string | null
  vendedor_pessoa_id?: string | null
  produto_interesse?: Lead['produto_interesse'] | null
  responsavel_id?: string
  responsavel_operacional_id?: string | null
  fase_id?: string
  origem?: Lead['origem']
  valor_pretendido?: number | null
  observacoes?: string | null
  // Crédito
  banco_pretendido?: string | null
  valor_imovel?: number | null
  entrada?: number | null
  prazo_meses?: number | null
  finalidade?: string | null
  tipo_imovel?: string | null
  cidade_imovel?: string | null
  renda_considerada?: number | null
  status_analise?: Lead['status_analise']
  status_id?: string | null
  // Captação / campanha
  canal?: string | null
  campanha?: string | null
  produto_subtipo?: string | null
  parceiro_id?: string | null
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
          // Buscar dados atuais da pessoa para calcular diff real no audit
          const { data: pessoaAtual } = await supabase
            .from('pessoas')
            .select('nome,email,cpf,data_nascimento,rg,profissao,estado_civil,renda_formal,renda_informal,conjuge_nome,conjuge_cpf,conjuge_data_nascimento,regime_casamento')
            .eq('id', data.pessoa_id)
            .single()

          await supabase.from('pessoas').update(pessoaPayload).eq('id', data.pessoa_id)

          // Propagar nome/cpf/email para compradores e vendedores vinculados
          const compradorPayload: Record<string, unknown> = {}
          if (pessoaPayload.nome  !== undefined) compradorPayload.nome  = pessoaPayload.nome
          if (pessoaPayload.cpf   !== undefined) compradorPayload.cpf   = pessoaPayload.cpf
          if (pessoaPayload.email !== undefined) compradorPayload.email  = pessoaPayload.email
          if (Object.keys(compradorPayload).length > 0) {
            await supabase.from('processo_compradores')
              .update(compradorPayload).eq('pessoa_id', data.pessoa_id)
            await supabase.from('processo_vendedores')
              .update(compradorPayload).eq('pessoa_id', data.pessoa_id)
          }

          // Registrar auditoria — só campos que realmente mudaram
          const anteriores: Record<string, unknown> = {}
          const novos: Record<string, unknown> = {}
          const camposAlterados: string[] = []
          for (const [campo, novoValor] of Object.entries(pessoaPayload)) {
            const anteriorValor = (pessoaAtual as Record<string, unknown> | null)?.[campo] ?? null
            const anteriorStr = anteriorValor != null ? String(anteriorValor) : null
            const novoStr = novoValor != null ? String(novoValor) : null
            if (anteriorStr !== novoStr) {
              camposAlterados.push(campo)
              anteriores[campo] = anteriorValor
              novos[campo] = novoValor
            }
          }

          if (camposAlterados.length > 0 && usuario?.id && usuario?.empresa_id) {
            await supabase.from('pessoas_alteracoes').insert({
              pessoa_id: data.pessoa_id,
              empresa_id: usuario.empresa_id,
              usuario_id: usuario.id,
              campos_alterados: camposAlterados,
              valores_anteriores: anteriores,
              valores_novos: novos,
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
        // Invalidar processos (o título lê compradores via JOIN)
        queryClient.invalidateQueries({ queryKey: ['processos'] })
      }

      toast.success('Lead atualizado.', {
        className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary',
      })
    },
    onError: (err: any) => {
      console.error('Erro ao editar lead:', err)
      toast.error(`Erro ao salvar: ${err?.message ?? 'Tente novamente'}`)
    },
  })
}