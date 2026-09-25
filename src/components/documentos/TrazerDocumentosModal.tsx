'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { useCandidatosTrazer, useEnviarDocumentos } from '@/hooks/documentos/useVinculosDocumento'
import type { EntidadeVinculo } from '@/lib/documentos/vinculos'

interface Props { aberto: boolean; onFechar: () => void; entidadeTipo: EntidadeVinculo; entidadeId: string }

/** "Trazer das pessoas": documentos soltos das pessoas do lead/negócio (spec 2026-09-25). */
export function TrazerDocumentosModal({ aberto, onFechar, entidadeTipo, entidadeId }: Props) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const { data: pessoas = [], isLoading, error } = useCandidatosTrazer(entidadeTipo, entidadeId, aberto)
  const enviar = useEnviarDocumentos()

  function fechar() { setMarcados(new Set()); onFechar() }
  function alternar(id: string) {
    setMarcados(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  async function trazer() {
    try {
      const r = await enviar.mutateAsync({ documento_ids: Array.from(marcados), entidade_tipo: entidadeTipo, entidade_id: entidadeId })
      toast.success(`${r.vinculados} documento${r.vinculados !== 1 ? 's' : ''} trazido${r.vinculados !== 1 ? 's' : ''}`)
      if (r.recusados.length > 0) toast.warning(`${r.recusados.length} documento(s) não puderam ser trazidos.`)
      fechar()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) fechar() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Trazer documentos das pessoas</DialogTitle></DialogHeader>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          : error ? <p className="text-sm text-red-600">{(error as Error).message}</p>
          : pessoas.length === 0 ? <p className="text-sm text-gray-500">Nenhum documento das pessoas fora daqui.</p>
          : (
            <div className="max-h-[60vh] space-y-4 overflow-y-auto">
              {pessoas.map(p => (
                <div key={p.pessoa_id} className="space-y-1.5">
                  <p className="text-xs font-semibold text-gray-600">{p.nome}</p>
                  {p.documentos.map(d => (
                    <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm hover:bg-gray-50">
                      <input type="checkbox" className="h-4 w-4 accent-fonti-primary" checked={marcados.has(d.id)} onChange={() => alternar(d.id)} />
                      <span className="min-w-0 flex-1 truncate">{d.nome}</span>
                      <span className="shrink-0 text-xs text-gray-400">{format(new Date(d.recebido_em), 'dd/MM/yyyy')}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={fechar}>Cancelar</Button>
          <Button size="sm" disabled={marcados.size === 0 || enviar.isPending} onClick={trazer} className="bg-fonti-primary text-white hover:bg-fonti-primary-hover">
            {enviar.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Trazer{marcados.size > 0 ? ` (${marcados.size})` : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
