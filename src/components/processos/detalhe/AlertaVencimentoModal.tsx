'use client'

import { AlertTriangle, CalendarX } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { AlertaPendente } from '@/hooks/processos/useAlertasVencimento'

interface Props {
  alertas: AlertaPendente[]
  onConfirmar: () => void
  isPending?: boolean
}

export function AlertaVencimentoModal({ alertas, onConfirmar, isPending }: Props) {
  const aberto = alertas.length > 0

  return (
    <Dialog
      open={aberto}
      onOpenChange={() => {}}
    >
      <DialogContent
        className="max-w-md [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            Atenção: prazos críticos
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <p className="text-sm text-gray-700">
            Os seguintes prazos deste processo requerem sua atenção imediata:
          </p>

          <div className="space-y-2">
            {alertas.map((a) => {
              const urgente = a.diasRestantes <= 5
              return (
                <div
                  key={a.tipo}
                  className={`flex items-center gap-3 rounded-lg border p-3 ${
                    urgente ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
                  }`}
                >
                  <CalendarX className={`h-5 w-5 shrink-0 ${urgente ? 'text-red-600' : 'text-amber-600'}`} />
                  <div>
                    <p className={`text-sm font-semibold ${urgente ? 'text-red-800' : 'text-amber-800'}`}>
                      Validade do {a.label}
                    </p>
                    <p className={`text-xs ${urgente ? 'text-red-600' : 'text-amber-600'}`}>
                      Vence em {format(parseISO(a.validadeData), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                      {a.diasRestantes < 0
                        ? ` — VENCIDA há ${Math.abs(a.diasRestantes)} dias`
                        : a.diasRestantes === 0
                          ? ' — VENCE HOJE'
                          : ` — faltam ${a.diasRestantes} dias`}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <Button
          className="w-full bg-fonti-primary hover:bg-fonti-primary-hover text-white mt-1"
          disabled={isPending}
          onClick={onConfirmar}
        >
          Estou ciente dos prazos acima
        </Button>
      </DialogContent>
    </Dialog>
  )
}
