'use client'

import { useState, useEffect } from 'react'
import { CalendarClock, Pencil } from 'lucide-react'
import { format, differenceInDays, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useSalvarValidadeProcesso } from '@/hooks/processos/useSalvarValidadeProcesso'
import type { TipoValidade } from '@/hooks/processos/useSalvarValidadeProcesso'
import { CampoValidadePorDias, erroCampoValidade } from '@/components/processos/detalhe/CampoValidadePorDias'

interface Props {
  processoId?: string
  tipo?: TipoValidade
  label: string
  data: string | null | undefined
  /** Quando fornecido, substitui o save via processoId+tipo (uso no Lead) */
  onSalvar?: (data: string | null) => Promise<void>
  isPending?: boolean
  /** Data a partir da qual os dias são contados (crédito: Data da Aprovação).
   * Omitida/vazia = hoje. */
  dataBase?: string | null
  /** Quando incrementado pelo pai, abre o editor automaticamente (ex: logo
   * após outro campo relacionado ser preenchido). Não afeta o uso normal
   * (clique manual no card) quando omitido. */
  abrirGatilho?: number
}

function badgeDias(dias: number) {
  if (dias < 0)  return { texto: `Vencida há ${Math.abs(dias)}d`, cor: 'bg-red-100 text-red-700' }
  if (dias === 0) return { texto: 'Vence hoje!', cor: 'bg-red-100 text-red-700' }
  if (dias <= 5)  return { texto: `${dias}d restantes`, cor: 'bg-red-100 text-red-700' }
  if (dias <= 10) return { texto: `${dias}d restantes`, cor: 'bg-amber-100 text-amber-700' }
  return { texto: `${dias}d restantes`, cor: 'bg-green-100 text-green-700' }
}

export function ValidadeCard({ processoId, tipo, label, data, onSalvar, isPending: isPendingExt, dataBase, abrirGatilho }: Props) {
  const [aberto, setAberto] = useState(false)
  // Estado local garante atualização imediata sem depender do re-render do pai
  const [localData, setLocalData] = useState<string | null>(data ?? null)
  const salvarProcesso = useSalvarValidadeProcesso()

  // Sincroniza quando o pai eventualmente re-renderiza com dados novos
  useEffect(() => {
    setLocalData(data ?? null)
  }, [data])

  // Abertura automática disparada pelo pai (ex: após salvar um campo relacionado)
  useEffect(() => {
    if (abrirGatilho) abrirEditor()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirGatilho])

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const diasRestantes = localData ? differenceInDays(parseISO(localData), hoje) : null
  const badge = diasRestantes !== null ? badgeDias(diasRestantes) : null

  const isPending = isPendingExt ?? salvarProcesso.isPending

  function abrirEditor() {
    setAberto(true)
  }

  async function handleSalvar(valorSalvar: string | null) {
    try {
      if (onSalvar) {
        await onSalvar(valorSalvar)
      } else {
        await salvarProcesso.mutateAsync({ processoId: processoId!, tipo: tipo!, data: valorSalvar })
      }
      // Atualiza exibição imediatamente sem aguardar re-render do pai
      setLocalData(valorSalvar)
      setAberto(false)
    } catch {
      toast.error('Não foi possível atualizar a validade. Tente novamente.')
    }
  }

  return (
    <>
      <button
        onClick={abrirEditor}
        className="group rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-3 hover:border-fonti-primary/30 hover:bg-gray-50 transition-colors text-left w-full"
      >
        <div className="w-9 h-9 bg-gray-50 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-white transition-colors">
          <CalendarClock className="h-4 w-4 text-fonti-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 flex items-center gap-1">
            {label}
            <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-40 transition-opacity" />
          </p>
          {localData ? (
            <p className="text-sm font-bold text-fonti-primary">
              {format(parseISO(localData), 'dd/MM/yyyy', { locale: ptBR })}
            </p>
          ) : (
            <p className="text-sm text-text-muted italic">Não informado</p>
          )}
          {badge && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 inline-block ${badge.cor}`}>
              {badge.texto}
            </span>
          )}
        </div>
      </button>

      <ValidadeDialog
        aberto={aberto}
        onOpenChange={setAberto}
        label={label}
        tipo={tipo ?? 'credito'}
        dataInicial={localData}
        dataBase={dataBase}
        isPending={isPending}
        onSalvar={handleSalvar}
      />
    </>
  )
}

interface ValidadeDialogProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  label: string
  tipo: TipoValidade
  dataInicial: string | null
  /** Só usada no crédito (Data da Aprovação). Vazia = hoje. */
  dataBase?: string | null
  isPending?: boolean
  onSalvar: (data: string | null) => Promise<void> | void
}

/**
 * Modal de validade com o campo "Válido por [__] dias" (CampoValidadePorDias).
 * Usado pelo ValidadeCard e pela aba Crédito do Negócio (ao salvar a Data da
 * Aprovação).
 */
export function ValidadeDialog({ aberto, onOpenChange, label, tipo, dataInicial, dataBase, isPending, onSalvar }: ValidadeDialogProps) {
  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-fonti-primary">{label}</DialogTitle>
        </DialogHeader>
        {/* Corpo separado: monta a cada abertura (estado inicial = valor atual). */}
        {aberto && (
          <CorpoValidadeDialog
            tipo={tipo}
            dataInicial={dataInicial}
            dataBase={dataBase}
            isPending={isPending}
            onCancelar={() => onOpenChange(false)}
            onSalvar={onSalvar}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CorpoValidadeDialog({ tipo, dataInicial, dataBase, isPending, onCancelar, onSalvar }: {
  tipo: TipoValidade
  dataInicial: string | null
  dataBase?: string | null
  isPending?: boolean
  onCancelar: () => void
  onSalvar: (data: string | null) => Promise<void> | void
}) {
  const [novaData, setNovaData] = useState(dataInicial ?? '')
  const erro = erroCampoValidade(tipo, novaData, dataBase)
  return (
    <>
      <div className="py-1">
        <CampoValidadePorDias tipo={tipo} valor={novaData} onChange={setNovaData} dataBase={dataBase} autoFocus />
      </div>
      <DialogFooter className="gap-2">
        <Button variant="outline" size="sm" onClick={onCancelar}>Cancelar</Button>
        <Button
          size="sm"
          className="bg-fonti-primary hover:bg-fonti-primary-hover text-white"
          disabled={isPending || !!erro}
          onClick={() => onSalvar(novaData || null)}
        >
          Salvar
        </Button>
      </DialogFooter>
    </>
  )
}
