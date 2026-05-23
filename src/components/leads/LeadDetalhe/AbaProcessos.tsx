'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { useRouter } from 'next/navigation'
import { FolderOpen, ExternalLink, Building2 } from 'lucide-react'
import { type StatusProcesso } from '@/types/processos'

interface ProcessoResumido {
  id: string
  numero_processo: string
  nome_imovel: string
  modalidade: string
  status_processo: StatusProcesso
  valor_imovel: number | null
  data_inicio: string
  banco: { nome: string } | null
}

const STATUS_LABEL: Record<StatusProcesso, { label: string; cor: string }> = {
  em_analise: { label: 'Em Análise', cor: 'bg-blue-100 text-blue-700' },
  aprovado:   { label: 'Aprovado',   cor: 'bg-green-100 text-green-700' },
  pendente:   { label: 'Pendente',   cor: 'bg-yellow-100 text-yellow-700' },
  reprovado:  { label: 'Reprovado',  cor: 'bg-red-100 text-red-700' },
  cancelado:  { label: 'Cancelado',  cor: 'bg-gray-100 text-gray-500' },
}

function fmtMoeda(v: number | null) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

interface Props { leadId: string }

export function AbaProcessos({ leadId }: Props) {
  const { usuario } = useAuth()
  const router = useRouter()

  const { data: processos = [], isLoading } = useQuery({
    queryKey: ['processos', 'por-lead', leadId],
    queryFn: async (): Promise<ProcessoResumido[]> => {
      const { data, error } = await supabase
        .from('processos')
        .select('id, numero_processo, nome_imovel, modalidade, status_processo, valor_imovel, data_inicio, banco:bancos!banco_id(nome)')
        .eq('lead_id', leadId)
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []).map((p) => ({
        ...p,
        banco: Array.isArray(p.banco) ? (p.banco[0] ?? null) : p.banco,
      })) as ProcessoResumido[]
    },
    enabled: !!usuario && !!leadId,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#253B29] border-t-transparent" />
      </div>
    )
  }

  if (processos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FolderOpen className="h-10 w-10 text-gray-300 mb-3" />
        <p className="text-sm font-medium text-gray-500">Nenhum processo vinculado</p>
        <p className="text-xs text-gray-400 mt-1 max-w-xs">
          Os processos criados a partir deste lead aparecerão aqui.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {processos.map((p) => {
        const status = STATUS_LABEL[p.status_processo] ?? { label: p.status_processo, cor: 'bg-gray-100 text-gray-500' }
        return (
          <button
            key={p.id}
            onClick={() => router.push(`/processos/${p.id}`)}
            className="w-full text-left border border-gray-200 rounded-xl px-4 py-3 hover:bg-[#E7E0C4]/30 transition-colors group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-gray-400">{p.numero_processo}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.cor}`}>{status.label}</span>
                  <span className="text-xs text-gray-400">{p.modalidade}</span>
                </div>
                <p className="text-sm font-medium text-[#253B29] truncate">{p.nome_imovel}</p>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  {p.banco && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {p.banco.nome}
                    </span>
                  )}
                  <span>{fmtMoeda(p.valor_imovel)}</span>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 text-gray-300 group-hover:text-[#253B29] shrink-0 mt-1 transition-colors" />
            </div>
          </button>
        )
      })}
    </div>
  )
}
