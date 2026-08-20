'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type ProcessoFaseHistorico } from '@/types/processos'
import { dadosFinanceirosIncompletos } from '@/lib/processos/validacaoFinanceira'
import { toast } from 'sonner'

export function useProcessoFasesHistorico(processoId: string) {
  return useQuery({
    queryKey: ['processos', processoId, 'fases-historico'],
    queryFn: async (): Promise<ProcessoFaseHistorico[]> => {
      const { data, error } = await supabase
        .from('processo_fases_historico')
        .select('*, fase:fases!fase_id(id, nome, cor), usuario:usuarios!usuario_id(nome)')
        .eq('processo_id', processoId)
        .order('entrou_em', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!processoId,
  })
}

interface MoverFaseArgs {
  processoId: string
  faseId: string
  observacao?: string
  retrocedendo?: boolean
  usuarioId: string
  empresaId: string
}

async function moverFaseProcesso({ processoId, faseId, observacao, retrocedendo, usuarioId, empresaId }: MoverFaseArgs) {
  // Trava obrigatória (não só client-side): não avança fase com dados
  // financeiros incompletos/inconsistentes, seja qual for o caminho de
  // chamada (pipeline bar, aba de fases, Kanban, etc). Retrocesso não exige
  // dados que a fase de destino (anterior) nunca chegou a pedir.
  let proc: { modalidade: string } | null = null
  if (!retrocedendo) {
    const { data: procData, error: procFetchError } = await supabase
      .from('processos')
      .select('modalidade, banco_id, taxa_juros, sistema_amortizacao, valor_imovel, valor_financiado, valor_fgts')
      .eq('id', processoId)
      .single()
    if (procFetchError) throw procFetchError
    proc = procData
    // Contrato e Consórcio não usam os campos financeiros de financiamento
    // (taxa_juros, sistema_amortizacao, valor_financiado etc. não fazem
    // sentido pro modelo de cotas do Consórcio) — fases ficam livres pra
    // avançar, limitadas só pelos itens obrigatórios do checklist da fase.
    if (procData.modalidade !== 'Contrato' && procData.modalidade !== 'Consorcio' && dadosFinanceirosIncompletos(procData)) {
      throw new Error('DADOS_FINANCEIROS_PENDENTES')
    }
  }

  // 1. Registrar no histórico
  const { error: histError } = await supabase
    .from('processo_fases_historico')
    .insert({
      processo_id: processoId,
      empresa_id: empresaId,
      fase_id: faseId,
      usuario_id: usuarioId,
      observacao: observacao ?? null,
    })
  if (histError) throw histError

  // 2. Atualizar fase atual no processo — retrocesso sem processos.retroceder_fase
  // é barrado aqui pelo trigger fn_bloquear_retrocesso_fase_sem_permissao (42501).
  const { error: procError } = await supabase
    .from('processos')
    .update({ fase_atual_id: faseId })
    .eq('id', processoId)
  if (procError) throw procError

  // 3. Consórcio: fase marcada como final do módulo (fases.e_fase_final_consorcio)
  // dispara a geração do fluxo financeiro (N parcelas a receber da empresa + N a
  // pagar ao comercial, por cota ativa) — ver gerar_fluxo_financeiro_consorcio
  // (migration 262). Retrocesso nunca dispara; ON CONFLICT DO NOTHING no RPC
  // também protege contra gerar duas vezes se o processo passar pela fase de novo.
  if (!retrocedendo && proc?.modalidade === 'Consorcio') {
    const { data: fase } = await supabase
      .from('fases')
      .select('e_fase_final_consorcio')
      .eq('id', faseId)
      .single()
    if (fase?.e_fase_final_consorcio) {
      const { error: rpcError } = await supabase.rpc('gerar_fluxo_financeiro_consorcio', { p_processo_id: processoId })
      if (rpcError) throw rpcError
    }
  }
}

function mensagemErroMoverFase(err: Error) {
  if (err.message === 'DADOS_FINANCEIROS_PENDENTES') {
    toast.error('Existem informações financeiras obrigatórias pendentes.', {
      description: 'Complete os Dados do Negócio para continuar.',
    })
    return
  }
  if (err.message.includes('Sem permissão para retroceder')) {
    toast.error('Você não tem permissão para retroceder a fase deste processo.')
    return
  }
  toast.error('Erro ao avançar fase.')
}

export function useAvancarFase(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async ({ faseId, observacao, retrocedendo }: { faseId: string; observacao?: string; retrocedendo?: boolean }) =>
      moverFaseProcesso({ processoId, faseId, observacao, retrocedendo, usuarioId: usuario!.id, empresaId: usuario!.empresa_id }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId] })
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'fases-historico'] })
      toast.success(
        variables.retrocedendo ? 'Fase retrocedida com sucesso.' : 'Fase avançada com sucesso.',
        { className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary' },
      )
    },
    onError: mensagemErroMoverFase,
  })
}

// Usado pelo Kanban de Negócios (VisaoCards): mesma lógica de useAvancarFase,
// mas sem processoId fixo no hook — o Kanban lida com vários processos ao
// mesmo tempo, então o id vem por chamada (mutate), não por instância do hook.
export function useMoverProcessoKanban() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (args: { processoId: string; faseId: string; observacao?: string; retrocedendo?: boolean }) =>
      moverFaseProcesso({ ...args, usuarioId: usuario!.id, empresaId: usuario!.empresa_id }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['processos'] })
      toast.success(
        variables.retrocedendo ? 'Fase retrocedida com sucesso.' : 'Fase avançada com sucesso.',
        { className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary' },
      )
    },
    onError: mensagemErroMoverFase,
  })
}