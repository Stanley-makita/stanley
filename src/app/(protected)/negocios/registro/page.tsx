'use client'

import { useState } from 'react'
import { VisaoCards } from '@/components/processos/visoes/VisaoCards'
import { NovoProcessoRapidoModal } from '@/components/processos/NovoProcessoRapidoModal'
import { Button } from '@/components/ui/button'
import { usePermissao } from '@/hooks/auth/usePermissao'
import { Plus } from 'lucide-react'

export default function RegistroPage() {
  const [modalAberto, setModalAberto] = useState(false)
  const { pode } = usePermissao()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#253B29]">Registro</h1>
          <p className="text-sm text-gray-500">Acompanhamento de ITBI, cartório e entrega ao banco</p>
        </div>

        {pode('processos.criar') && (
          <Button className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5" onClick={() => setModalAberto(true)}>
            <Plus className="h-4 w-4" />
            Novo Processo
          </Button>
        )}
      </div>

      <VisaoCards modulo="registro" produtoFixo="registro" />

      <NovoProcessoRapidoModal
        aberto={modalAberto}
        onFechar={() => setModalAberto(false)}
        moduloInicial="registro"
      />
    </div>
  )
}
