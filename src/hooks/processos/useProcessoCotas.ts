'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { toast } from 'sonner'

export type StatusCota = 'ativo' | 'contemplado' | 'cancelado' | 'substituido'
// 'quitado' = a COTA INTEIRA quitada (fim do consórcio), não "parcela do mês
// em dia" — a UI precisa rotular como "Cota quitada" pra não confundir com
// pagamento mensal em dia.
export type StatusPagamentoCota = 'em_dia' | 'atrasado' | 'quitado'

export interface ProcessoCota {
  id: string
  empresa_id: string
  processo_id: string
  administradora_nome: string | null
  grupo: string | null
  cota: string | null
  tipo_bem: string | null
  tipo_parcela: 'linear' | 'reduzida'
  data_pagamento_boleto: string | null
  valor_carta: number | null
  valor_parcela: number | null
  parcela_reduzida_percentual: number | null
  prazo_cota_meses: number | null
  prazo_grupo_meses: number | null
  status_cota: StatusCota
  status_pagamento: StatusPagamentoCota
  data_adesao: string | null
  data_vencimento: string | null
  proxima_assembleia_em: string | null
  informacao_adicional: string | null
  created_at: string
  updated_at: string
}

function identificacaoCota(cota: Pick<ProcessoCota, 'grupo' | 'cota'>): string {
  if (cota.grupo && cota.cota) return `grupo ${cota.grupo} / cota ${cota.cota}`
  if (cota.grupo) return `grupo ${cota.grupo}`
  if (cota.cota) return `cota ${cota.cota}`
  return 'sem identificação'
}

async function registrarEventoCota(processoId: string, empresaId: string, texto: string) {
  await supabase.from('processo_comentarios').insert({
    empresa_id: empresaId,
    processo_id: processoId,
    usuario_id: null,
    tipo: 'alteracao',
    texto,
    notificar_cliente: false,
  })
}

export function useProcessoCotas(processoId: string) {
  return useQuery({
    queryKey: ['processos', processoId, 'cotas'],
    queryFn: async (): Promise<ProcessoCota[]> => {
      const { data, error } = await supabase
        .from('processo_cotas')
        .select('*')
        .eq('processo_id', processoId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!processoId,
  })
}

export function useAdicionarCota(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (input: Omit<ProcessoCota, 'id' | 'processo_id' | 'empresa_id' | 'created_at' | 'updated_at' | 'status_cota' | 'status_pagamento'> & {
      status_cota?: StatusCota
      status_pagamento?: StatusPagamentoCota
    }) => {
      const { data, error } = await supabase
        .from('processo_cotas')
        .insert({ ...input, processo_id: processoId, empresa_id: usuario!.empresa_id })
        .select('*')
        .single()
      if (error) throw error
      return data as ProcessoCota
    },
    onSuccess: async (cota) => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'cotas'] })
      await registrarEventoCota(processoId, usuario!.empresa_id, `Cota adicionada (${identificacaoCota(cota)}).`)
      toast.success('Cota adicionada.', { className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary' })
    },
    onError: () => toast.error('Erro ao adicionar cota.'),
  })
}

// Edição de dados da cota que NÃO muda status_cota (valor, prazo, datas,
// administradora etc.) — correção de dado rotineira, sem evento na Timeline.
export function useEditarCota(processoId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<Omit<ProcessoCota, 'status_cota'>> & { id: string }) => {
      const { error } = await supabase.from('processo_cotas').update(input).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'cotas'] })
      toast.success('Cota atualizada.', { className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary' })
    },
    onError: () => toast.error('Erro ao atualizar cota.'),
  })
}

// Mudança de status_cota (ativo → contemplado/cancelado/substituido) — a
// única ação que registra evento na Timeline, um por chamada.
export function useAlterarStatusCota(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (payload: { cota: ProcessoCota; novoStatus: StatusCota }) => {
      const { error } = await supabase
        .from('processo_cotas')
        .update({ status_cota: payload.novoStatus })
        .eq('id', payload.cota.id)
      if (error) throw error
      return payload
    },
    onSuccess: async ({ cota, novoStatus }) => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'cotas'] })
      const rotulo: Record<StatusCota, string> = {
        ativo: 'reativada', contemplado: 'contemplada', cancelado: 'cancelada', substituido: 'substituída',
      }
      await registrarEventoCota(processoId, usuario!.empresa_id, `Cota ${identificacaoCota(cota)} ${rotulo[novoStatus]}.`)
      toast.success('Status da cota atualizado.', { className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary' })
    },
    onError: () => toast.error('Erro ao atualizar status da cota.'),
  })
}

// Apaga as parcelas ainda 'prevista' do processo e chama de novo
// gerar_fluxo_financeiro_consorcio — usado quando a config/dados da cota
// mudam depois da primeira geração (ON CONFLICT DO NOTHING trava
// re-geração automática). RPC bloqueia se já existir parcela recebida/paga.
export function useRecalcularFluxoConsorcio(processoId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('recalcular_fluxo_financeiro_consorcio', { p_processo_id: processoId })
      if (error) throw error
      return data as number
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'consorcio_receber'] })
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'consorcio_comercial_pagar'] })
      toast.success(
        count > 0
          ? 'Fluxo financeiro recalculado.'
          : 'Nenhuma parcela gerada — confira se há cota ativa com valor de carta.'
      )
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao recalcular fluxo financeiro.'),
  })
}

// DELETE físico de verdade — só pra cadastro feito por engano e nunca usado
// (histórico financeiro de cota não deve ser apagado; ver useAlterarStatusCota
// pra 'cancelado'/'substituido' em qualquer outro caso). RLS já restringe a
// perfil gerente/admin; a UI que chama isso precisa pedir confirmação forte.
export function useExcluirCotaEngano(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (cota: ProcessoCota) => {
      const { error } = await supabase.from('processo_cotas').delete().eq('id', cota.id)
      if (error) throw error
      return cota
    },
    onSuccess: async (cota) => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'cotas'] })
      await registrarEventoCota(processoId, usuario!.empresa_id, `Cota (${identificacaoCota(cota)}) removida — cadastrada por engano.`)
      toast.success('Cota removida.')
    },
    onError: () => toast.error('Erro ao remover cota.'),
  })
}
