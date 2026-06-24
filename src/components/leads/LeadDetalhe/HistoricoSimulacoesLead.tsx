'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Calculator, Home, Clock } from 'lucide-react'

interface Simulacao {
  id: string
  tipo: 'custas' | 'financiamento'
  banco: string | null
  nome_cliente: string | null
  resultado_json: Record<string, unknown> | null
  created_at: string
  lead_id: string | null
  processo_id: string | null
}

function extrairResumo(sim: Simulacao): string {
  const json = sim.resultado_json
  if (!json) return '—'

  if (sim.tipo === 'custas') {
    const total = json.totalGeral ?? json.total ?? json.totalCustas
    if (typeof total === 'number') {
      return `Total: ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}`
    }
    return '—'
  }

  if (sim.tipo === 'financiamento') {
    const bancos = json.bancos as Array<{ elegivel: boolean; bancoNome: string; parcela1: number }> | undefined
    const melhor = bancos?.find((b) => b.elegivel)
    if (melhor) {
      return `${melhor.bancoNome} — 1ª parcela ${melhor.parcela1.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}`
    }
    const input = json.input as { valorImovel?: number } | undefined
    if (input?.valorImovel) {
      return `Imóvel ${input.valorImovel.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}`
    }
    return '—'
  }

  return '—'
}

function origemLabel(sim: Simulacao): string {
  if (sim.lead_id && !sim.processo_id) return 'Lead'
  if (sim.processo_id) return 'Processo'
  return 'Avulsa'
}

interface Props {
  leadId: string
}

export function HistoricoSimulacoesLead({ leadId }: Props) {
  const { data: simulacoes = [], isLoading } = useQuery({
    queryKey: ['simulacoes-lead', leadId],
    queryFn: async (): Promise<Simulacao[]> => {
      const { data, error } = await supabase
        .from('simulacoes_central')
        .select('id, tipo, banco, nome_cliente, resultado_json, created_at, lead_id, processo_id')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as Simulacao[]
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        Carregando histórico…
      </div>
    )
  }

  if (simulacoes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2 text-sm text-gray-400">
        <Clock className="w-8 h-8 opacity-40" />
        <span>Nenhuma simulação salva para este lead ainda.</span>
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-100">
      {simulacoes.map((sim) => {
        const isCustas = sim.tipo === 'custas'
        return (
          <div key={sim.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
            <div className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${isCustas ? 'bg-blue-100 text-blue-600' : 'bg-fonti-primary/10 text-fonti-primary'}`}>
              {isCustas ? <Calculator className="w-3.5 h-3.5" /> : <Home className="w-3.5 h-3.5" />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isCustas ? 'bg-blue-50 text-blue-700' : 'bg-fonti-primary/10 text-fonti-primary'}`}>
                  {isCustas ? 'Custas' : 'Financiamento'}
                </span>
                <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                  {origemLabel(sim)}
                </span>
                {sim.banco && (
                  <span className="text-xs text-gray-600 truncate">{sim.banco}</span>
                )}
              </div>
              <p className="text-sm text-gray-700 mt-0.5 truncate">{extrairResumo(sim)}</p>
            </div>

            <div className="text-right flex-shrink-0 ml-2">
              <p className="text-xs text-gray-500">
                {format(new Date(sim.created_at), "dd/MM/yy", { locale: ptBR })}
              </p>
              <p className="text-[10px] text-gray-400">
                {format(new Date(sim.created_at), "HH:mm", { locale: ptBR })}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
