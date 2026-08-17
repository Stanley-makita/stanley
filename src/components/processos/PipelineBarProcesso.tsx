'use client'

import { useState } from 'react'
import { useAvancarFase } from '@/hooks/processos/useProcessoFasesHistorico'
import { usePermissao } from '@/hooks/auth/usePermissao'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { FaseBreadcrumbBar } from '@/components/shared/FaseBreadcrumbBar'
import { AlertTriangle } from 'lucide-react'
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
  const [faseRetornoPendente, setFaseRetornoPendente] = useState<Fase | null>(null)
  const [motivoRetorno, setMotivoRetorno] = useState('')
  const avancarFase = useAvancarFase(processo.id)
  const { pode } = usePermissao()
  const podeRetroceder = pode('processos.retroceder_fase')

  const idxAtual = fases.findIndex((f) => f.id === processo.fase_atual_id)

  // Processo só avança sequencialmente (uma fase de cada vez) — diferente do Lead,
  // que permite pular direto pra qualquer fase futura. Regra de negócio já existente.
  // Retroceder pra qualquer fase já concluída é liberado só pra quem tem
  // processos.retroceder_fase (admin/gestor por padrão) — trava real fica no
  // trigger do banco (fn_bloquear_retrocesso_fase_sem_permissao), isto aqui é
  // só a UX de não oferecer o clique pra quem não pode.
  function handleClicarFase(fase: Fase, idx: number) {
    if (idx < idxAtual) {
      if (!podeRetroceder) return
      setMotivoRetorno('')
      setFaseRetornoPendente(fase)
      return
    }
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
      setFasePendente(null)
    } catch {
      // Erro já exibido via onError de useAvancarFase — mantém o dialog aberto
      // para o usuário tentar de novo, em vez de fechar como se tivesse avançado.
    }
  }

  async function handleConfirmarRetorno() {
    if (!faseRetornoPendente || !motivoRetorno.trim()) return
    try {
      await avancarFase.mutateAsync({
        faseId: faseRetornoPendente.id,
        observacao: motivoRetorno.trim(),
        retrocedendo: true,
      })
      setFaseRetornoPendente(null)
      setMotivoRetorno('')
    } catch {
      // Erro já exibido via onError de useAvancarFase — mantém o dialog aberto.
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
        podeClicar={(idx) => idx === idxAtual + 1 || (podeRetroceder && idx < idxAtual)}
        onClicarFase={handleClicarFase}
        disabled={avancarFase.isPending}
      />

      {/* Modal de confirmação (avançar) */}
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

      {/* Modal de confirmação (retornar fase) — só admin/gestor chega aqui.
          Itens já marcados no Checklist da Fase continuam marcados: eles são
          vinculados a processo+item, não à fase atual. */}
      <Dialog open={!!faseRetornoPendente} onOpenChange={(o) => { if (!o) { setFaseRetornoPendente(null); setMotivoRetorno('') } }}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              Retornar "{nomeDisplay}" para "{faseRetornoPendente?.nome}"?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">
            O processo retornará para uma fase anterior. Esta ação fica registrada no histórico.
            Os itens já marcados no checklist continuam marcados.
          </p>
          <div className="space-y-1.5">
            <Label>Motivo <span className="text-red-500">*</span></Label>
            <Textarea
              value={motivoRetorno}
              onChange={(e) => setMotivoRetorno(e.target.value)}
              placeholder="Descreva o motivo do retorno..."
              rows={3}
              className="resize-none"
            />
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => { setFaseRetornoPendente(null); setMotivoRetorno('') }}
              disabled={avancarFase.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="flex-1"
              disabled={!motivoRetorno.trim() || avancarFase.isPending}
              onClick={handleConfirmarRetorno}
            >
              {avancarFase.isPending ? 'Salvando...' : 'Confirmar retorno'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
