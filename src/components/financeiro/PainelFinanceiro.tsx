'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Plus,
} from 'lucide-react'
import { type FinFechamento, type FinFechamentoStatus } from '@/types/financeiro'
import { useFechamentos } from '@/hooks/financeiro/useFechamento'
import { useConferencias } from '@/hooks/financeiro/useConferencias'
import { useContasAReceber } from '@/hooks/financeiro/useContasAReceber'
import { useDespesas } from '@/hooks/financeiro/useDespesas'
import { formatarMoeda } from '@/lib/utils'

const STATUS_LABELS: Record<FinFechamentoStatus, string> = {
  rascunho: 'Rascunho',
  em_conferencia: 'Em Conferência',
  aprovado: 'Aprovado',
  pago: 'Pago',
  travado: 'Travado',
  reaberto: 'Reaberto',
}

const STATUS_COLORS: Record<FinFechamentoStatus, string> = {
  rascunho: 'bg-gray-100 text-gray-700',
  em_conferencia: 'bg-yellow-100 text-yellow-800',
  aprovado: 'bg-blue-100 text-blue-800',
  pago: 'bg-green-100 text-green-800',
  travado: 'bg-red-100 text-red-800',
  reaberto: 'bg-orange-100 text-orange-800',
}

interface PainelFechamentoProps {
  fechamento: FinFechamento
  onIrParaFechamento: () => void
}

function PainelFechamentoCard({ fechamento, onIrParaFechamento }: PainelFechamentoProps) {
  const { data: conferencias = [] } = useConferencias(fechamento.id)
  const { data: contas = [] } = useContasAReceber(fechamento.id)
  const { data: despesas = [] } = useDespesas(fechamento.id)

  const criticos = conferencias.filter(c => c.status === 'pendente' && c.severidade === 'critico').length
  const totalAReceber = contas.reduce((s, c) => s + c.valor_previsto - c.valor_recebido, 0)
  const totalDespPendentes = despesas.filter(d => !['paga', 'cancelada'].includes(d.status)).reduce((s, d) => s + d.valor, 0)

  return (
    <Card className={`border-2 ${criticos > 0 ? 'border-red-300' : fechamento.status === 'travado' ? 'border-gray-300' : 'border-[#C2AA6A]'}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="text-[#253B29]">
            {String(fechamento.competencia_mes).padStart(2, '0')}/{fechamento.competencia_ano}
          </span>
          <Badge className={STATUS_COLORS[fechamento.status]}>
            {STATUS_LABELS[fechamento.status]}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-xs text-gray-500">A receber</p>
            <p className="font-semibold text-orange-600">{formatarMoeda(totalAReceber)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Despesas pendentes</p>
            <p className="font-semibold text-red-600">{formatarMoeda(totalDespPendentes)}</p>
          </div>
        </div>

        {criticos > 0 && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded p-2">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{criticos} conferência(s) crítica(s) pendente(s)</span>
          </div>
        )}

        {fechamento.status === 'travado' && (
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded p-2">
            <Lock className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Mês encerrado em {fechamento.travado_em ? new Date(fechamento.travado_em).toLocaleDateString('pt-BR') : '—'}</span>
          </div>
        )}

        <Button size="sm" variant="outline" className="w-full text-xs" onClick={onIrParaFechamento}>
          Ir para Fechamento
        </Button>
      </CardContent>
    </Card>
  )
}

interface Props {
  onAbrirFechamento: () => void
  onIrParaFechamento: (mes: number, ano: number) => void
}

export function PainelFinanceiro({ onAbrirFechamento, onIrParaFechamento }: Props) {
  const { data: fechamentos = [], isLoading } = useFechamentos()

  const fechamentoAtual = fechamentos[0]
  const historico = fechamentos.slice(1, 5)

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
  }

  return (
    <div className="space-y-6">
      {/* Sem fechamento */}
      {!fechamentoAtual && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
          <DollarSign className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-medium mb-1">Nenhum fechamento aberto</p>
          <p className="text-sm text-gray-400 mb-4">Abra um novo fechamento para iniciar o processo do mês.</p>
          <Button className="bg-[#253B29] hover:bg-[#1a2a1d] text-white gap-1" onClick={onAbrirFechamento}>
            <Plus className="h-4 w-4" />
            Abrir Fechamento
          </Button>
        </div>
      )}

      {/* Fechamento atual */}
      {fechamentoAtual && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Fechamento Atual</h3>
            {!['rascunho', 'em_conferencia', 'reaberto'].includes(fechamentoAtual.status) && (
              <Button size="sm" className="bg-[#253B29] hover:bg-[#1a2a1d] text-white gap-1 text-xs" onClick={onAbrirFechamento}>
                <Plus className="h-3.5 w-3.5" />
                Novo Fechamento
              </Button>
            )}
          </div>
          <PainelFechamentoCard
            fechamento={fechamentoAtual}
            onIrParaFechamento={() => onIrParaFechamento(fechamentoAtual.competencia_mes, fechamentoAtual.competencia_ano)}
          />
        </div>
      )}

      {/* Histórico */}
      {historico.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Histórico</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {historico.map(f => (
              <Card key={f.id} className="border-gray-200">
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {String(f.competencia_mes).padStart(2, '0')}/{f.competencia_ano}
                    </span>
                    <Badge className={`text-xs ${STATUS_COLORS[f.status]}`}>
                      {STATUS_LABELS[f.status]}
                    </Badge>
                  </div>
                  {f.aprovado_em && (
                    <p className="text-xs text-gray-400 mt-1">
                      Aprovado em {new Date(f.aprovado_em).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2 w-full text-xs h-7"
                    onClick={() => onIrParaFechamento(f.competencia_mes, f.competencia_ano)}
                  >
                    Ver fechamento
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
