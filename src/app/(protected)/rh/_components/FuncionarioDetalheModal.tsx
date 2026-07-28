'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useFerias } from '@/hooks/rh/useFerias'
import { useAssiduidadeFuncionario } from '@/hooks/rh/useAssiduidade'
import { proximaOcorrenciaAnual, formatarTempoDeEmpresa } from '@/lib/rh/datasFuncionario'
import { RH_STATUS_FUNCIONARIO_LABELS, RH_STATUS_FUNCIONARIO_CORES, RH_TIPO_CONTRATO_LABELS } from '@/types/rh'
import type { RhFuncionario } from '@/types/rh'
import { Cake, Building2, Plane, Percent } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'

interface Props {
  funcionario: RhFuncionario | null
  onFechar: () => void
}

function iniciais(nome: string) {
  return nome.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

export function FuncionarioDetalheModal({ funcionario, onFechar }: Props) {
  const { data: ferias = [] } = useFerias({ funcionarioId: funcionario?.id })
  const assiduidade = useAssiduidadeFuncionario(funcionario?.id ?? '', funcionario?.data_admissao ?? '')

  if (!funcionario) return null

  const hoje = new Date()

  const proximasFerias = ferias
    .filter(f => (f.status === 'agendado' || f.status === 'em_andamento') && f.ferias_inicio)
    .sort((a, b) => parseISO(a.ferias_inicio!).getTime() - parseISO(b.ferias_inicio!).getTime())[0] ?? null

  const ultimasFerias = ferias
    .filter(f => f.status === 'concluido' && f.ferias_fim)
    .sort((a, b) => parseISO(b.ferias_fim!).getTime() - parseISO(a.ferias_fim!).getTime())[0] ?? null

  const proximoAniversario = funcionario.data_nascimento
    ? proximaOcorrenciaAnual(parseISO(funcionario.data_nascimento), hoje)
    : null

  const tempoDeEmpresa = funcionario.data_admissao
    ? formatarTempoDeEmpresa(parseISO(funcionario.data_admissao), hoje)
    : '—'

  return (
    <Dialog open={!!funcionario} onOpenChange={o => { if (!o) onFechar() }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Detalhe de {funcionario.nome}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
          <div className="w-11 h-11 rounded-full bg-fonti-accent-hover flex items-center justify-center text-fonti-primary text-sm font-bold shrink-0">
            {iniciais(funcionario.nome)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-800 truncate">{funcionario.nome}</p>
            <p className="text-xs text-gray-400 truncate">
              {funcionario.cargo?.nome ?? 'Sem cargo'}
              {funcionario.cargo?.departamento?.nome ? ` · ${funcionario.cargo.departamento.nome}` : ''}
            </p>
          </div>
          <span className={cn('text-xs font-medium rounded-full px-2 py-0.5 shrink-0', RH_STATUS_FUNCIONARIO_CORES[funcionario.status])}>
            {RH_STATUS_FUNCIONARIO_LABELS[funcionario.status]}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Tempo de Empresa</p>
            <p className="text-sm font-semibold text-gray-800">{tempoDeEmpresa}</p>
            <p className="text-[10px] text-gray-400">
              Admitido em {format(parseISO(funcionario.data_admissao), 'dd/MM/yyyy', { locale: ptBR })} · {RH_TIPO_CONTRATO_LABELS[funcionario.tipo_contrato]}
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-1"><Cake className="h-3 w-3 text-pink-500" /><p className="text-[10px] text-gray-400 uppercase tracking-wide">Próximo Aniversário</p></div>
            <p className="text-sm font-semibold text-gray-800">
              {proximoAniversario ? format(proximoAniversario, "dd 'de' MMMM", { locale: ptBR }) : '—'}
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-1"><Plane className="h-3 w-3 text-blue-500" /><p className="text-[10px] text-gray-400 uppercase tracking-wide">Próximas Férias</p></div>
            {proximasFerias ? (
              <>
                <p className="text-sm font-semibold text-gray-800">{format(parseISO(proximasFerias.ferias_inicio!), 'dd/MM/yyyy', { locale: ptBR })}</p>
                <p className="text-[10px] text-gray-400">{proximasFerias.dias_totais} dias</p>
              </>
            ) : <p className="text-sm text-gray-400">Nenhuma agendada</p>}
          </div>

          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-1"><Building2 className="h-3 w-3 text-amber-500" /><p className="text-[10px] text-gray-400 uppercase tracking-wide">Últimas Férias</p></div>
            {ultimasFerias ? (
              <>
                <p className="text-sm font-semibold text-gray-800">{format(parseISO(ultimasFerias.ferias_fim!), 'dd/MM/yyyy', { locale: ptBR })}</p>
                <p className="text-[10px] text-gray-400">{ultimasFerias.dias_totais} dias</p>
              </>
            ) : <p className="text-sm text-gray-400">Nenhuma registrada</p>}
          </div>

          <div className="col-span-2 bg-gray-50 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-1"><Percent className="h-3 w-3 text-green-600" /><p className="text-[10px] text-gray-400 uppercase tracking-wide">Assiduidade (últimos 30 dias)</p></div>
            {assiduidade.isLoading ? (
              <p className="text-sm text-gray-400">Calculando...</p>
            ) : (
              <>
                <p className="text-sm font-semibold text-gray-800">{assiduidade.data?.percentual.toFixed(0) ?? '—'}%</p>
                <p className="text-[10px] text-gray-400">
                  {assiduidade.data ? `${assiduidade.data.diasUteisTotal - assiduidade.data.diasFalta}/${assiduidade.data.diasUteisTotal} dias úteis sem falta injustificada` : ''}
                </p>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
