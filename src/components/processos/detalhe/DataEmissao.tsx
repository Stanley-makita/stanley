'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileSignature, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/auth/useAuth'
import { updateProcessoOuFalha } from '@/hooks/processos/useProcessos'
import { erroDataEmissao, hojeLocalIso } from '@/lib/processos/dataEmissao'

// Data de emissão do contrato (pedido da equipe, 11/11/2026): o checklist "Contrato Emitido"
// pergunta a data antes de marcar, e o card ao lado de Valor do Imóvel / Dias em Andamento /
// Validade Crédito mostra e permite corrigir. Corrigir a data também move a comissão "a receber"
// para o mês certo (trigger da migration 352).

function dataBr(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

export function DataEmissaoDialog({
  aberto,
  onOpenChange,
  dataInicial,
  titulo = 'Data de emissão do contrato',
  textoConfirmar = 'Confirmar emissão',
  isPending,
  onConfirmar,
}: {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  dataInicial?: string | null
  titulo?: string
  textoConfirmar?: string
  isPending?: boolean
  onConfirmar: (data: string) => void | Promise<void>
}) {
  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-fonti-primary">📄 {titulo}</DialogTitle>
        </DialogHeader>
        {/* Corpo monta a cada abertura: estado inicial = data atual (ou hoje). */}
        {aberto && (
          <CorpoDataEmissao
            dataInicial={dataInicial || hojeLocalIso()}
            textoConfirmar={textoConfirmar}
            isPending={isPending}
            onCancelar={() => onOpenChange(false)}
            onConfirmar={onConfirmar}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CorpoDataEmissao({ dataInicial, textoConfirmar, isPending, onCancelar, onConfirmar }: {
  dataInicial: string
  textoConfirmar: string
  isPending?: boolean
  onCancelar: () => void
  onConfirmar: (data: string) => void | Promise<void>
}) {
  const [data, setData] = useState(dataInicial)
  const erro = erroDataEmissao(data)
  return (
    <>
      <div className="space-y-2 py-1">
        <p className="text-sm text-gray-600">Em que data o contrato foi (ou será) emitido?</p>
        <Input type="date" value={data} onChange={(e) => setData(e.target.value)} autoFocus className="text-sm" />
        {erro && data && <p className="text-xs text-red-600">{erro}</p>}
        <p className="text-xs text-text-muted">É esta data que conta como emissão nos relatórios e na comissão.</p>
      </div>
      <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
        <Button variant="outline" size="sm" onClick={onCancelar} className="w-full sm:w-auto">Cancelar</Button>
        <Button
          size="sm"
          className="w-full bg-fonti-primary text-white hover:bg-fonti-primary-hover sm:w-auto"
          disabled={isPending || !!erro}
          onClick={() => onConfirmar(data)}
        >
          {textoConfirmar}
        </Button>
      </DialogFooter>
    </>
  )
}

function useSalvarDataEmissao(processoId: string) {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: string) => {
      await updateProcessoOuFalha(processoId, usuario!.empresa_id, { data_emissao: data })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['processos', processoId] })
      qc.invalidateQueries({ queryKey: ['processos'] })
    },
  })
}

/** Card "Contrato Emitido" — só aparece com o negócio emitido. Clique corrige a data. */
export function EmissaoCard({ processoId, dataEmissao }: { processoId: string; dataEmissao: string | null | undefined }) {
  const [aberto, setAberto] = useState(false)
  const salvar = useSalvarDataEmissao(processoId)

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="group rounded-xl border border-green-200 bg-green-50/40 p-4 flex items-center gap-3 hover:border-green-300 hover:bg-green-50 transition-colors text-left w-full"
      >
        <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center shrink-0">
          <FileSignature className="h-4 w-4 text-green-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 flex items-center gap-1">
            Contrato Emitido
            <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-40 transition-opacity" />
          </p>
          {dataEmissao ? (
            <p className="text-sm font-bold text-green-800">{dataBr(dataEmissao)}</p>
          ) : (
            <p className="text-sm text-text-muted italic">Data não informada</p>
          )}
        </div>
      </button>

      <DataEmissaoDialog
        aberto={aberto}
        onOpenChange={setAberto}
        dataInicial={dataEmissao}
        titulo="Corrigir data de emissão"
        textoConfirmar="Salvar"
        isPending={salvar.isPending}
        onConfirmar={async (data) => {
          try {
            await salvar.mutateAsync(data)
            toast.success(`Data de emissão: ${dataBr(data)}.`)
            setAberto(false)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Não foi possível salvar a data de emissão.')
          }
        }}
      />
    </>
  )
}
