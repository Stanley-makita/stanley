'use client'

import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, AlertTriangle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import type { OcrSugestoesResult, SugestaoOcr } from '@/hooks/leads/useOcrSugestoes'

interface Props {
  aberto: boolean
  leadId: string
  sugestoes: OcrSugestoesResult
  onFechar: () => void
}

const BADGE_CONFIANCA: Record<string, string> = {
  alta:  'bg-emerald-50 text-emerald-700',
  media: 'bg-blue-50 text-blue-700',
  baixa: 'bg-gray-100 text-gray-600',
}

export function OcrEnriquecimentoModal({ aberto, leadId, sugestoes, onFechar }: Props) {
  const queryClient = useQueryClient()
  const { sugestoes: lista } = sugestoes

  // Inicializa seleção: novos marcados, conflitos desmarcados, CPF divergente sempre desmarcado
  const [selecionados, setSelecionados] = useState<Set<string>>(() => {
    return new Set(lista.filter(s => s.categoria === 'novo').map(s => s.campo))
  })
  const [salvando, setSalvando] = useState(false)

  const cpfConflito = useMemo(
    () => lista.find(s => s.campo === 'cpf' && s.categoria === 'conflito'),
    [lista],
  )

  function toggleCampo(campo: string) {
    setSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(campo)) next.delete(campo)
      else next.add(campo)
      return next
    })
  }

  function toggleTodos() {
    const elegíveis = lista.filter(s => !(s.campo === 'cpf' && s.categoria === 'conflito')).map(s => s.campo)
    if (selecionados.size === elegíveis.length) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(elegíveis))
    }
  }

  async function handleAplicar(ignorarTudo = false) {
    setSalvando(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token ?? ''

      const campos = ignorarTudo
        ? []
        : lista
            .filter(s => selecionados.has(s.campo))
            .map(s => ({
              campo:        s.campo,
              valor:        s.valorEncontrado,
              documento_id: s.documento_id,
              confirmado:   s.categoria === 'conflito',
            }))

      const documento_ids_revisados = Array.from(new Set(lista.map(s => s.documento_id)))

      const res = await fetch(`/api/leads/${leadId}/aplicar-ocr`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ campos, documento_ids_revisados }),
      })
      const json = await res.json()

      if (!res.ok) {
        toast.error(json.error ?? 'Erro ao aplicar dados')
        return
      }

      if (json.cpf_divergente) {
        toast.warning('O CPF encontrado nos documentos difere do cadastro e não foi alterado.')
      }

      if (ignorarTudo) {
        toast.success('Documentos marcados como revisados.')
      } else {
        const n = json.camposAplicados?.length ?? 0
        toast.success(n > 0 ? `${n} campo${n !== 1 ? 's' : ''} aplicado${n !== 1 ? 's' : ''} ao cadastro.` : 'Nenhum campo alterado.')
      }

      queryClient.invalidateQueries({ queryKey: ['ocr-sugestoes', leadId] })
      queryClient.invalidateQueries({ queryKey: ['documentos-clientes', 'lead', leadId] })
      onFechar()
    } catch (err) {
      console.error('[OcrEnriquecimentoModal]', err)
      toast.error('Erro inesperado.')
    } finally {
      setSalvando(false)
    }
  }

  const elegíveisCount = lista.filter(s => !(s.campo === 'cpf' && s.categoria === 'conflito')).length
  const todosMarcados = selecionados.size === elegíveisCount && elegíveisCount > 0

  return (
    <Dialog open={aberto} onOpenChange={v => { if (!v && !salvando) onFechar() }}>
      <DialogContent className="max-w-2xl p-0 flex flex-col overflow-hidden max-h-[90vh]">
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-[#253B29]">Completar cadastro por OCR</h2>
          <p className="text-sm text-gray-500 mt-0.5">Selecione os campos que deseja aplicar ao cadastro da pessoa.</p>
        </div>

        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-2.5 text-left w-8">
                  <input
                    type="checkbox"
                    checked={todosMarcados}
                    onChange={toggleTodos}
                    disabled={salvando}
                    className="h-4 w-4 rounded border-gray-300 text-[#253B29] cursor-pointer"
                  />
                </th>
                <th className="px-2 py-2.5 text-left font-medium text-gray-600 text-xs">Campo</th>
                <th className="px-2 py-2.5 text-left font-medium text-gray-600 text-xs">Valor atual</th>
                <th className="px-2 py-2.5 text-left font-medium text-gray-600 text-xs">Valor encontrado</th>
                <th className="px-2 py-2.5 text-left font-medium text-gray-600 text-xs">Confiança</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((s: SugestaoOcr) => {
                const isCpfBloqueado = s.campo === 'cpf' && s.categoria === 'conflito'
                const checked = !isCpfBloqueado && selecionados.has(s.campo)
                const isConflito = s.categoria === 'conflito'

                return (
                  <tr
                    key={s.campo}
                    className={`border-b border-gray-50 ${
                      isCpfBloqueado ? 'bg-red-50/40' : checked && isConflito ? 'bg-amber-50/60' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => !isCpfBloqueado && toggleCampo(s.campo)}
                        disabled={isCpfBloqueado || salvando}
                        className="h-4 w-4 rounded border-gray-300 text-[#253B29] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </td>
                    <td className="px-2 py-3">
                      <span className="font-medium text-gray-800">{s.label}</span>
                      {isCpfBloqueado && (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
                          <XCircle className="h-3 w-3" />
                          Não sobrescrito
                        </span>
                      )}
                      {!isCpfBloqueado && isConflito && (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                          <AlertTriangle className="h-3 w-3" />
                          Conflito
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-gray-400 text-xs">
                      {s.valorAtual ?? <span className="italic">vazio</span>}
                    </td>
                    <td className="px-2 py-3 text-gray-800 font-medium text-xs">{s.valorEncontrado}</td>
                    <td className="px-2 py-3">
                      <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${BADGE_CONFIANCA[s.confianca] ?? 'bg-gray-100 text-gray-600'}`}>
                        {s.confianca}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {lista.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-400">
                    Nenhuma sugestão disponível.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {cpfConflito && (
          <div className="px-6 py-2 bg-red-50 border-t border-red-100 shrink-0">
            <p className="text-xs text-red-600">
              O CPF encontrado nos documentos ({cpfConflito.valorEncontrado}) difere do cadastro ({cpfConflito.valorAtual}) e não pode ser alterado automaticamente. Corrija manualmente se necessário.
            </p>
          </div>
        )}

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAplicar(true)}
            disabled={salvando}
            className="text-gray-600"
          >
            Ignorar tudo
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onFechar} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => handleAplicar(false)}
              disabled={salvando || selecionados.size === 0}
              className="bg-[#253B29] hover:bg-[#1a2b1e] text-white"
            >
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Aplicar {selecionados.size > 0 ? `${selecionados.size} campo${selecionados.size !== 1 ? 's' : ''}` : 'selecionados'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
