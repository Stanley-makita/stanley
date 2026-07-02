'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import type { SimuladorItbiConfig, SimuladorCustasConfig, SimuladorConfigGeral } from '@/types/simulador'
import { SIMULADOR_CONFIG_DEFAULTS } from '@/types/simulador'

// ── ITBI config ──────────────────────────────────────────────────────────────
export function useItbiConfig() {
  return useQuery({
    queryKey: ['simulador-itbi-config'],
    queryFn: async (): Promise<SimuladorItbiConfig[]> => {
      const { data, error } = await supabase
        .from('simulador_itbi_config')
        .select('*')
        .eq('ativo', true)
        .order('municipio')
      if (error) throw error
      return (data ?? []).map((r) => ({
        municipio: r.municipio,
        aliquota: Number(r.aliquota),
        temDesconto: r.tem_desconto,
        aliquotaDesconto: r.aliquota_desconto ? Number(r.aliquota_desconto) : undefined,
        limiteDesconto: r.limite_desconto ? Number(r.limite_desconto) : undefined,
        formulaComDesconto: (r.formula_com_desconto as 'percentual' | 'composta' | null) ?? 'percentual',
        aliquotaDescontoFinanciado: r.aliquota_desconto_financiado ? Number(r.aliquota_desconto_financiado) : undefined,
        excecaoPrimeiraAquisicao: r.excecao_primeira_aquisicao ?? false,
      }))
    },
  })
}

// ── Tarifas por banco ─────────────────────────────────────────────────────────
export function useCustasConfig() {
  return useQuery({
    queryKey: ['simulador-custas-config'],
    queryFn: async (): Promise<SimuladorCustasConfig[]> => {
      const { data, error } = await supabase
        .from('simulador_custas_config')
        .select('id, banco_nome, tipo, valor')
        .eq('ativo', true)
        .order('banco_nome')
        .order('tipo')
      if (error) throw error
      return (data ?? []).map((r) => ({
        id:        r.id,
        bancoNome: r.banco_nome,
        tipo:      (r.tipo ?? 'residencial') as 'residencial' | 'comercial',
        valor:     Number(r.valor ?? 0),
      }))
    },
  })
}

// ── Config geral ──────────────────────────────────────────────────────────────
export function useConfigGeral() {
  return useQuery({
    queryKey: ['simulador-config-geral'],
    queryFn: async (): Promise<SimuladorConfigGeral> => {
      const { data, error } = await supabase
        .from('simulador_config_geral')
        .select('chave, valor')
      if (error) throw error

      const map: Record<string, number> = {}
      for (const row of data ?? []) {
        map[row.chave] = Number(row.valor)
      }

      return {
        funrejus_percentual: map.funrejus_percentual ?? SIMULADOR_CONFIG_DEFAULTS.funrejus_percentual,
        funrejus_minimo: map.funrejus_minimo ?? SIMULADOR_CONFIG_DEFAULTS.funrejus_minimo,
        funrejus_maximo: map.funrejus_maximo ?? SIMULADOR_CONFIG_DEFAULTS.funrejus_maximo,
        registro_percentual: map.registro_percentual ?? SIMULADOR_CONFIG_DEFAULTS.registro_percentual,
        iof_percentual: map.iof_percentual ?? SIMULADOR_CONFIG_DEFAULTS.iof_percentual,
        engenharia_caixa: map.engenharia_caixa ?? SIMULADOR_CONFIG_DEFAULTS.engenharia_caixa,
        reciprocidade_r1_limite: map.reciprocidade_r1_limite ?? SIMULADOR_CONFIG_DEFAULTS.reciprocidade_r1_limite,
        reciprocidade_r1_valor:  map.reciprocidade_r1_valor  ?? SIMULADOR_CONFIG_DEFAULTS.reciprocidade_r1_valor,
        reciprocidade_r2_limite: map.reciprocidade_r2_limite ?? SIMULADOR_CONFIG_DEFAULTS.reciprocidade_r2_limite,
        reciprocidade_r2_valor:  map.reciprocidade_r2_valor  ?? SIMULADOR_CONFIG_DEFAULTS.reciprocidade_r2_valor,
        reciprocidade_r3_limite: map.reciprocidade_r3_limite ?? SIMULADOR_CONFIG_DEFAULTS.reciprocidade_r3_limite,
        reciprocidade_r3_valor:  map.reciprocidade_r3_valor  ?? SIMULADOR_CONFIG_DEFAULTS.reciprocidade_r3_valor,
        reciprocidade_r4_limite: map.reciprocidade_r4_limite ?? SIMULADOR_CONFIG_DEFAULTS.reciprocidade_r4_limite,
        reciprocidade_r4_valor:  map.reciprocidade_r4_valor  ?? SIMULADOR_CONFIG_DEFAULTS.reciprocidade_r4_valor,
        reciprocidade_r5_limite: map.reciprocidade_r5_limite ?? SIMULADOR_CONFIG_DEFAULTS.reciprocidade_r5_limite,
        reciprocidade_r5_valor:  map.reciprocidade_r5_valor  ?? SIMULADOR_CONFIG_DEFAULTS.reciprocidade_r5_valor,
        reciprocidade_r6_limite: map.reciprocidade_r6_limite ?? SIMULADOR_CONFIG_DEFAULTS.reciprocidade_r6_limite,
        reciprocidade_r6_valor:  map.reciprocidade_r6_valor  ?? SIMULADOR_CONFIG_DEFAULTS.reciprocidade_r6_valor,
        reciprocidade_r7_valor:  map.reciprocidade_r7_valor  ?? SIMULADOR_CONFIG_DEFAULTS.reciprocidade_r7_valor,
      }
    },
  })
}

// ── Salvar config geral (upsert) ──────────────────────────────────────────────
export function useSalvarConfigGeral() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (cfg: Partial<SimuladorConfigGeral>) => {
      const rows = Object.entries(cfg).map(([chave, valor]) => ({
        empresa_id: usuario!.empresa_id,
        chave,
        valor,
        updated_at: new Date().toISOString(),
      }))
      const { error } = await supabase
        .from('simulador_config_geral')
        .upsert(rows, { onConflict: 'empresa_id,chave' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['simulador-config-geral'] }),
    onError: (e: Error) => toast.error(e.message ?? 'Erro ao salvar configuração'),
  })
}

// ── CRUD tarifas ──────────────────────────────────────────────────────────────
export function useSalvarTarifaBanco() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (payload: {
      id?: string
      bancoNome: string
      tipo: 'residencial' | 'comercial'
      valor: number
    }) => {
      const row = {
        empresa_id: usuario!.empresa_id,
        banco_nome: payload.bancoNome,
        tipo:       payload.tipo,
        valor:      payload.valor,
        updated_at: new Date().toISOString(),
      }
      if (payload.id) {
        const { error } = await supabase.from('simulador_custas_config').update(row).eq('id', payload.id)
        if (error) throw error
      } else {
        // ativo: true reativa uma tarifa previamente excluída (soft-delete) do mesmo
        // banco+tipo — sem isso, o upsert "sucede" mas a linha some da lista (que
        // filtra ativo=true), indistinguível de "nada aconteceu" ao salvar.
        const { error } = await supabase
          .from('simulador_custas_config')
          .upsert({ ...row, ativo: true }, { onConflict: 'empresa_id,banco_nome,tipo' })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['simulador-custas-config'] }),
    onError: (e: Error) => toast.error(e.message ?? 'Erro ao salvar tarifa'),
  })
}

export function useExcluirTarifaBanco() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('simulador_custas_config')
        .update({ ativo: false, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['simulador-custas-config'] }),
    onError: (e: Error) => toast.error(e.message ?? 'Erro ao excluir tarifa'),
  })
}

// ── CRUD ITBI ─────────────────────────────────────────────────────────────────
export function useSalvarItbi() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (payload: SimuladorItbiConfig & { id?: string }) => {
      const row = {
        empresa_id: usuario!.empresa_id,
        municipio: payload.municipio,
        aliquota: payload.aliquota,
        tem_desconto: payload.temDesconto,
        aliquota_desconto: payload.aliquotaDesconto ?? null,
        limite_desconto: payload.limiteDesconto ?? null,
        formula_com_desconto: payload.formulaComDesconto ?? 'percentual',
        aliquota_desconto_financiado: payload.aliquotaDescontoFinanciado ?? null,
        excecao_primeira_aquisicao: payload.excecaoPrimeiraAquisicao ?? false,
        updated_at: new Date().toISOString(),
      }
      if (payload.id) {
        const { error } = await supabase.from('simulador_itbi_config').update(row).eq('id', payload.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('simulador_itbi_config').insert(row)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['simulador-itbi-config'] }),
    onError: (e: Error) => toast.error(e.message ?? 'Erro ao salvar alíquota'),
  })
}
