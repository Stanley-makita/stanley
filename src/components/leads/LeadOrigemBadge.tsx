'use client'

import { Badge } from '@/components/ui/badge'
import { useOrigensLead } from '@/hooks/leads/useOrigensLead'

// Cor por codigo conhecido — puramente estética, sem relação com o nome
// editável (que vem de origens_lead). Qualquer codigo fora desta lista
// (origem manual nova criada pela tela) cai no fallback cinza abaixo.
const CORES: Record<string, string> = {
  indicacao:          'bg-fonti-accent-hover text-fonti-primary border-fonti-accent',
  site:               'bg-blue-50 text-blue-700 border-blue-200',
  whatsapp:           'bg-green-50 text-green-700 border-green-200',
  instagram:          'bg-pink-50 text-pink-700 border-pink-200',
  facebook:           'bg-indigo-50 text-indigo-700 border-indigo-200',
  outros:             'bg-gray-50 text-gray-600 border-gray-200',
  direto:             'bg-gray-50 text-gray-600 border-gray-200',
  corretor:           'bg-amber-50 text-amber-700 border-amber-200',
  imobiliaria:        'bg-orange-50 text-orange-700 border-orange-200',
  construtora:        'bg-orange-50 text-orange-700 border-orange-200',
  parceiro_comercial: 'bg-purple-50 text-purple-700 border-purple-200',
}
const COR_FALLBACK = 'bg-gray-50 text-gray-600 border-gray-200'

export function LeadOrigemBadge({ origem }: { origem: string }) {
  const { data: origens = [] } = useOrigensLead()
  const encontrada = origens.find((o) => o.codigo === origem)

  const label = encontrada?.nome ?? origem
  const className = CORES[origem] ?? COR_FALLBACK

  return (
    <Badge variant="outline" className={`text-xs ${className}`}>
      {label}
    </Badge>
  )
}