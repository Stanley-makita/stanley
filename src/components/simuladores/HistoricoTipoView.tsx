'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { AlertTriangle, Eye, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { SimulacaoCentral } from '@/hooks/simulacoes/useSimulacoesCentral'

function fmtData(iso: string) {
  try {
    return format(new Date(iso), "dd/MM/yy 'às' HH:mm", { locale: ptBR })
  } catch {
    return '—'
  }
}

function BadgeStatus({ status }: { status: 'aguardando' | 'concluida' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        status === 'concluida'
          ? 'bg-gray-50 text-gray-600 border border-gray-200'
          : 'bg-amber-50 text-amber-700 border border-amber-200'
      )}
    >
      {status === 'concluida' ? 'Concluída' : 'Aguardando'}
    </span>
  )
}

interface Props {
  tipo: SimulacaoCentral['tipo']
  label: string
  icone: React.ReactNode
  descricao: string
  itens: SimulacaoCentral[]
  isLoading: boolean
  erro: unknown
  onVoltar: () => void
  onNovo: () => void
  onVer: (s: SimulacaoCentral) => void
}

// Tela de histórico de um único tipo de simulação (Financiamento/Custas/
// Consórcio/CGI) — substitui a antiga tabela única que misturava os 4 tipos.
// Reaproveitado pelos 4 cards do dashboard da Central de Simulações.
export function HistoricoTipoView({
  tipo, label, icone, descricao, itens, isLoading, erro, onVoltar, onNovo, onVer,
}: Props) {
  const [busca, setBusca] = useState('')

  const itensFiltrados = busca.trim()
    ? itens.filter((s) => (s.nome_cliente ?? '').toLowerCase().includes(busca.trim().toLowerCase()))
    : itens

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onVoltar}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            ← Central de Simulações
          </button>
          <span className="text-gray-300">/</span>
          <div className="flex items-center gap-2">
            {icone}
            <h2 className="text-sm font-semibold text-gray-800">{label}</h2>
          </div>
        </div>
        <Button
          className="bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-2"
          onClick={onNovo}
        >
          <Plus className="w-4 h-4" />
          Nova simulação de {label}
        </Button>
      </div>

      <p className="text-xs text-gray-400 -mt-2">{descricao}</p>

      <div className="relative max-w-xs">
        <Search className="w-3.5 h-3.5 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input
          className="pl-8 text-sm h-9"
          placeholder="Buscar por nome do cliente..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        {isLoading ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">Carregando...</div>
        ) : erro ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-amber-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Erro ao carregar histórico. Recarregue a página.
          </div>
        ) : itensFiltrados.length === 0 ? (
          <div className="px-4 py-12 text-center">
            {icone}
            <p className="text-sm text-gray-400 mt-3">
              {busca ? 'Nenhuma simulação encontrada para essa busca' : `Nenhuma simulação de ${label} ainda`}
            </p>
            {!busca && (
              <p className="text-xs text-gray-300 mt-1">Clique em &quot;Nova simulação&quot; para começar</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Data</th>
                  <th className="px-4 py-2.5 text-left font-medium">Cliente</th>
                  <th className="px-4 py-2.5 text-left font-medium">Banco / Referência</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {itensFiltrados.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {fmtData(s.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-800">{s.nome_cliente || '—'}</p>
                      {s.cpf_cliente && (
                        <p className="text-xs text-gray-400">{s.cpf_cliente}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{s.banco || '—'}</td>
                    <td className="px-4 py-3">
                      <BadgeStatus status={s.status} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onVer(s)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                        title={tipo === 'financiamento' ? 'Ver simulação' : 'Abrir simulador'}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
