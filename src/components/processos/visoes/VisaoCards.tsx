'use client'

import { useState } from 'react'
import { useProcessos, type ProdutoFiltro } from '@/hooks/processos/useProcessos'
import { ProcessoCard } from './ProcessoCard'
import { Input } from '@/components/ui/input'
import { type StatusProcesso } from '@/types/processos'
import { Search } from 'lucide-react'

const FILTROS_STATUS: { label: string; value: StatusProcesso | 'todos' }[] = [
  { label: 'Todos',      value: 'todos' },
  { label: 'Em Análise', value: 'em_analise' },
  { label: 'Aprovados',  value: 'aprovado' },
  { label: 'Pendentes',  value: 'pendente' },
  { label: 'Reprovados', value: 'reprovado' },
]

const FILTROS_PRODUTO: { label: string; value: ProdutoFiltro }[] = [
  { label: 'Todos',         value: 'todos' },
  { label: 'Financiamento', value: 'financiamento' },
  { label: 'Consórcio',     value: 'consorcio' },
  { label: 'CGI',           value: 'cgi' },
  { label: 'Contrato',      value: 'contrato' },
]

const FINANCIAMENTO_MODS = new Set(['SFI', 'SBPE', 'PMCMV', 'Pro_Cotista'])

export function VisaoCards() {
  const [statusFiltro, setStatusFiltro] = useState<StatusProcesso | 'todos'>('todos')
  const [produtoFiltro, setProdutoFiltro] = useState<ProdutoFiltro>('todos')
  const [busca, setBusca] = useState('')
  const { data: processos = [], isLoading } = useProcessos({ status: statusFiltro, produto: produtoFiltro, busca })

  // Contagem por status
  const contagemStatus = processos.reduce((acc, p) => {
    acc[p.status_processo] = (acc[p.status_processo] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Contagem por produto
  const contagemProduto = processos.reduce((acc, p) => {
    const mod = p.modalidade
    if (FINANCIAMENTO_MODS.has(mod)) acc.financiamento = (acc.financiamento ?? 0) + 1
    else if (mod === 'Consorcio') acc.consorcio = (acc.consorcio ?? 0) + 1
    else if (mod === 'CGI')       acc.cgi        = (acc.cgi        ?? 0) + 1
    else if (mod === 'Contrato')  acc.contrato   = (acc.contrato   ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-3">
      {/* Filtros por status */}
      <div className="flex items-center gap-2 flex-wrap">
        {FILTROS_STATUS.map((f) => {
          const count = f.value === 'todos' ? processos.length : (contagemStatus[f.value] ?? 0)
          return (
            <button
              key={f.value}
              onClick={() => setStatusFiltro(f.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                statusFiltro === f.value
                  ? 'bg-[#253B29] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label} {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Filtros por produto */}
      <div className="flex items-center gap-2 flex-wrap">
        {FILTROS_PRODUTO.map((f) => {
          const count = f.value === 'todos' ? processos.length : (contagemProduto[f.value] ?? 0)
          return (
            <button
              key={f.value}
              onClick={() => setProdutoFiltro(f.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                produtoFiltro === f.value
                  ? 'bg-[#C2AA6A] text-[#253B29]'
                  : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              {f.label} {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Busca */}
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Buscar por imóvel, cliente ou proposta..."
          className="pl-9"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {/* Grid de cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-44" />
          ))}
        </div>
      ) : processos.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>Nenhum processo encontrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {processos.map((p) => (
            <ProcessoCard key={p.id} processo={p} />
          ))}
        </div>
      )}
    </div>
  )
}
