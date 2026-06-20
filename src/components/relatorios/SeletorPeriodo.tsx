'use client'

import { useState } from 'react'
import { startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subMonths, format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PeriodoRelatorio } from '@/types/relatorios'

type TipoPeriodo = 'mes' | 'trimestre' | 'semestre' | 'ano' | 'customizado'

interface SeletorPeriodoProps {
  value: PeriodoRelatorio
  onChange: (periodo: PeriodoRelatorio) => void
}

function calcularPeriodo(tipo: TipoPeriodo): PeriodoRelatorio {
  const hoje = new Date()
  switch (tipo) {
    case 'mes':
      return {
        dataInicio: format(startOfMonth(hoje), 'yyyy-MM-dd'),
        dataFim: format(endOfMonth(hoje), 'yyyy-MM-dd'),
      }
    case 'trimestre':
      return {
        dataInicio: format(startOfQuarter(hoje), 'yyyy-MM-dd'),
        dataFim: format(endOfQuarter(hoje), 'yyyy-MM-dd'),
      }
    case 'semestre': {
      const inicioSemestre = hoje.getMonth() < 6
        ? new Date(hoje.getFullYear(), 0, 1)
        : new Date(hoje.getFullYear(), 6, 1)
      const fimSemestre = hoje.getMonth() < 6
        ? new Date(hoje.getFullYear(), 5, 30)
        : new Date(hoje.getFullYear(), 11, 31)
      return {
        dataInicio: format(inicioSemestre, 'yyyy-MM-dd'),
        dataFim: format(fimSemestre, 'yyyy-MM-dd'),
      }
    }
    case 'ano':
      return {
        dataInicio: format(startOfYear(hoje), 'yyyy-MM-dd'),
        dataFim: format(endOfYear(hoje), 'yyyy-MM-dd'),
      }
    default:
      return {
        dataInicio: format(startOfMonth(hoje), 'yyyy-MM-dd'),
        dataFim: format(endOfMonth(hoje), 'yyyy-MM-dd'),
      }
  }
}

export function SeletorPeriodo({ value, onChange }: SeletorPeriodoProps) {
  const [tipo, setTipo] = useState<TipoPeriodo>('mes')

  function handleTipo(novo: TipoPeriodo) {
    setTipo(novo)
    if (novo !== 'customizado') {
      onChange(calcularPeriodo(novo))
    }
  }

  const opcoes: { label: string; value: TipoPeriodo }[] = [
    { label: 'Mês atual', value: 'mes' },
    { label: 'Trimestre', value: 'trimestre' },
    { label: 'Semestre', value: 'semestre' },
    { label: 'Ano', value: 'ano' },
    { label: 'Customizado', value: 'customizado' },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      {opcoes.map((op) => (
        <Button
          key={op.value}
          size="sm"
          variant="outline"
          onClick={() => handleTipo(op.value)}
          className={
            tipo === op.value
              ? 'bg-fonti-primary text-white border-fonti-primary hover:bg-fonti-primary'
              : 'border-gray-300 text-gray-700 hover:border-fonti-primary'
          }
        >
          {op.label}
        </Button>
      ))}

      {tipo === 'customizado' && (
        <div className="flex items-center gap-2 ml-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-gray-500">De</Label>
            <Input
              type="date"
              value={value.dataInicio}
              onChange={(e) => onChange({ ...value, dataInicio: e.target.value })}
              className="h-8 text-sm w-36"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-gray-500">Até</Label>
            <Input
              type="date"
              value={value.dataFim}
              onChange={(e) => onChange({ ...value, dataFim: e.target.value })}
              className="h-8 text-sm w-36"
            />
          </div>
        </div>
      )}
    </div>
  )
}