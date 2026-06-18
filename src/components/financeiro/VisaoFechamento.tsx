'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Lock,
  Unlock,
  CheckCircle2,
  CircleDashed,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
  FileText,
  Users,
  TrendingUp,
  ClipboardCheck,
  Loader2,
} from 'lucide-react'
import { type FinFechamento, type FinFechamentoStatus } from '@/types/financeiro'
import {
  usePuxarProcessos,
  usePuxarContratos,
  useGerarComissoesAPagar,
  useGerarFolha,
  useExecutarConferencias,
  useAprovarFechamento,
  useTravarFechamento,
  useReabrirFechamento,
} from '@/hooks/financeiro/useFechamento'
import { useConferencias } from '@/hooks/financeiro/useConferencias'

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

interface Props {
  fechamento: FinFechamento
}

export function VisaoFechamento({ fechamento }: Props) {
  const [modalReabrir, setModalReabrir] = useState(false)
  const [motivoReabrir, setMotivoReabrir] = useState('')

  const { data: conferencias = [] } = useConferencias(fechamento.id)
  const conferenciasCount = {
    pendente: conferencias.filter(c => c.status === 'pendente').length,
    critico: conferencias.filter(c => c.status === 'pendente' && c.severidade === 'critico').length,
  }

  const puxarProcessos = usePuxarProcessos()
  const puxarContratos = usePuxarContratos()
  const gerarComissoes = useGerarComissoesAPagar()
  const gerarFolha = useGerarFolha()
  const executarConferencias = useExecutarConferencias()
  const aprovar = useAprovarFechamento()
  const travar = useTravarFechamento()
  const reabrir = useReabrirFechamento()

  const travado = fechamento.status === 'travado'

  const ETAPAS = [
    {
      numero: 1,
      titulo: 'Puxar Processos',
      descricao: 'Importar financiamentos/CGI e contratos emitidos do mês',
      icone: <FileText className="h-4 w-4" />,
      acao: () => puxarProcessos.mutate(fechamento.id),
      carregando: puxarProcessos.isPending,
      desabilitado: travado,
      acaoSecundaria: {
        label: 'Contratos',
        acao: () => puxarContratos.mutate(fechamento.id),
        carregando: puxarContratos.isPending,
      },
    },
    {
      numero: 2,
      titulo: 'Gerar Comissões',
      descricao: 'Calcular comissões a pagar por pessoa',
      icone: <TrendingUp className="h-4 w-4" />,
      acao: () => gerarComissoes.mutate(fechamento.id),
      carregando: gerarComissoes.isPending,
      desabilitado: travado,
    },
    {
      numero: 3,
      titulo: 'Gerar Folha',
      descricao: 'Montar folha mensal por funcionário',
      icone: <Users className="h-4 w-4" />,
      acao: () => gerarFolha.mutate(fechamento.id),
      carregando: gerarFolha.isPending,
      desabilitado: travado,
    },
    {
      numero: 4,
      titulo: 'Executar Conferências',
      descricao: 'Rodar checks automáticos e detectar divergências',
      icone: <ClipboardCheck className="h-4 w-4" />,
      acao: () => executarConferencias.mutate(fechamento.id),
      carregando: executarConferencias.isPending,
      desabilitado: travado,
      badge: conferenciasCount.critico > 0
        ? <Badge className="bg-red-100 text-red-700 text-xs">{conferenciasCount.critico} crítica(s)</Badge>
        : conferenciasCount.pendente > 0
          ? <Badge className="bg-yellow-100 text-yellow-700 text-xs">{conferenciasCount.pendente} pendente(s)</Badge>
          : null,
    },
    {
      numero: 5,
      titulo: 'Aprovar Fechamento',
      descricao: 'Confirmar todos os valores e aprovar',
      icone: <CheckCircle2 className="h-4 w-4" />,
      acao: () => aprovar.mutate(fechamento.id),
      carregando: aprovar.isPending,
      desabilitado: travado || fechamento.status === 'aprovado' || fechamento.status === 'pago' || conferenciasCount.critico > 0,
      destaque: true,
    },
    {
      numero: 6,
      titulo: 'Travar Mês',
      descricao: 'Encerrar definitivamente o fechamento',
      icone: <Lock className="h-4 w-4" />,
      acao: () => travar.mutate(fechamento.id),
      carregando: travar.isPending,
      desabilitado: !['aprovado', 'pago'].includes(fechamento.status),
      perigo: true,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#253B29]">
            Fechamento {String(fechamento.competencia_mes).padStart(2, '0')}/{fechamento.competencia_ano}
          </h2>
          <p className="text-sm text-gray-500">
            Aberto em {new Date(fechamento.aberto_em).toLocaleDateString('pt-BR')}
            {fechamento.aprovado_em && ` · Aprovado em ${new Date(fechamento.aprovado_em).toLocaleDateString('pt-BR')}`}
            {fechamento.travado_em && ` · Travado em ${new Date(fechamento.travado_em).toLocaleDateString('pt-BR')}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={STATUS_COLORS[fechamento.status]}>
            {STATUS_LABELS[fechamento.status]}
          </Badge>
          {travado && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalReabrir(true)}
              className="gap-1 text-orange-600 border-orange-200 hover:bg-orange-50"
            >
              <Unlock className="h-3.5 w-3.5" />
              Reabrir
            </Button>
          )}
        </div>
      </div>

      {/* Alerta de travamento */}
      {travado && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <Lock className="h-4 w-4 flex-shrink-0" />
          <span>Este fechamento está travado. Nenhuma alteração é permitida sem reabertura auditada.</span>
        </div>
      )}

      {/* Alerta de conferências críticas */}
      {conferenciasCount.critico > 0 && !travado && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>
            Existem <strong>{conferenciasCount.critico}</strong> conferência(s) crítica(s) pendente(s).
            Resolva-as antes de aprovar.
          </span>
        </div>
      )}

      {/* Stepper */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ETAPAS.map((etapa) => (
          <Card
            key={etapa.numero}
            className={`border transition-all ${
              etapa.destaque
                ? 'border-[#C2AA6A] bg-[#f9f6ec]'
                : etapa.perigo
                  ? 'border-red-200'
                  : 'border-gray-200'
            }`}
          >
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-gray-800">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                    {etapa.numero}
                  </span>
                  {etapa.titulo}
                </div>
                {etapa.badge}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <p className="text-xs text-gray-500">{etapa.descricao}</p>
              {etapa.acaoSecundaria ? (
                <div className="grid grid-cols-2 gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-xs"
                    onClick={etapa.acao}
                    disabled={etapa.desabilitado || etapa.carregando}
                  >
                    {etapa.carregando ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                    Emissões
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-xs"
                    onClick={etapa.acaoSecundaria.acao}
                    disabled={etapa.desabilitado || etapa.acaoSecundaria.carregando}
                  >
                    {etapa.acaoSecundaria.carregando ? <Loader2 className="h-3 w-3 animate-spin" /> : <ClipboardCheck className="h-3 w-3" />}
                    Contratos
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant={etapa.perigo ? 'destructive' : etapa.destaque ? 'default' : 'outline'}
                  className={`w-full gap-1 text-xs ${
                    etapa.destaque && !etapa.perigo
                      ? 'bg-[#253B29] hover:bg-[#1a2a1d] text-white'
                      : ''
                  }`}
                  onClick={etapa.acao}
                  disabled={etapa.desabilitado || etapa.carregando}
                >
                  {etapa.carregando ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : travado ? (
                    <Lock className="h-3.5 w-3.5" />
                  ) : (
                    etapa.icone
                  )}
                  {etapa.carregando ? 'Aguarde...' : travado ? 'Travado' : 'Executar'}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal Reabrir */}
      <Dialog open={modalReabrir} onOpenChange={setModalReabrir}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700">
              <Unlock className="h-5 w-5" />
              Reabrir Fechamento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-600">
              A reabertura será registrada no log de auditoria. Informe o motivo:
            </p>
            <div className="space-y-1">
              <Label htmlFor="motivo">Motivo *</Label>
              <Textarea
                id="motivo"
                value={motivoReabrir}
                onChange={e => setMotivoReabrir(e.target.value)}
                placeholder="Ex: Correção de valor de comissão após recálculo..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalReabrir(false)}>
              Cancelar
            </Button>
            <Button
              variant="default"
              className="bg-orange-600 hover:bg-orange-700"
              disabled={!motivoReabrir.trim() || reabrir.isPending}
              onClick={() => {
                reabrir.mutate(
                  { fechamento_id: fechamento.id, motivo: motivoReabrir },
                  { onSuccess: () => { setModalReabrir(false); setMotivoReabrir('') } }
                )
              }}
            >
              {reabrir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reabrir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
