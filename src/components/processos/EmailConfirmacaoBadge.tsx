'use client'

import { useEmailConfirmacao } from '@/hooks/processos/useEmailConfirmacao'
import { CheckCircle2, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function EmailConfirmacaoBadge({ processoId }: { processoId: string }) {
  const { data: envio } = useEmailConfirmacao(processoId)

  if (!envio) return null

  if (envio.confirmado_em) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Aceite confirmado em {format(new Date(envio.confirmado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
      <Clock className="h-3.5 w-3.5" />
      Aguardando confirmação de valores
    </span>
  )
}
