'use client'
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useDestinosPessoa, useEnviarDocumentos } from '@/hooks/documentos/useVinculosDocumento'
import type { DestinoVinculo } from '@/lib/documentos/destinosVinculo'

const MOTIVOS: Record<string, string> = {
  documento_de_trabalho: 'é documento de trabalho de um negócio',
  excluido: 'foi excluído',
  outra_empresa: 'não é desta empresa',
  nao_encontrado: 'não foi encontrado',
}

interface Props { aberto: boolean; onFechar: () => void; pessoaId: string; documentoIds: string[]; onEnviado: () => void }

/** "Enviar para…" da tela da Pessoa: leads/negócios dela + busca livre (spec 2026-09-25). */
export function EnviarDocumentosModal({ aberto, onFechar, pessoaId, documentoIds, onEnviado }: Props) {
  const [digitado, setDigitado] = useState('')
  const [busca, setBusca] = useState('')
  const [escolhido, setEscolhido] = useState<DestinoVinculo | null>(null)
  // Evita uma chamada por tecla digitada.
  useEffect(() => {
    const t = setTimeout(() => setBusca(digitado.trim()), 350)
    return () => clearTimeout(t)
  }, [digitado])
  const { data: destinos = [], isLoading, error } = useDestinosPessoa(pessoaId, busca, aberto)
  const enviar = useEnviarDocumentos()
  const daPessoa = destinos.filter(d => d.pessoa_participa)
  const outros = destinos.filter(d => !d.pessoa_participa)

  function fechar() { setDigitado(''); setBusca(''); setEscolhido(null); onFechar() }

  async function confirmar() {
    if (!escolhido) return
    try {
      const r = await enviar.mutateAsync({ documento_ids: documentoIds, entidade_tipo: escolhido.entidade_tipo, entidade_id: escolhido.entidade_id })
      const partes = [`${r.vinculados} documento${r.vinculados !== 1 ? 's' : ''} enviado${r.vinculados !== 1 ? 's' : ''} para ${escolhido.titulo}`]
      if (r.ja_existiam > 0) partes.push(`${r.ja_existiam} já estava${r.ja_existiam !== 1 ? 'm' : ''} lá`)
      toast.success(partes.join(' · '))
      for (const rec of r.recusados) toast.warning(`Um documento não foi enviado: ${MOTIVOS[rec.motivo] ?? rec.motivo}.`)
      onEnviado()
      fechar()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const item = (d: DestinoVinculo) => (
    <button
      key={`${d.entidade_tipo}-${d.entidade_id}`}
      type="button"
      onClick={() => setEscolhido(d)}
      className={cn('flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
        escolhido?.entidade_id === d.entidade_id ? 'border-fonti-primary bg-fonti-primary/5' : 'border-gray-100 hover:bg-gray-50')}
    >
      <span className="min-w-0 truncate font-medium text-gray-800">{d.titulo}</span>
      {d.subtitulo && <span className="shrink-0 text-xs text-gray-400">{d.subtitulo}</span>}
    </button>
  )

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) fechar() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar {documentoIds.length} documento{documentoIds.length !== 1 ? 's' : ''} para…</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-500">Leads e negócios desta pessoa</p>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            : error ? <p className="text-xs text-red-600">{(error as Error).message}</p>
            : daPessoa.length === 0 ? <p className="text-xs text-gray-400">Esta pessoa não tem lead aberto nem negócio.</p>
            : <div className="space-y-1.5">{daPessoa.map(item)}</div>}
          <p className="pt-2 text-xs font-medium text-gray-500">Outro lead/negócio</p>
          <Input value={digitado} onChange={e => setDigitado(e.target.value)} placeholder="Nome do cliente ou número (ex.: 57)" className="h-9 text-sm" />
          {outros.length > 0 && <div className="max-h-48 space-y-1.5 overflow-y-auto">{outros.map(item)}</div>}
          {escolhido && !escolhido.pessoa_participa && (
            <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Esta pessoa não participa deste {escolhido.entidade_tipo === 'lead' ? 'lead' : 'negócio'}.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={fechar}>Cancelar</Button>
            <Button size="sm" disabled={!escolhido || enviar.isPending} onClick={confirmar} className="bg-fonti-primary text-white hover:bg-fonti-primary-hover">
              {enviar.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Enviar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
