'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { useApuracaoRenda } from '@/hooks/leads/useApuracaoRenda'
import { ApuracaoRendaModal } from '@/components/documentos/ApuracaoRendaModal'
import { Button } from '@/components/ui/button'
import { TrendingUp } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Props {
  leadId: string
}

interface DocumentoSimples {
  id: string
  nome_original: string
  classificacao: string | null
}

const LABEL_STATUS: Record<string, string> = {
  concluida:  'Concluída',
  revisada:   'Revisada',
  descartada: 'Descartada',
  pendente:   'Pendente',
}

function moeda(valor: number | null | undefined) {
  if (valor == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

export function ApuracaoRendaCard({ leadId }: Props) {
  const { usuario } = useAuth()
  const { ultima, isLoading: loadingApuracao } = useApuracaoRenda({ leadId })
  const [modalAberto, setModalAberto] = useState(false)

  const { data: documentos = [] } = useQuery<DocumentoSimples[]>({
    queryKey: ['documentos-extratos', leadId],
    enabled: !!usuario && !!leadId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      // Fase E (corte de leitura): descobre IDs via documento_vinculos, lê de `documentos`.
      const { data: vinculos } = await supabase
        .from('documento_vinculos')
        .select('documento_id')
        .eq('entidade_tipo', 'lead')
        .eq('entidade_id', leadId)
        .eq('empresa_id', usuario!.empresa_id)
      const ids = (vinculos ?? []).map(v => v.documento_id)
      if (ids.length === 0) return []

      const { data } = await supabase
        .from('documentos')
        .select('id, nome_original, classificacao:classificacao_legado')
        .in('id', ids)
        .eq('classificacao_legado', 'extrato_bancario')
        .is('deleted_at', null)
      return (data ?? []) as unknown as DocumentoSimples[]
    },
  })

  if (loadingApuracao || !ultima) return null

  const resultado = ultima.resultado_json as { media_mensal_entradas?: number; meses?: unknown[] } | null
  const numMeses = resultado?.meses?.length ?? 0

  return (
    <>
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-600" />
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Análise de Extratos</p>
        </div>

        <div>
          <p className="text-xl font-bold text-blue-900">{moeda(ultima.renda_apurada)}</p>
          <p className="text-xs text-blue-600 mt-0.5">valor sugerido pela IA</p>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-blue-600">
          <span>Realizada em {format(new Date(ultima.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
          {documentos.length > 0 && <span>· {documentos.length} extrato{documentos.length !== 1 ? 's' : ''}</span>}
          {numMeses > 0 && <span>· {numMeses} {numMeses === 1 ? 'mês' : 'meses'}</span>}
          {ultima.confianca && <span>· Confiança: {ultima.confianca === 'alta' ? 'Alta' : ultima.confianca === 'media' ? 'Média' : 'Baixa'}</span>}
          <span>· {LABEL_STATUS[ultima.status]}</span>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-100" onClick={() => setModalAberto(true)}>
            Ver Detalhes
          </Button>
        </div>
      </div>

      {modalAberto && (
        <ApuracaoRendaModal
          open={modalAberto}
          onClose={() => setModalAberto(false)}
          leadId={leadId}
          processoId={null}
          documentos={documentos}
          ultimaApuracao={ultima}
        />
      )}
    </>
  )
}
