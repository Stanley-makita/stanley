'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Calculator, Home, Clock, ChevronDown, ChevronUp } from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface SimItem {
  id: string
  tipo: 'custas' | 'financiamento'
  banco: string | null
  resultado_json: Record<string, unknown> | null
  created_at: string
  origem: 'Lead' | 'Processo' | 'Avulsa'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

function extrairResumo(sim: SimItem): string {
  const json = sim.resultado_json
  if (!json) return '—'
  try {
    if (sim.tipo === 'custas') {
      const total = json.totalComDesconto ?? json.totalSemDesconto
      if (typeof total === 'number') return `Total: ${BRL(total)}`
    }
    if (sim.tipo === 'financiamento') {
      const bancos = json.bancos as Array<{ elegivel: boolean; bancoNome: string; primeiraParcela: number }> | undefined
      const melhor = bancos?.find(b => b.elegivel)
      if (melhor && typeof melhor.primeiraParcela === 'number') {
        return `${melhor.bancoNome} — 1ª parcela ${BRL(melhor.primeiraParcela)}`
      }
      const input = json.input as { valorImovel?: number } | undefined
      if (typeof input?.valorImovel === 'number') return `Imóvel ${BRL(input.valorImovel)}`
    }
  } catch { /* noop */ }
  return '—'
}

function fmtData(iso: string) {
  try {
    const d = new Date(iso)
    return { data: format(d, 'dd/MM/yy', { locale: ptBR }), hora: format(d, 'HH:mm', { locale: ptBR }) }
  } catch { return { data: '—', hora: '' } }
}

// ── Detalhe expandido ─────────────────────────────────────────────────────────

function DetalheCustas({ json }: { json: Record<string, unknown> }) {
  const entrada = json.entrada as { valorCV?: number; valorFinanciado?: number; cidade?: string; banco?: string } | undefined
  const linhas = json.linhas as Array<{ label: string; comDesconto: number; visivel: boolean }> | undefined
  const totalCom = typeof json.totalComDesconto === 'number' ? json.totalComDesconto : null
  const totalSem = typeof json.totalSemDesconto === 'number' ? json.totalSemDesconto : null

  return (
    <div className="mt-2 space-y-2 text-xs">
      {entrada && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-gray-500">
          {entrada.cidade && <span>Cidade: <strong className="text-gray-700">{entrada.cidade}</strong></span>}
          {typeof entrada.valorCV === 'number' && <span>C&V: <strong className="text-gray-700">{BRL(entrada.valorCV)}</strong></span>}
          {typeof entrada.valorFinanciado === 'number' && <span>Financiado: <strong className="text-gray-700">{BRL(entrada.valorFinanciado)}</strong></span>}
        </div>
      )}
      {linhas && linhas.filter(l => l.visivel).length > 0 && (
        <table className="w-full text-[11px]">
          <tbody>
            {linhas.filter(l => l.visivel).map((l, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="py-0.5 text-gray-500">{l.label}</td>
                <td className="py-0.5 text-right font-medium text-gray-800">{BRL(l.comDesconto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {(totalCom !== null || totalSem !== null) && (
        <div className="flex gap-4 border-t border-gray-200 pt-1.5">
          {totalSem !== null && <span className="text-gray-500">Sem desconto: <strong className="text-gray-700">{BRL(totalSem)}</strong></span>}
          {totalCom !== null && <span className="text-green-700 font-semibold">Com desconto: {BRL(totalCom)}</span>}
        </div>
      )}
    </div>
  )
}

function DetalheFinanciamento({ json }: { json: Record<string, unknown> }) {
  const input = json.input as { valorImovel?: number; valorEntrada?: number; rendaMensal?: number } | undefined
  const bancos = json.bancos as Array<{
    elegivel: boolean; inelegivel?: boolean
    bancoNome: string; primeiraParcela: number; ultimaParcela?: number
    prazoMeses?: number; taxaEfetiva?: number
  }> | undefined

  const elegiveis = bancos?.filter(b => b.elegivel) ?? []

  return (
    <div className="mt-2 space-y-2 text-xs">
      {input && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-gray-500">
          {typeof input.valorImovel === 'number' && <span>Imóvel: <strong className="text-gray-700">{BRL(input.valorImovel)}</strong></span>}
          {typeof input.valorEntrada === 'number' && <span>Entrada: <strong className="text-gray-700">{BRL(input.valorEntrada)}</strong></span>}
          {typeof input.rendaMensal === 'number' && <span>Renda: <strong className="text-gray-700">{BRL(input.rendaMensal)}</strong></span>}
        </div>
      )}
      {elegiveis.length > 0 && (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-gray-400">
              <th className="pb-0.5 text-left font-medium">Banco</th>
              <th className="pb-0.5 text-right font-medium">1ª parcela</th>
              {elegiveis[0].prazoMeses && <th className="pb-0.5 text-right font-medium">Prazo</th>}
            </tr>
          </thead>
          <tbody>
            {elegiveis.map((b, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="py-0.5 font-medium text-fonti-primary">{b.bancoNome}</td>
                <td className="py-0.5 text-right text-gray-800">{BRL(b.primeiraParcela)}</td>
                {b.prazoMeses && <td className="py-0.5 text-right text-gray-500">{b.prazoMeses / 12} anos</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {elegiveis.length === 0 && <p className="text-gray-400">Nenhum banco elegível nesta simulação.</p>}
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────

interface Props { leadId: string }

export function HistoricoSimulacoesLead({ leadId }: Props) {
  const [expandido, setExpandido] = useState<string | null>(null)

  const { data: simulacoes = [], isLoading } = useQuery({
    queryKey: ['simulacoes-lead', leadId],
    queryFn: async (): Promise<SimItem[]> => {
      const [custasRes, financRes] = await Promise.all([
        // Custas: tabela processo_custas_simulacoes
        supabase
          .from('processo_custas_simulacoes')
          .select('id, banco_nome, resultado_json, created_at, lead_id, processo_id')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false })
          .limit(30),

        // Financiamento: tabela simulacoes_central
        supabase
          .from('simulacoes_central')
          .select('id, banco, resultado_json, created_at, lead_id, processo_id')
          .eq('lead_id', leadId)
          .eq('tipo', 'financiamento')
          .order('created_at', { ascending: false })
          .limit(30),
      ])

      if (custasRes.error) throw custasRes.error
      if (financRes.error) throw financRes.error

      const custas: SimItem[] = (custasRes.data ?? []).map(r => ({
        id: r.id,
        tipo: 'custas',
        banco: (r as any).banco_nome ?? null,
        resultado_json: r.resultado_json as Record<string, unknown> | null,
        created_at: r.created_at,
        origem: r.processo_id ? 'Processo' : r.lead_id ? 'Lead' : 'Avulsa',
      }))

      const financ: SimItem[] = (financRes.data ?? []).map(r => ({
        id: r.id,
        tipo: 'financiamento',
        banco: r.banco ?? null,
        resultado_json: r.resultado_json as Record<string, unknown> | null,
        created_at: r.created_at,
        origem: r.processo_id ? 'Processo' : r.lead_id ? 'Lead' : 'Avulsa',
      }))

      return [...custas, ...financ].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
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
        const aberto = expandido === sim.id
        const { data, hora } = fmtData(sim.created_at)

        return (
          <div key={sim.id} className="transition-colors hover:bg-gray-50">
            <button
              type="button"
              className="w-full flex items-start gap-3 px-4 py-3 text-left"
              onClick={() => setExpandido(aberto ? null : sim.id)}
            >
              <div className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                isCustas ? 'bg-blue-100 text-blue-600' : 'bg-fonti-primary/10 text-fonti-primary'
              }`}>
                {isCustas ? <Calculator className="w-3.5 h-3.5" /> : <Home className="w-3.5 h-3.5" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    isCustas ? 'bg-blue-50 text-blue-700' : 'bg-fonti-primary/10 text-fonti-primary'
                  }`}>
                    {isCustas ? 'Custas' : 'Financiamento'}
                  </span>
                  <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                    {sim.origem}
                  </span>
                  {sim.banco && <span className="text-xs text-gray-600 truncate">{sim.banco}</span>}
                </div>
                <p className="text-sm text-gray-700 mt-0.5 truncate">{extrairResumo(sim)}</p>
              </div>

              <div className="flex flex-col items-end flex-shrink-0 ml-2 gap-1">
                <p className="text-xs text-gray-500">{data}</p>
                <p className="text-[10px] text-gray-400">{hora}</p>
                {aberto
                  ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                  : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
              </div>
            </button>

            {aberto && sim.resultado_json && (
              <div className="px-4 pb-4 pl-14">
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                  {isCustas
                    ? <DetalheCustas json={sim.resultado_json} />
                    : <DetalheFinanciamento json={sim.resultado_json} />}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
