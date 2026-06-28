'use client'

import { useState } from 'react'
import { CalendarClock, Pencil } from 'lucide-react'
import { format, differenceInDays, parseISO, addDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSalvarValidadeProcesso } from '@/hooks/processos/useSalvarValidadeProcesso'
import type { TipoValidade } from '@/hooks/processos/useSalvarValidadeProcesso'

interface Props {
  processoId?: string
  tipo?: TipoValidade
  label: string
  data: string | null | undefined
  /** Quando fornecido, substitui o save via processoId+tipo (uso no Lead) */
  onSalvar?: (data: string | null) => Promise<void>
  isPending?: boolean
  /** Botão de atalho "+X dias" exibido no dialog de edição */
  atalho?: { texto: string; dias: number }
}

function badgeDias(dias: number) {
  if (dias < 0)  return { texto: `Vencida há ${Math.abs(dias)}d`, cor: 'bg-red-100 text-red-700' }
  if (dias === 0) return { texto: 'Vence hoje!', cor: 'bg-red-100 text-red-700' }
  if (dias <= 5)  return { texto: `${dias}d restantes`, cor: 'bg-red-100 text-red-700' }
  if (dias <= 10) return { texto: `${dias}d restantes`, cor: 'bg-amber-100 text-amber-700' }
  return { texto: `${dias}d restantes`, cor: 'bg-green-100 text-green-700' }
}

export function ValidadeCard({ processoId, tipo, label, data, onSalvar, isPending: isPendingExt, atalho }: Props) {
  const [aberto, setAberto] = useState(false)
  const [novaData, setNovaData] = useState('')
  const salvarProcesso = useSalvarValidadeProcesso()

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const diasRestantes = data ? differenceInDays(parseISO(data), hoje) : null
  const badge = diasRestantes !== null ? badgeDias(diasRestantes) : null

  const isPending = isPendingExt ?? salvarProcesso.isPending

  function abrirEditor() {
    setNovaData(data ?? '')
    setAberto(true)
  }

  async function handleSalvar() {
    if (onSalvar) {
      await onSalvar(novaData || null)
    } else {
      await salvarProcesso.mutateAsync({ processoId: processoId!, tipo: tipo!, data: novaData || null })
    }
    setAberto(false)
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
          {data ? (
            <p className="text-sm font-bold text-fonti-primary">
              {format(parseISO(data), 'dd/MM/yyyy', { locale: ptBR })}
            </p>
          ) : (
            <p className="text-sm text-gray-400 italic">Não informado</p>
          )}
          {badge && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 inline-block ${badge.cor}`}>
              {badge.texto}
            </span>
          )}
        </div>
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-fonti-primary">Validade — {label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-gray-600">Informe a data de vencimento da validade do {label.toLowerCase()}:</p>
            {tipo === 'matricula' && (
              <button
                type="button"
                onClick={() => setNovaData(format(addDays(new Date(), 30), 'yyyy-MM-dd'))}
                className="text-xs bg-fonti-accent-hover/60 hover:bg-fonti-accent-hover text-fonti-primary font-medium px-3 py-1.5 rounded-lg transition-colors"
              >
                + 30 dias (padrão matrícula nova)
              </button>
            )}
            {tipo === 'engenharia' && (
              <button
                type="button"
                onClick={() => setNovaData(format(addDays(new Date(), 180), 'yyyy-MM-dd'))}
                className="text-xs bg-fonti-accent-hover/60 hover:bg-fonti-accent-hover text-fonti-primary font-medium px-3 py-1.5 rounded-lg transition-colors"
              >
                + 180 dias (prazo padrão engenharia)
              </button>
            )}
            {atalho && (
              <button
                type="button"
                onClick={() => setNovaData(format(addDays(new Date(), atalho.dias), 'yyyy-MM-dd'))}
                className="text-xs bg-fonti-accent-hover/60 hover:bg-fonti-accent-hover text-fonti-primary font-medium px-3 py-1.5 rounded-lg transition-colors"
              >
                {atalho.texto}
              </button>
            )}
            <Input
              type="date"
              value={novaData}
              onChange={(e) => setNovaData(e.target.value)}
              className="text-sm"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button
              size="sm"
              className="bg-fonti-primary hover:bg-fonti-primary-hover text-white"
              disabled={isPending}
              onClick={handleSalvar}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
