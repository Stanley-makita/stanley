'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { prazoInputParaIso } from '@/lib/solicitacoes/prazo'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Props {
  solicitacaoId: string
  slaAt: string | null
  /** Quem pediu e a gestão podem mudar o prazo; os outros só veem. */
  podeEditar: boolean
  onAlterado?: (novo: string) => void
}

/** Linha "Prazo" do detalhe da solicitação, com edição de data e hora de término (pedido da equipe, 10/11/2026). */
export function PrazoSolicitacaoEditavel({ solicitacaoId, slaAt, podeEditar, onAlterado }: Props) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { setEditando(false) }, [solicitacaoId])

  const iso = prazoInputParaIso(valor)
  const invalido = !iso || new Date(iso).getTime() <= Date.now()

  async function salvar() {
    if (invalido || !iso) return
    setSalvando(true)
    // UPDATE barrado pela RLS não dá erro: confere a linha afetada (CLAUDE.md).
    const { data, error } = await supabase.from('solicitacoes_operacionais')
      .update({ sla_at: iso }).eq('id', solicitacaoId).select('id')
    setSalvando(false)
    if (error || !data?.length) {
      toast.error(error ? `Erro ao alterar o prazo: ${error.message}` : 'Sem permissão para alterar o prazo desta solicitação.')
      return
    }
    toast.success('Prazo alterado.')
    setEditando(false)
    onAlterado?.(iso)
    qc.invalidateQueries({ queryKey: ['solicitacoes'] })
  }

  const texto = slaAt ? format(new Date(slaAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : 'Sem prazo'

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-gray-400">Prazo</span>
      {editando ? (
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <div className="flex gap-1.5">
            <Input type="datetime-local" value={valor} onChange={(e) => setValor(e.target.value)}
              aria-label="Novo prazo" className="h-8 text-xs" />
            <Button size="sm" className="h-8 bg-fonti-primary text-xs text-white hover:bg-fonti-primary-hover"
              disabled={invalido || salvando} onClick={salvar}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditando(false)} disabled={salvando}>
              Cancelar
            </Button>
          </div>
          {valor && invalido && <span className="text-red-600">O prazo precisa ser depois de agora.</span>}
        </div>
      ) : (
        <span className="flex items-center gap-2 font-medium text-gray-700">
          {texto}
          {podeEditar && (
            <button type="button" className="text-fonti-primary underline"
              onClick={() => { setValor(slaAt ? format(new Date(slaAt), "yyyy-MM-dd'T'HH:mm") : ''); setEditando(true) }}>
              Alterar
            </button>
          )}
        </span>
      )}
    </div>
  )
}
