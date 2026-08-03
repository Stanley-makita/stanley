'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { VisaoEmissoes } from '@/components/processos/visoes/VisaoEmissoes'

interface Props {
  aberto: boolean
  onFechar: () => void
}

// Reaproveita o layout já existente da tela de Emissões (Negócios >
// Financiamento > Emissões) dentro de um modal no Financeiro, acessível a
// partir do card "Fechamento Processos" do Painel.
export function ModalDetalheEmissoes({ aberto, onFechar }: Props) {
  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar() }}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhamento de Emissões — Financiamento</DialogTitle>
        </DialogHeader>
        <VisaoEmissoes />
      </DialogContent>
    </Dialog>
  )
}
