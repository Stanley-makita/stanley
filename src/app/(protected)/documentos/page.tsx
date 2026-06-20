import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/empty-state'
import { FileText } from 'lucide-react'

export default function DocumentosPage() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Documentos"
        description="Gestão de documentos"
      />

      <div className="rounded-xl border border-gray-200 bg-white">
        <EmptyState
          icon={FileText}
          title="Biblioteca de documentos em preparação"
          description="Os documentos já podem ser acessados nos detalhes de leads e processos vinculados."
          className="min-h-[280px] px-6"
        />
      </div>
    </div>
  )
}
