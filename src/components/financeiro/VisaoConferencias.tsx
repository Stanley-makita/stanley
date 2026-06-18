'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  RefreshCw,
  Loader2,
} from 'lucide-react'
import { useState } from 'react'
import { useConferencias, useResolverConferencia } from '@/hooks/financeiro/useConferencias'
import { useExecutarConferencias } from '@/hooks/financeiro/useFechamento'
import { type FinConferencia, type FinSeveridadeConferencia } from '@/types/financeiro'

const SEVERIDADE_CONFIG: Record<FinSeveridadeConferencia, { icon: React.ReactNode; label: string; classe: string }> = {
  critico: {
    icon: <XCircle className="h-4 w-4 text-red-500" />,
    label: 'Crítico',
    classe: 'border-red-200 bg-red-50',
  },
  alerta: {
    icon: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
    label: 'Alerta',
    classe: 'border-yellow-200 bg-yellow-50',
  },
  info: {
    icon: <Info className="h-4 w-4 text-blue-400" />,
    label: 'Info',
    classe: 'border-blue-100 bg-blue-50',
  },
}

interface Props {
  fechamento_id: string
  travado: boolean
}

export function VisaoConferencias({ fechamento_id, travado }: Props) {
  const { data: conferencias = [], isLoading } = useConferencias(fechamento_id)
  const resolver = useResolverConferencia()
  const executar = useExecutarConferencias()

  const [modalIgnorar, setModalIgnorar] = useState<FinConferencia | null>(null)
  const [justificativa, setJustificativa] = useState('')

  const pendentes = conferencias.filter(c => c.status === 'pendente')
  const criticos = pendentes.filter(c => c.severidade === 'critico')
  const resolvidas = conferencias.filter(c => c.status !== 'pendente')

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <div className="flex items-center gap-1.5 text-sm">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="font-medium">{criticos.length}</span>
            <span className="text-gray-500">crítica(s)</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <span className="font-medium">{pendentes.filter(c => c.severidade === 'alerta').length}</span>
            <span className="text-gray-500">alerta(s)</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="font-medium">{resolvidas.length}</span>
            <span className="text-gray-500">resolvida(s)</span>
          </div>
        </div>
        {!travado && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => executar.mutate(fechamento_id)}
            disabled={executar.isPending}
          >
            {executar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Re-executar conferências
          </Button>
        )}
      </div>

      {/* Pendentes */}
      {pendentes.length === 0 && !isLoading && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-800">Todas as conferências estão em ordem!</p>
            <p className="text-xs text-green-600">O fechamento pode ser aprovado.</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="py-8 text-center text-sm text-gray-400">Carregando...</div>
      ) : (
        <div className="space-y-2">
          {/* Pendentes primeiro */}
          {pendentes.map(conf => {
            const cfg = SEVERIDADE_CONFIG[conf.severidade]
            return (
              <div
                key={conf.id}
                className={`flex items-start gap-3 rounded-lg border p-3 ${cfg.classe}`}
              >
                <div className="flex-shrink-0 mt-0.5">{cfg.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-800">{conf.titulo}</p>
                    <Badge className="text-xs bg-white border text-gray-500">{cfg.label}</Badge>
                  </div>
                  {conf.descricao && (
                    <p className="text-xs text-gray-600 mt-0.5">{conf.descricao}</p>
                  )}
                </div>
                {!travado && (
                  <div className="flex gap-1.5 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs bg-white"
                      onClick={() => resolver.mutate({ id: conf.id, status: 'ok' })}
                      disabled={resolver.isPending}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" />
                      OK
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-gray-500"
                      onClick={() => { setModalIgnorar(conf); setJustificativa('') }}
                    >
                      Ignorar
                    </Button>
                  </div>
                )}
              </div>
            )
          })}

          {/* Resolvidas */}
          {resolvidas.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-gray-500 mb-2">Resolvidas / Ignoradas</p>
              {resolvidas.map(conf => (
                <div
                  key={conf.id}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-2.5 mb-1.5"
                >
                  {conf.status === 'ok'
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                    : <XCircle className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                  }
                  <span className="text-xs text-gray-600 flex-1">{conf.titulo}</span>
                  <Badge className={`text-xs ${conf.status === 'ok' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {conf.status === 'ok' ? 'OK' : 'Ignorada'}
                  </Badge>
                  {conf.resolvido_por_usuario && (
                    <span className="text-xs text-gray-400">{conf.resolvido_por_usuario.nome}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal Ignorar */}
      <Dialog open={!!modalIgnorar} onOpenChange={() => setModalIgnorar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ignorar Conferência</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium text-gray-700">{modalIgnorar?.titulo}</p>
            <div className="space-y-1">
              <p className="text-xs text-gray-500">Justificativa (opcional)</p>
              <Textarea
                value={justificativa}
                onChange={e => setJustificativa(e.target.value)}
                rows={2}
                placeholder="Ex: Verificado manualmente, não há impacto..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalIgnorar(null)}>Cancelar</Button>
            <Button
              variant="default"
              className="bg-gray-600 hover:bg-gray-700"
              disabled={resolver.isPending}
              onClick={() => {
                if (!modalIgnorar) return
                resolver.mutate(
                  { id: modalIgnorar.id, status: 'ignorada', observacao: justificativa || undefined },
                  { onSuccess: () => setModalIgnorar(null) }
                )
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
