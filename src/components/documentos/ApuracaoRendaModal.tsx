'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Loader2, TrendingUp, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ApuracaoRenda } from '@/hooks/leads/useApuracaoRenda'
import type { ResultadoApuracao, IdentificacaoExtrato, AlertaExtrato } from '@/lib/documentos/apurar-renda'

interface DocumentoSimples {
  id: string
  nome_original: string
  classificacao: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  leadId?: string | null
  processoId?: string | null
  documentos: DocumentoSimples[]
  ultimaApuracao: ApuracaoRenda | null
}

type Estado = 'qualificando' | 'preview' | 'analisando' | 'resultado'

const LABEL_IDENTIFICACAO: Record<string, string> = {
  possivel_salario:        'Possível salário',
  pro_labore:              'Possível pró-labore',
  movimentacao_propria:    'Movimentação entre contas',
  transferencia_frequente: 'Transferências frequentes',
  receita_empresa:         'Receita de empresa',
}

const COR_IDENTIFICACAO: Record<string, string> = {
  possivel_salario:        'bg-green-50 text-green-700 border-green-200',
  pro_labore:              'bg-blue-50 text-blue-700 border-blue-200',
  movimentacao_propria:    'bg-gray-50 text-gray-600 border-gray-200',
  transferencia_frequente: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  receita_empresa:         'bg-purple-50 text-purple-700 border-purple-200',
}

const LABEL_ALERTA: Record<string, string> = {
  movimentacao_atipica:           'Movimentação atípica identificada',
  extrato_incompleto:             'Extrato incompleto',
  alta_variacao:                  'Alta variação entre meses',
  credito_extraordinario:         'Crédito extraordinário no período',
  baixa_confianca:                'Análise com baixa confiança',
  incompativel_renda_declarada:   'Divergência com renda declarada',
}

const COR_ALERTA: Record<string, string> = {
  movimentacao_atipica:           'bg-orange-50 text-orange-700 border-orange-200',
  extrato_incompleto:             'bg-yellow-50 text-yellow-700 border-yellow-200',
  alta_variacao:                  'bg-yellow-50 text-yellow-700 border-yellow-200',
  credito_extraordinario:         'bg-orange-50 text-orange-700 border-orange-200',
  baixa_confianca:                'bg-red-50 text-red-700 border-red-200',
  incompativel_renda_declarada:   'bg-orange-50 text-orange-700 border-orange-200',
}

const COR_CONFIANCA: Record<string, string> = {
  alta:  'bg-green-50 text-green-700 border-green-200',
  media: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  baixa: 'bg-red-50 text-red-700 border-red-200',
}

const LABEL_STATUS: Record<string, string> = {
  concluida:  'Concluída',
  revisada:   'Revisada',
  descartada: 'Descartada',
  pendente:   'Pendente',
}

function moeda(valor: number | null | undefined) {
  if (valor == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

function BadgeConfianca({ confianca }: { confianca: string | null }) {
  if (!confianca) return null
  const labels: Record<string, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${COR_CONFIANCA[confianca] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
      Confiança: {labels[confianca] ?? confianca}
    </span>
  )
}

export function ApuracaoRendaModal({
  open, onClose, leadId, processoId, documentos, ultimaApuracao,
}: Props) {
  const queryClient = useQueryClient()
  const [estado, setEstado] = useState<Estado>(ultimaApuracao ? 'resultado' : 'qualificando')
  const [apuracaoAtual, setApuracaoAtual] = useState<ApuracaoRenda | null>(ultimaApuracao)
  const [confirmarRendaAberto, setConfirmarRendaAberto] = useState(false)
  const [campoRenda, setCampoRenda] = useState<'renda_formal' | 'renda_informal'>('renda_formal')
  const [salvandoStatus, setSalvandoStatus] = useState(false)
  const [salvandoRenda, setSalvandoRenda] = useState(false)
  const [mostrarLancamentos, setMostrarLancamentos] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<string>>(
    () => new Set(documentos.filter(d => d.classificacao === 'extrato_bancario').map(d => d.id))
  )

  function toggleDoc(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleAnalisar() {
    if (selecionados.size === 0) {
      toast.error('Selecione ao menos um documento para analisar.')
      return
    }
    setEstado('analisando')
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token ?? ''

      const endpoint = leadId
        ? `/api/leads/${leadId}/apurar-renda`
        : `/api/processos/${processoId}/apurar-renda`

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ documento_ids: Array.from(selecionados) }),
      })

      const json = await res.json()

      if (!res.ok) {
        toast.error(json.error ?? 'Erro ao analisar extratos')
        setEstado('preview')
        return
      }

      setApuracaoAtual(json.apuracao)
      setEstado('resultado')
      queryClient.invalidateQueries({ queryKey: ['apuracao-renda', leadId ? 'lead_id' : 'processo_id', leadId ?? processoId] })
      toast.success('Análise concluída com sucesso.')
    } catch {
      toast.error('Erro inesperado ao analisar extratos.')
      setEstado('preview')
    }
  }

  async function handleAtualizarStatus(novoStatus: 'revisada' | 'descartada') {
    if (!apuracaoAtual) return
    setSalvandoStatus(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token ?? ''
      const res = await fetch(`/api/apuracoes-renda/${apuracaoAtual.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: novoStatus }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Erro ao atualizar status'); return }
      setApuracaoAtual(json.apuracao)
      queryClient.invalidateQueries({ queryKey: ['apuracao-renda'] })
      toast.success(novoStatus === 'revisada' ? 'Análise validada.' : 'Análise descartada.')
    } catch {
      toast.error('Erro inesperado.')
    } finally {
      setSalvandoStatus(false)
    }
  }

  async function handleAplicarRenda() {
    if (!apuracaoAtual) return
    setSalvandoRenda(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token ?? ''
      const valor = apuracaoAtual.renda_apurada

      const endpoint = leadId ? `/api/leads/${leadId}` : null
      if (!endpoint) { toast.error('Operação disponível apenas para leads.'); return }

      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [campoRenda]: valor }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        toast.error(json.error ?? 'Erro ao atualizar lead')
        return
      }

      queryClient.invalidateQueries({ queryKey: ['lead', leadId] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success(`${campoRenda === 'renda_formal' ? 'Renda Formal' : 'Renda Informal'} atualizada para ${moeda(valor)}.`)
      setConfirmarRendaAberto(false)
    } catch {
      toast.error('Erro inesperado.')
    } finally {
      setSalvandoRenda(false)
    }
  }

  function handleFechar() {
    setEstado(ultimaApuracao ? 'resultado' : 'qualificando')
    setMostrarLancamentos(false)
    onClose()
  }

  const resultado = apuracaoAtual?.resultado_json as ResultadoApuracao | null

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleFechar() }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              Análise de Extratos
            </DialogTitle>
          </DialogHeader>

          {/* ── ESTADO: qualificando ────────────────────────────────── */}
          {estado === 'qualificando' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Selecione os documentos que são extratos bancários para análise de renda:
              </p>
              {documentos.length === 0 ? (
                <p className="text-sm text-gray-400 italic">Nenhum documento anexado.</p>
              ) : (
                <ul className="space-y-2">
                  {documentos.map(doc => (
                    <li key={doc.id}>
                      <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-gray-100 px-3 py-2.5 hover:bg-gray-50 transition-colors">
                        <input
                          type="checkbox"
                          checked={selecionados.has(doc.id)}
                          onChange={() => toggleDoc(doc.id)}
                          className="h-4 w-4 accent-gray-800 shrink-0"
                        />
                        <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                        <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">{doc.nome_original}</span>
                        {doc.classificacao === 'extrato_bancario' && (
                          <span className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5 shrink-0">extrato</span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {ultimaApuracao && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm">
                  <p className="font-medium text-blue-800">Última análise: {format(new Date(ultimaApuracao.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                  <p className="text-blue-600 mt-0.5">Valor sugerido: {moeda(ultimaApuracao.renda_apurada)} · {LABEL_STATUS[ultimaApuracao.status]}</p>
                </div>
              )}
              <p className="text-xs text-gray-500">
                A análise pode levar até 40 segundos. O resultado será salvo e reutilizável.
              </p>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="ghost" onClick={handleFechar}>Cancelar</Button>
                {ultimaApuracao && (
                  <Button variant="outline" onClick={() => setEstado('resultado')}>
                    Ver resultado anterior
                  </Button>
                )}
                <Button onClick={handleAnalisar} disabled={selecionados.size === 0}>
                  {ultimaApuracao ? `Reanalisar (${selecionados.size})` : `Analisar Extratos (${selecionados.size})`}
                </Button>
              </div>
            </div>
          )}

          {/* ── ESTADO: analisando ──────────────────────────────────── */}
          {estado === 'analisando' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
              <div className="text-center">
                <p className="font-medium text-gray-800">Analisando extratos com IA...</p>
                <p className="text-sm text-gray-500 mt-1">Isso pode levar até 40 segundos.</p>
              </div>
            </div>
          )}

          {/* ── ESTADO: resultado ───────────────────────────────────── */}
          {estado === 'resultado' && apuracaoAtual && resultado && (
            <div className="space-y-5">
              {/* Header: data, confiança, status */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">
                  {format(new Date(apuracaoAtual.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
                <BadgeConfianca confianca={apuracaoAtual.confianca} />
                <span className="text-xs px-2 py-0.5 rounded-full border bg-gray-50 text-gray-600 border-gray-200">
                  {LABEL_STATUS[apuracaoAtual.status]}
                </span>
              </div>

              {/* Documentos analisados */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Documentos analisados</p>
                <ul className="space-y-1">
                  {resultado.documentos_analisados.map((d, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      <span>{d.nome}</span>
                      {d.banco && <span className="text-gray-400 text-xs">({d.banco})</span>}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Período */}
              {resultado.periodo_inicio && resultado.periodo_fim && (
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Período:</span>{' '}
                  {resultado.periodo_inicio.replace(/^(\d{4})-(\d{2})$/, '$2/$1')} até{' '}
                  {resultado.periodo_fim.replace(/^(\d{4})-(\d{2})$/, '$2/$1')}
                </p>
              )}

              {/* Alertas */}
              {resultado.alertas.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Alertas</p>
                  {resultado.alertas.map((alerta: AlertaExtrato, i) => (
                    <div key={i} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${COR_ALERTA[alerta.tipo] ?? 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium">{LABEL_ALERTA[alerta.tipo] ?? alerta.tipo}</span>
                        <p className="text-xs mt-0.5 opacity-80">{alerta.descricao}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Resumo por mês */}
              {resultado.meses.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Resumo por mês</p>
                  <div className="space-y-3">
                    {resultado.meses.map((m, i) => (
                      <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                        <p className="text-sm font-semibold text-gray-700 mb-2">{m.mes_label}</p>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <p className="text-xs text-gray-500">Entradas</p>
                            <p className="font-medium text-green-700">{moeda(m.total_entradas)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Saídas</p>
                            <p className="font-medium text-red-600">{moeda(m.total_saidas)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Resultado</p>
                            <p className={`font-medium ${m.resultado >= 0 ? 'text-gray-800' : 'text-red-600'}`}>{moeda(m.resultado)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resumo consolidado */}
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-3">Resumo consolidado</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-blue-500">Média mensal de entradas</p>
                    <p className="text-lg font-bold text-blue-800">{moeda(resultado.media_mensal_entradas)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-500">Média mensal de saídas</p>
                    <p className="text-lg font-bold text-blue-800">{moeda(resultado.media_mensal_saidas)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-500">Média líquida</p>
                    <p className="text-lg font-bold text-blue-800">{moeda(resultado.media_liquida)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-500">Valor sugerido</p>
                    <p className="text-lg font-bold text-blue-900">{moeda(resultado.renda_apurada)}</p>
                  </div>
                </div>
              </div>

              {/* Identificações inteligentes */}
              {resultado.identificacoes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Identificações inteligentes</p>
                  <div className="flex flex-wrap gap-2">
                    {resultado.identificacoes.map((id: IdentificacaoExtrato, i) => (
                      <div key={i} className={`rounded-lg border px-3 py-2 text-xs ${COR_IDENTIFICACAO[id.tipo] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                        <p className="font-medium">{LABEL_IDENTIFICACAO[id.tipo] ?? id.tipo}</p>
                        <p className="mt-0.5 opacity-80">{id.descricao}</p>
                        <p className="font-semibold mt-1">{moeda(id.valor)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Observações */}
              {resultado.observacoes && (
                <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-sm text-gray-600">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Observações da IA</p>
                  {resultado.observacoes}
                </div>
              )}

              {/* Lançamentos (colapsável) */}
              {resultado.lancamentos.length > 0 && (
                <div>
                  <button
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                    onClick={() => setMostrarLancamentos(v => !v)}
                  >
                    {mostrarLancamentos ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {mostrarLancamentos ? 'Ocultar' : 'Ver'} lançamentos identificados ({resultado.lancamentos.length})
                  </button>
                  {mostrarLancamentos && (
                    <div className="mt-2 rounded-lg border border-gray-100 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-3 py-2 text-gray-500 font-medium">Data</th>
                            <th className="text-left px-3 py-2 text-gray-500 font-medium">Descrição</th>
                            <th className="text-right px-3 py-2 text-gray-500 font-medium">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {resultado.lancamentos.map((l, i) => (
                            <tr key={i} className="border-t border-gray-100">
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                                {l.data ? l.data.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1') : '—'}
                              </td>
                              <td className="px-3 py-2 text-gray-700">{l.descricao}</td>
                              <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${l.tipo === 'credito' ? 'text-green-700' : 'text-red-600'}`}>
                                {l.tipo === 'debito' ? '−' : '+'}{moeda(l.valor)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Ações de status */}
              {apuracaoAtual.status === 'concluida' && (
                <div className="flex gap-2">
                  <Button
                    size="sm" variant="outline"
                    className="text-green-700 border-green-300 hover:bg-green-50"
                    disabled={salvandoStatus}
                    onClick={() => handleAtualizarStatus('revisada')}
                  >
                    {salvandoStatus ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    ✓ Validar análise
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="text-red-600 border-red-300 hover:bg-red-50"
                    disabled={salvandoStatus}
                    onClick={() => handleAtualizarStatus('descartada')}
                  >
                    ✗ Descartar
                  </Button>
                </div>
              )}

              {/* Footer */}
              <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setEstado('qualificando')}>Reanalisar</Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleFechar}>Fechar</Button>
                  {leadId && (
                    <Button onClick={() => setConfirmarRendaAberto(true)}>
                      Usar Valor na Renda
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Sub-modal: Confirmar aplicação na renda ────────────────── */}
      <Dialog open={confirmarRendaAberto} onOpenChange={setConfirmarRendaAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Resultado da Análise</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm text-gray-500">Valor sugerido:</p>
              <p className="text-2xl font-bold text-gray-800">{moeda(apuracaoAtual?.renda_apurada)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Aplicar em:</p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="campo_renda"
                    checked={campoRenda === 'renda_formal'}
                    onChange={() => setCampoRenda('renda_formal')}
                    className="h-4 w-4 accent-gray-800"
                  />
                  <span className="text-sm text-gray-700">Renda Formal</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="campo_renda"
                    checked={campoRenda === 'renda_informal'}
                    onChange={() => setCampoRenda('renda_informal')}
                    className="h-4 w-4 accent-gray-800"
                  />
                  <span className="text-sm text-gray-700">Renda Informal</span>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarRendaAberto(false)} disabled={salvandoRenda}>Cancelar</Button>
            <Button onClick={handleAplicarRenda} disabled={salvandoRenda}>
              {salvandoRenda ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
