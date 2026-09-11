'use client'

import { BarChart3 } from 'lucide-react'

// Metas virão do módulo RH — componente preparado para receber dados reais
export function MetasEquipe() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-fonti-primary">Metas da equipe</h3>
        <span className="text-xs text-text-muted">processos este mês</span>
      </div>

      <div className="flex flex-col items-center justify-center gap-2 py-6 text-text-muted">
        <BarChart3 className="w-8 h-8 opacity-30" />
        <p className="text-xs text-center">
          Módulo de metas disponível em breve
        </p>
      </div>
    </div>
  )
}
