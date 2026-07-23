'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type Processo, type StatusProcesso } from '@/types/processos'

export type ProdutoFiltro = 'todos' | 'consorcio' | 'cgi' | 'financiamento' | 'contrato' | 'registro'

const FINANCIAMENTO_MODALIDADES = ['SFI', 'SBPE', 'PMCMV', 'Pro_Cotista', 'CGI']

interface FiltrosProcessos {
  status?: StatusProcesso | 'todos'
  produto?: ProdutoFiltro
  busca?: string
  chance?: 'certeza' | 'incerteza' | 'todos'
  responsavelId?: string
}

export function useProcessos(filtros: FiltrosProcessos = {}) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['processos', usuario?.empresa_id, filtros],
    queryFn: async (): Promise<Processo[]> => {
      let query = supabase
        .from('processos')
        .select(`
          *,
          banco:bancos!banco_id(id, nome),
          operacional:usuarios!operacional_id(id, nome, email),
          comercial:usuarios!comercial_id(id, nome, email),
          fase_atual:fases!fase_atual_id(id, nome, cor),
          compradores:processo_compradores(nome, cpf, principal),
          vendedores:processo_vendedores(id, nome, cpf),
          corretores:processo_corretores(id, papel, principal, corretor:corretores(id, nome)),
          imobiliarias:processo_imobiliarias(id, papel, imobiliaria:imobiliarias(id, nome)),
          parceiro:parceiros!parceiro_id(id, nome, tipo_parceiro, imobiliaria)
        `)
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (filtros.status && filtros.status !== 'todos') {
        query = query.eq('status_processo', filtros.status)
      }

      if (filtros.produto && filtros.produto !== 'todos') {
        if (filtros.produto === 'financiamento') {
          query = query.in('modalidade', FINANCIAMENTO_MODALIDADES)
        } else if (filtros.produto === 'consorcio') {
          query = query.eq('modalidade', 'Consorcio')
        } else if (filtros.produto === 'cgi') {
          query = query.eq('modalidade', 'CGI')
        } else if (filtros.produto === 'contrato') {
          query = query.eq('modalidade', 'Contrato')
        } else if (filtros.produto === 'registro') {
          query = query.eq('modalidade', 'Registro')
        }
      }

      if (filtros.chance && filtros.chance !== 'todos') {
        query = query.eq('chance_emissao', filtros.chance)
      }

      if (filtros.busca) {
        query = query.or(
          `nome_imovel.ilike.%${filtros.busca}%,numero_processo.ilike.%${filtros.busca}%`
        )
      }

      if (filtros.responsavelId) {
        query = query.or(
          `comercial_id.eq.${filtros.responsavelId},operacional_id.eq.${filtros.responsavelId}`
        )
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
    enabled: !!usuario,
  })
}

export function useProcesso(processoId: string) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['processos', processoId],
    queryFn: async (): Promise<Processo> => {
      const { data, error } = await supabase
        .from('processos')
        .select(`
          *,
          banco:bancos!banco_id(id, nome),
          operacional:usuarios!operacional_id(id, nome, email),
          comercial:usuarios!comercial_id(id, nome, email),
          juridico:usuarios!juridico_id(id, nome, email),
          fase_atual:fases!fase_atual_id(id, nome, cor),
          compradores:processo_compradores(id, nome, cpf, telefone, principal, pessoa_id),
          vendedores:processo_vendedores(id, nome, cpf),
          parceiro:parceiros!parceiro_id(id, nome, tipo_parceiro, imobiliaria)
        `)
        .eq('id', processoId)
        .eq('empresa_id', usuario!.empresa_id)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!usuario && !!processoId,
  })
}

export function useAtualizarChanceEmissao() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      processoId,
      chance_emissao,
    }: {
      processoId: string
      chance_emissao: 'certeza' | 'incerteza'
    }) => {
      const { error } = await supabase
        .from('processos')
        .update({ chance_emissao })
        .eq('id', processoId)
        .eq('empresa_id', usuario!.empresa_id)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['processos', vars.processoId] })
    },
  })
}

export interface DadosProcessoUpdate {
  processoId: string
  banco_id: string | null
  modalidade?: string
  taxa_juros?: number | null
  tem_assessoria: boolean
  valor_assessoria: number | null
  valor_financiado: number | null
  valor_entrada?: number | null
  valor_imovel: number | null
  valor_fgts?: number | null
  valor_recursos_proprios?: number | null
  comissao_comercial?: number | null
  comissao_empresa?: number | null
  prazo_amortizacao_meses?: number | null
  dia_vencimento_parcela?: number | null
  sistema_amortizacao?: string | null
  indexador?: string | null
  financiar_despesas_cartorariais?: boolean
  numero_proposta?: string | null
}

export function useAtualizarDadosProcesso() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ processoId, ...campos }: DadosProcessoUpdate) => {
      const { error } = await supabase
        .from('processos')
        .update(campos)
        .eq('id', processoId)
        .eq('empresa_id', usuario!.empresa_id)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['processos', vars.processoId] })
      qc.invalidateQueries({ queryKey: ['processos'] })
    },
  })
}

export function useAtualizarResponsaveis() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      processoId,
      comercial_id,
      operacional_id,
      juridico_id,
    }: {
      processoId: string
      comercial_id: string | null
      operacional_id: string | null
      juridico_id: string | null
    }) => {
      const { error } = await supabase
        .from('processos')
        .update({ comercial_id, operacional_id, juridico_id })
        .eq('id', processoId)
        .eq('empresa_id', usuario!.empresa_id)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['processos', vars.processoId] })
    },
  })
}

export interface ImovelProcessoUpdate {
  processoId: string
  imovel_id: string | null
  imovel_matricula?: string | null
  imovel_tipo?: string | null
  imovel_categoria?: string | null
  imovel_area_construida?: number | null
  imovel_area_terreno?: number | null
  imovel_rua?: string | null
  imovel_numero?: string | null
  imovel_complemento?: string | null
  imovel_bairro?: string | null
  imovel_cidade?: string | null
  imovel_uf?: string | null
  imovel_registro_id?: string | null
  nome_imovel?: string | null
  valor_imovel?: number | null
}

export function useAtualizarImovelProcesso() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ processoId, ...campos }: ImovelProcessoUpdate) => {
      const { error } = await supabase
        .from('processos')
        .update(campos)
        .eq('id', processoId)
        .eq('empresa_id', usuario!.empresa_id)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['processos', vars.processoId] })
      qc.invalidateQueries({ queryKey: ['processos'] })
    },
  })
}