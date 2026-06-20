import { type LeadOrigem } from '@/types/leads'
import { Badge } from '@/components/ui/badge'

const CONFIG: Record<LeadOrigem, { label: string; className: string }> = {
  indicacao:          { label: 'Indicação',         className: 'bg-fonti-accent-hover text-fonti-primary border-fonti-accent' },
  site:               { label: 'Site',              className: 'bg-blue-50 text-blue-700 border-blue-200' },
  whatsapp:           { label: 'WhatsApp',          className: 'bg-green-50 text-green-700 border-green-200' },
  instagram:          { label: 'Instagram',         className: 'bg-pink-50 text-pink-700 border-pink-200' },
  facebook:           { label: 'Facebook',          className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  outros:             { label: 'Outros',            className: 'bg-gray-50 text-gray-600 border-gray-200' },
  direto:             { label: 'Direto',            className: 'bg-gray-50 text-gray-600 border-gray-200' },
  corretor:           { label: 'Corretor',          className: 'bg-amber-50 text-amber-700 border-amber-200' },
  imobiliaria:        { label: 'Imobiliária',       className: 'bg-orange-50 text-orange-700 border-orange-200' },
  construtora:        { label: 'Construtora',       className: 'bg-orange-50 text-orange-700 border-orange-200' },
  parceiro_comercial: { label: 'Parceiro',          className: 'bg-purple-50 text-purple-700 border-purple-200' },
}

export function LeadOrigemBadge({ origem }: { origem: LeadOrigem }) {
  const { label, className } = CONFIG[origem]
  return (
    <Badge variant="outline" className={`text-xs ${className}`}>
      {label}
    </Badge>
  )
}