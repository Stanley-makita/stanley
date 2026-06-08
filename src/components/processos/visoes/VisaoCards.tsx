'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProcessos, type ProdutoFiltro } from '@/hooks/processos/useProcessos'
import { useFases } from '@/hooks/configuracoes/useFases'
import { useSolicitacoesAbertasPorProcesso } from '@/hooks/solicitacoes/useSolicitacoesAbertasPorProcesso'
import { ChanceBadge } from '@/components/processos/ChanceBadge'
import { ProcessoStatusBadge } from '@/components/processos/ProcessoStatusBadge'
import { Input } from '@/components/ui/input'
import { Search, User, Clock } from 'lucide-react'
import type { Processo, ModalidadeProcesso } from '@/types/processos'

// ─── Filtros ──────────────────────────────────────────────────────────────────

const FILTROS_PRODUTO: { label: string; value: ProdutoFiltro }[] = [
  { label: 'Financiamento', value: 'financiamento' },
  { label: 'Consórcio',     value: 'consorcio' },
  { label: 'CGI',           value: 'cgi' },
  { label: 'Contrato',      value: 'contrato' },
]

const FILTROS_CHANCE = [
  { label: 'Certeza',   value: 'certeza'   as const },
  { label: 'Incerteza', value: 'incerteza' as const },
]

const FINANCIAMENTO_MODS = new Set(['SFI', 'SBPE', 'PMCMV', 'Pro_Cotista'])

const MODALIDADE_CONFIG: Record<ModalidadeProcesso, { label: string; cls: string }> = {
  SFI:         { label: 'SFI',         cls: 'bg-blue-100 text-blue-700' },
  SBPE:        { label: 'SBPE',        cls: 'bg-blue-100 text-blue-700' },
  PMCMV:       { label: 'PMCMV',       cls: 'bg-blue-100 text-blue-700' },
  Pro_Cotista: { label: 'Pro Cotista', cls: 'bg-blue-100 text-blue-700' },
  CGI:         { label: 'CGI',         cls: 'bg-purple-100 text-purple-700' },
  Contrato:    { label: 'Contrato',    cls: 'bg-gray-100 text-gray-600' },
  Consorcio:   { label: 'Consórcio',   cls: 'bg-orange-100 text-orange-700' },
  Registro:    { label: 'Registro',    cls: 'bg-teal-100 text-teal-700' },
}

function fmtMoeda(v: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
  }).format(v)
}

// ─── Card compacto ────────────────────────────────────────────────────────────

function KanbanCard({ processo }: { processo: Processo }) {
  const router = useRouter()
  const { data: pendencias = [] } = useSolicitacoesAbertasPorProcesso(processo.id)

  const comprador =
    processo.compradores?.find((c) => c.principal)?.nome ??
    processo.compradores?.[0]?.nome

  const mod = MODALIDADE_CONFIG[processo.modalidade]

  return (
    <div
      onClick={() => {
        const rota = processo.modalidade === 'Consorcio'
          ? `/negocios/consorcio/${processo.id}`
          : `/processos/${processo.id}`
        router.push(rota)
      }}
      className="bg-white border border-gray-200 rounded-lg p-2.5 cursor-pointer hover:shadow-md hover:border-[#C2AA6A] transition-all select-none"
    >
      {/* linha 1: status + modalidade + chance */}
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <div className="flex items-center gap-1 min-w-0 flex-wrap">
          <ProcessoStatusBadge status={processo.status_processo} />
          {mod && (
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${mod.cls}`}>
              {mod.label}
            </span>
          )}
        </div>
        <ChanceBadge chance={processo.chance_emissao} />
      </div>

      {/* linha 2: cliente / imóvel */}
      <div className="flex items-start gap-1 mb-0.5">
        <User className="h-3 w-3 text-[#253B29] mt-0.5 shrink-0" />
        <p className="text-xs font-semibold text-[#253B29] line-clamp-1 leading-tight">
          {comprador ?? processo.nome_imovel}
        </p>
      </div>
      {comprador && (
        <p className="text-[10px] text-gray-400 line-clamp-1 pl-4 mb-1.5 leading-tight">
          {processo.nome_imovel}
        </p>
      )}

      {/* linha 3: valor + nº */}
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs font-bold text-[#253B29]">
          {processo.valor_financiado ? fmtMoeda(processo.valor_financiado) : '—'}
        </span>
        <span className="text-[9px] text-gray-400 tabular-nums">{processo.numero_processo}</span>
      </div>

      {/* linha 4: banco + pendencias + responsável */}
      <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-gray-100">
        <div className="flex items-center gap-1.5 min-w-0">
          {processo.banco && (
            <span className="text-[10px] text-gray-500 truncate max-w-[90px]">
              {processo.banco.nome}
            </span>
          )}
          {pendencias.length > 0 && (
            <div className="flex items-center gap-0.5 text-amber-600 shrink-0">
              <Clock className="h-2.5 w-2.5" />
              <span className="text-[10px] font-medium">{pendencias.length}</span>
            </div>
          )}
        </div>
        {processo.operacional && (
          <span className="text-[10px] text-gray-400 shrink-0">
            {processo.operacional.nome.split(' ')[0]}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Coluna do Kanban ─────────────────────────────────────────────────────────

function KanbanColuna({
  nome, cor, count, processos,
}: {
  nome: string
  cor: string | null
  count: number
  processos: Processo[]
}) {
  return (
    <div className="flex flex-col min-w-[180px] max-w-[260px] flex-1">
      {/* cabeçalho */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: cor ?? '#C2AA6A' }}
          />
          <span className="text-xs font-semibold text-gray-700 truncate">{nome}</span>
        </div>
        <span className="text-xs font-medium text-gray-400 shrink-0 ml-2 tabular-nums">
          {count}
        </span>
      </div>

      {/* corpo */}
      <div className="flex-1 bg-gray-50/80 border border-gray-200 rounded-xl p-2 space-y-2 overflow-y-auto">
        {processos.length === 0 ? (
          <p className="text-center py-6 text-[11px] text-gray-300">—</p>
        ) : (
          processos.map((p) => <KanbanCard key={p.id} processo={p} />)
        )}
      </div>
    </div>
  )
}

// ─── Visão principal ──────────────────────────────────────────────────────────

export function VisaoCards({ modulo = 'processos', produtoFixo }: {
  modulo?: string
  produtoFixo?: ProdutoFiltro
}) {
  const [produtoFiltro, setProdutoFiltro] = useState<ProdutoFiltro>('todos')
  const [chanceFiltro, setChanceFiltro] = useState<'certeza' | 'incerteza' | 'todos'>('todos')
  const [busca, setBusca] = useState('')

  const { data: fases = [], isLoading: fasesLoading } = useFases(modulo)
  const { data: processos = [], isLoading: processosLoading } = useProcessos({
    produto: produtoFixo ?? produtoFiltro,
    chance: chanceFiltro,
    busca,
  })

  const isLoading = fasesLoading || processosLoading

  // contagens para os filtros
  const contagemProduto = processos.reduce((acc, p) => {
    const mod = p.modalidade
    if (FINANCIAMENTO_MODS.has(mod)) acc.financiamento = (acc.financiamento ?? 0) + 1
    else if (mod === 'Consorcio') acc.consorcio = (acc.consorcio ?? 0) + 1
    else if (mod === 'CGI')       acc.cgi        = (acc.cgi        ?? 0) + 1
    else if (mod === 'Contrato')  acc.contrato   = (acc.contrato   ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const contagemChance = processos.reduce((acc, p) => {
    acc[p.chance_emissao] = (acc[p.chance_emissao] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  // agrupar por fase
  const porFase = processos.reduce((acc, p) => {
    const key = p.fase_atual_id ?? '__sem_fase__'
    ;(acc[key] ??= []).push(p)
    return acc
  }, {} as Record<string, Processo[]>)

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 180px)' }}>
      {/* ── Filtros ── */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3 shrink-0">

        {!produtoFixo && FILTROS_PRODUTO.map((f) => {
          const count = contagemProduto[f.value] ?? 0
          const ativo = produtoFiltro === f.value
          return (
            <button
              key={f.value}
              onClick={() => setProdutoFiltro(ativo ? 'todos' : f.value)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                ativo
                  ? 'bg-[#C2AA6A] text-[#253B29]'
                  : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              {f.label}
              {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
            </button>
          )
        })}

        {!produtoFixo && <span className="h-4 w-px bg-gray-300 mx-0.5 shrink-0" />}

        {FILTROS_CHANCE.map((f) => {
          const count = contagemChance[f.value] ?? 0
          const ativo = chanceFiltro === f.value
          const ativoClass = f.value === 'certeza'
            ? 'bg-green-600 text-white border-green-600'
            : 'bg-amber-500 text-white border-amber-500'
          const inativoClass = f.value === 'certeza'
            ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
            : 'bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100'
          return (
            <button
              key={f.value}
              onClick={() => setChanceFiltro(ativo ? 'todos' : f.value)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                ativo ? ativoClass : inativoClass
              }`}
            >
              {f.label}
              {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
            </button>
          )
        })}

        <div className="relative flex-1 min-w-[160px] max-w-[260px] ml-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            placeholder="Buscar por imóvel ou proposta..."
            className="pl-8 h-7 text-xs"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      {/* ── Kanban Board ── */}
      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="shrink-0 w-48 animate-pulse bg-gray-100 rounded-xl h-full min-h-[400px]" />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4 flex-1 min-h-0">
          {fases.map((fase) => (
            <KanbanColuna
              key={fase.id}
              nome={fase.nome}
              cor={fase.cor}
              count={(porFase[fase.id] ?? []).length}
              processos={porFase[fase.id] ?? []}
            />
          ))}

        </div>
      )}
    </div>
  )
}
