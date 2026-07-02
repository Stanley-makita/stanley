'use client'

import { useState } from 'react'
import { useAvancarFase } from '@/hooks/processos/useProcessoFasesHistorico'
import { useEnviarParaRegistro } from '@/hooks/processos/useEnviarParaRegistro'
import { FINANCIAMENTO_MODALIDADES } from '@/lib/processos/fasesConfig'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FaseBreadcrumbBar } from '@/components/shared/FaseBreadcrumbBar'
import { toast } from 'sonner'
import type { Processo } from '@/types/processos'
import type { Fase } from '@/types/configuracoes'

interface Props {
  processo: Processo
  fases: Fase[]
  itensObrigatoriosPendentes?: boolean
  dadosFinanceirosPendentes?: boolean
}

export function PipelineBarProcesso({ processo, fases, itensObrigatoriosPendentes, dadosFinanceirosPendentes }: Props) {
  const [fasePendente, setFasePendente] = useState<Fase | null>(null)
  const avancarFase = useAvancarFase(processo.id)
  const enviarParaRegistro = useEnviarParaRegistro()

  const idxAtual = fases.findIndex((f) => f.id === processo.fase_atual_id)

  // Processo só avança sequencialmente (uma fase de cada vez) — diferente do Lead,
  // que permite pular direto pra qualquer fase futura. Regra de negócio já existente.
  function handleClicarFase(fase: Fase, idx: number) {
    if (idx !== idxAtual + 1) return

    if (dadosFinanceirosPendentes) {
      toast.error('Existem informações financeiras obrigatórias pendentes.', {
        description: 'Complete os Dados do Negócio para continuar.',
      })
      return
    }
    if (itensObrigatoriosPendentes) {
      toast.error('Complete os itens obrigatórios do checklist antes de avançar.')
      return
    }

    setFasePendente(fase)
  }

  async function handleConfirmar() {
    if (!fasePendente) return
    try {
      await avancarFase.mutateAsync({ faseId: fasePendente.id })
      if (
        fasePendente.nome.trim().toLowerCase() === 'emitido' &&
        FINANCIAMENTO_MODALIDADES.has(processo.modalidade)
      ) {
        enviarParaRegistro.mutate(processo)
      }
      setFasePendente(null)
    } catch {
      // Erro já exibido via onError de useAvancarFase — mantém o dialog aberto
      // para o usuário tentar de novo, em vez de fechar como se tivesse avançado.
    }
  }

  const nomeDisplay = processo.compradores?.find((c) => c.principal)?.nome
    ?? processo.compradores?.[0]?.nome
    ?? processo.nome_imovel

  return (
    <>
      <FaseBreadcrumbBar
        fases={fases}
        faseAtualId={processo.fase_atual_id}
        podeClicar={(idx) => idx === idxAtual + 1}
        onClicarFase={handleClicarFase}
        disabled={avancarFase.isPending}
      />

      {/* Modal de confirmação */}
      <Dialog open={!!fasePendente} onOpenChange={(o) => { if (!o) setFasePendente(null) }}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-fonti-primary">Avançar Processo</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-700 py-2">
            Deseja avançar <strong>{nomeDisplay}</strong> para a fase{' '}
            <strong>{fasePendente?.nome}</strong>?
          </p>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setFasePendente(null)}
              disabled={avancarFase.isPending}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="flex-1 bg-fonti-primary hover:bg-fonti-primary-hover text-white"
              onClick={handleConfirmar}
              disabled={avancarFase.isPending}
            >
              {avancarFase.isPending ? 'Avançando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
