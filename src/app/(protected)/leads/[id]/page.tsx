'use client'

import { useParams, useRouter } from 'next/navigation'
import { LeadDetalheModal } from '@/components/leads/LeadDetalheModal'

export default function LeadPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  return (
    <LeadDetalheModal
      leadId={id}
      onFechar={() => router.push('/leads')}
    />
  )
}
