'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Printer, Send, FileText, Eye } from 'lucide-react'
import { toast } from 'sonner'
import type { ResultadoConsorcio } from '@/lib/simuladorConsorcio/tipos'
import type { VarianteProposta } from '@/lib/simuladorConsorcio/gerarProposta'
import { useSalvarConsorcioCentral } from '@/hooks/simulacoes/useSalvarConsorcioCentral'
import { SimulacaoCompartilharModal } from '@/components/simulacoes/SimulacaoCompartilharModal'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  resultado: ResultadoConsorcio | null
  simulacaoExistenteId?: string
}

function AbaVariante({
  variante,
  resultado,
  simulacaoExistenteId,
}: {
  variante: VarianteProposta
  resultado: ResultadoConsorcio | null
  simulacaoExistenteId?: string
}) {
  const [gerando, setGerando] = useState(false)
  const [visualizando, setVisualizando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [modalCompartilhar, setModalCompartilhar] = useState<{ id: string; nome: string } | null>(null)
  const salvarConsorcioCentral = useSalvarConsorcioCentral()

  const nomeVariante = variante === 'detalhada' ? 'Detalhada' : 'Resumida'

  async function imprimir() {
    if (!resultado) return
    setGerando(true)
    try {
      const { gerarPropostaConsorcio } = await import('@/lib/simuladorConsorcio/gerarProposta')
      await gerarPropostaConsorcio(resultado, variante)
    } finally {
      setGerando(false)
    }
  }

  async function verNaTela() {
    if (!resultado) return
    setVisualizando(true)
    try {
      const { gerarPropostaConsorcio } = await import('@/lib/simuladorConsorcio/gerarProposta')
      await gerarPropostaConsorcio(resultado, variante, { mode: 'preview' })
    } finally {
      setVisualizando(false)
    }
  }

  async function compartilhar() {
    if (!resultado) return
    const nome = `Proposta de Consórcio (${nomeVariante})${resultado.input.nomeCliente ? ` — ${resultado.input.nomeCliente}` : ''}`
    // Mesmo padrão de SimuladorConsorcio.tsx: reaproveita o ID se a simulação
    // já foi salva (evita duplicar no histórico a cada Compartilhar).
    if (simulacaoExistenteId) {
      setModalCompartilhar({ id: simulacaoExistenteId, nome })
      return
    }
    setEnviando(true)
    try {
      const salvo = await salvarConsorcioCentral.mutateAsync({ resultado })
      setModalCompartilhar({ id: salvo.id, nome })
    } catch {
      toast.error('Erro ao salvar simulação para compartilhamento.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-4 py-4">
      <p className="text-sm text-gray-500">
        {variante === 'detalhada'
          ? 'Uma página só, com todas as parcelas listadas mês a mês.'
          : 'Resumo compacto — condições da carta, estrutura de lance e parcelas agrupadas por faixa de valor.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={verNaTela}
          disabled={!resultado || visualizando}
          variant="outline"
          className="gap-1.5 border-fonti-primary text-fonti-primary hover:bg-fonti-primary/5"
        >
          <Eye className="h-3.5 w-3.5" /> {visualizando ? 'Abrindo...' : 'Ver na tela'}
        </Button>
        <Button
          onClick={imprimir}
          disabled={!resultado || gerando}
          className="gap-1.5 bg-fonti-primary hover:bg-fonti-primary-hover text-white"
        >
          <Printer className="h-3.5 w-3.5" /> {gerando ? 'Gerando...' : 'Imprimir PDF'}
        </Button>
        <Button
          onClick={compartilhar}
          disabled={!resultado || enviando}
          variant="outline"
          className="gap-1.5 border-green-600 text-green-700 hover:bg-green-50"
        >
          <Send className="h-3.5 w-3.5" /> {enviando ? 'Enviando...' : 'Compartilhar'}
        </Button>
      </div>

      {modalCompartilhar && (
        <SimulacaoCompartilharModal
          simulacao={{ id: modalCompartilhar.id, tipo: 'consorcio', nome: modalCompartilhar.nome }}
          bodyExtra={{ variante }}
          onClose={() => setModalCompartilhar(null)}
          onEnviado={() => setModalCompartilhar(null)}
        />
      )}
    </div>
  )
}

export function PropostaModal({ open, onOpenChange, resultado, simulacaoExistenteId }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-fonti-primary">
            <FileText className="h-4 w-4" /> Versão Proposta
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="detalhada">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="detalhada">Detalhada</TabsTrigger>
            <TabsTrigger value="resumida">Resumida</TabsTrigger>
          </TabsList>
          <TabsContent value="detalhada">
            <AbaVariante variante="detalhada" resultado={resultado} simulacaoExistenteId={simulacaoExistenteId} />
          </TabsContent>
          <TabsContent value="resumida">
            <AbaVariante variante="resumida" resultado={resultado} simulacaoExistenteId={simulacaoExistenteId} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
