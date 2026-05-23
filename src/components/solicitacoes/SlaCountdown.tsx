'use client'

import { useEffect, useState } from 'react'
import { differenceInMinutes, differenceInHours, isPast, parseISO } from 'date-fns'

interface Props {
  slaAt: string | null
  concluido?: boolean
}

export function SlaCountdown({ slaAt, concluido }: Props) {
  const [, setTick] = useState(0)

  // Atualiza a cada minuto
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  if (!slaAt || concluido) return null

  const prazo = parseISO(slaAt)
  const vencido = isPast(prazo)
  const diffMin = Math.abs(differenceInMinutes(prazo, new Date()))
  const diffH = Math.abs(differenceInHours(prazo, new Date()))

  let texto: string
  if (diffMin < 60) {
    texto = vencido ? `Vencido há ${diffMin}min` : `Vence em ${diffMin}min`
  } else if (diffH < 24) {
    const min = diffMin % 60
    texto = vencido
      ? `Vencido há ${diffH}h${min > 0 ? `${min}min` : ''}`
      : `Vence em ${diffH}h${min > 0 ? `${min}min` : ''}`
  } else {
    const d = Math.floor(diffH / 24)
    texto = vencido ? `Vencido há ${d}d` : `Vence em ${d}d`
  }

  return (
    <span className={`text-xs font-medium ${vencido ? 'text-red-600' : 'text-gray-500'}`}>
      {texto}
    </span>
  )
}
