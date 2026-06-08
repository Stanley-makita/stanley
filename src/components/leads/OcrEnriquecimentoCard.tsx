'use client'

import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { OcrSugestoesResult } from '@/hooks/leads/useOcrSugestoes'

interface Props {
  sugestoes: OcrSugestoesResult
  onAbrir: () => void
}

export function OcrEnriquecimentoCard({ sugestoes, onAbrir }: Props) {
  const { totalNovos, totalConflitos } = sugestoes
  const total = totalNovos + totalConflitos
  if (total === 0) return null

  const temConflito = totalConflitos > 0

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
        temConflito
          ? 'border-amber-200 bg-amber-50'
          : 'border-emerald-200 bg-emerald-50'
      }`}
    >
      <Sparkles className={`h-4 w-4 shrink-0 ${temConflito ? 'text-amber-600' : 'text-emerald-600'}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${temConflito ? 'text-amber-800' : 'text-emerald-800'}`}>
          Dados encontrados nos documentos
        </p>
        <p className={`text-xs mt-0.5 ${temConflito ? 'text-amber-600' : 'text-emerald-600'}`}>
          {totalNovos > 0 && `${totalNovos} campo${totalNovos !== 1 ? 's' : ''} novo${totalNovos !== 1 ? 's' : ''}`}
          {totalNovos > 0 && totalConflitos > 0 && ' · '}
          {totalConflitos > 0 && `${totalConflitos} conflito${totalConflitos !== 1 ? 's' : ''} para revisar`}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={onAbrir}
        className={`shrink-0 h-8 text-xs ${
          temConflito
            ? 'border-amber-300 text-amber-700 hover:bg-amber-100'
            : 'border-emerald-300 text-emerald-700 hover:bg-emerald-100'
        }`}
      >
        Completar cadastro
      </Button>
    </div>
  )
}
