'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type RelatorioComercial } from '@/types/financeiro'

const STATUS_SNAPSHOT = ['aprovado', 'pago', 'travado']

function vazio(comercial_id: string, comercial_nome: string): RelatorioComercial {
  return { comercial_id, comercial_nome, num_contratos: 0, valor_emitido: 0, comissao_gerada: 0, comissao_recebida: 0 }
}

// Reescrita depois de várias tentativas via RPC (calcular_producao_comercial_mes
// chamada de dentro de outra função SECURITY DEFINER sempre zerava a comissão
// por um motivo nunca 100% isolado, mesmo após corrigir o bug real encontrado
// — "record not assigned yet" no piso/teto de faixa). Em vez de depender de
// uma função SQL agregando tudo, busca os dados brutos (mesmo mecanismo já
// comprovado correto na tabela de Negócios > Financiamento — a computed
// column comissao_comercial_calculada) e agrega no client, sem RPC nenhuma.
export function useRelatorioEquipe(mes: number, ano: number) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'relatorio-equipe', usuario?.empresa_id, mes, ano],
    queryFn: async (): Promise<RelatorioComercial[]> => {
      const empresaId = usuario!.empresa_id

      const { data: fechamento } = await supabase
        .from('financeiro_fechamentos')
        .select('id, status')
        .eq('empresa_id', empresaId)
        .eq('competencia_mes', mes)
        .eq('competencia_ano', ano)
        .maybeSingle()

      const snapshot = !!fechamento && STATUS_SNAPSHOT.includes(fechamento.status)

      if (snapshot) {
        const { data: fps, error: erroFps } = await supabase
          .from('financeiro_fechamento_processos')
          .select('comercial_id, valor_financiado, comercial:usuarios!comercial_id(nome)')
          .eq('fechamento_id', fechamento!.id)
          .not('comercial_id', 'is', null)
        if (erroFps) throw erroFps

        const { data: comissoes, error: erroComissoes } = await supabase
          .from('financeiro_comissoes_pagar')
          .select('usuario_id, valor_final, status')
          .eq('fechamento_id', fechamento!.id)
          .eq('papel', 'comercial')
        if (erroComissoes) throw erroComissoes

        const mapa = new Map<string, RelatorioComercial>()
        for (const fp of fps ?? []) {
          if (!fp.comercial_id) continue
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const nome = (fp as any).comercial?.nome ?? '—'
          const atual = mapa.get(fp.comercial_id) ?? vazio(fp.comercial_id, nome)
          atual.num_contratos += 1
          atual.valor_emitido += fp.valor_financiado ?? 0
          mapa.set(fp.comercial_id, atual)
        }
        for (const c of comissoes ?? []) {
          if (!c.usuario_id) continue
          const atual = mapa.get(c.usuario_id)
          if (!atual) continue
          atual.comissao_gerada += c.valor_final
          if (c.status === 'paga') atual.comissao_recebida += c.valor_final
        }
        return Array.from(mapa.values()).sort((a, b) => b.comissao_gerada - a.comissao_gerada)
      }

      const inicioMes = `${ano}-${String(mes).padStart(2, '0')}-01`
      const ultimoDia = new Date(ano, mes, 0).getDate()
      const fimMes = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`

      const { data: processos, error } = await supabase
        .from('processos')
        .select(`
          id, comercial_id, modalidade, valor_financiado, valor_contrato,
          comissao_comercial_calculada,
          comercial:usuarios!comercial_id(nome)
        `)
        .eq('empresa_id', empresaId)
        .eq('status_emissao', 'emitido')
        .neq('modalidade', 'Consorcio')
        .not('comercial_id', 'is', null)
        .not('data_emissao', 'is', null)
        .gte('data_emissao', inicioMes)
        .lte('data_emissao', fimMes)
      if (error) throw error

      const mapa = new Map<string, RelatorioComercial>()
      for (const p of processos ?? []) {
        if (!p.comercial_id) continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nome = (p as any).comercial?.nome ?? '—'
        const atual = mapa.get(p.comercial_id) ?? vazio(p.comercial_id, nome)
        atual.num_contratos += 1
        atual.valor_emitido += p.modalidade === 'Contrato' ? (p.valor_contrato ?? 0) : (p.valor_financiado ?? 0)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        atual.comissao_gerada += (p as any).comissao_comercial_calculada ?? 0
        mapa.set(p.comercial_id, atual)
      }
      return Array.from(mapa.values()).sort((a, b) => b.comissao_gerada - a.comissao_gerada)
    },
    enabled: !!usuario,
  })
}
