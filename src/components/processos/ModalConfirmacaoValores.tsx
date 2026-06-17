'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Mail, Send, Loader2, X, Code, Eye, Plus, ArrowLeft, CheckCircle2, Clock } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useQueryClient } from '@tanstack/react-query'
import { useEmailConfirmacoes } from '@/hooks/processos/useEmailConfirmacao'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Props {
  processoId: string
  aberto: boolean
  onFechar: () => void
}

interface Previa {
  para_email: string
  assunto: string
  corpo: string
  template: string
  dados: Record<string, unknown> | null
}

type Tela = 'lista' | 'nova'
type Etapa = 'carregando' | 'previa' | 'enviando'

function resumirDispositivo(ua: string | null): string {
  if (!ua) return '—'
  const browser = ua.includes('Edg') ? 'Edge'
    : ua.includes('Chrome') ? 'Chrome'
    : ua.includes('Firefox') ? 'Firefox'
    : ua.includes('Safari') ? 'Safari'
    : 'Navegador'
  const os = ua.includes('Windows') ? 'Windows'
    : ua.includes('iPhone') ? 'iPhone'
    : ua.includes('Android') ? 'Android'
    : ua.includes('Mac') ? 'Mac'
    : ua.includes('Linux') ? 'Linux'
    : 'Desconhecido'
  return `${browser} / ${os}`
}

function fmtDataHora(dt: string | null): string {
  if (!dt) return '—'
  return format(new Date(dt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

function mascararIp(ip: string | null): string {
  if (!ip) return '—'
  const partes = ip.split('.')
  if (partes.length === 4) return `${partes[0]}.${partes[1]}.xxx.xxx`
  return ip
}

export function ModalConfirmacaoValores({ processoId, aberto, onFechar }: Props) {
  const queryClient = useQueryClient()
  const { data: confirmacoes = [], isLoading: loadingLista } = useEmailConfirmacoes(processoId)

  const [tela, setTela] = useState<Tela>('lista')
  const [etapa, setEtapa] = useState<Etapa>('carregando')
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [paraEmail, setParaEmail] = useState('')
  const [assunto, setAssunto] = useState('')
  const [corpo, setCorpo] = useState('')
  const [modoEdicao, setModoEdicao] = useState(false)
  const [verEmailCorpo, setVerEmailCorpo] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    if (!loadingLista && confirmacoes.length === 0) {
      setTela('nova')
      carregarPrevia()
    } else if (!loadingLista) {
      setTela('lista')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, loadingLista])

  async function carregarPrevia() {
    setEtapa('carregando')
    setModoEdicao(false)
    try {
      const res = await fetch(`/api/processos/${processoId}/emails/confirmacao-valores/preview`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao gerar prévia')
      setPrevia(json)
      setParaEmail(json.para_email ?? '')
      setAssunto(json.assunto ?? '')
      setCorpo(json.corpo ?? '')
      setEtapa('previa')
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao carregar prévia.')
      if (confirmacoes.length > 0) setTela('lista')
      else fechar()
    }
  }

  async function enviarEmail() {
    if (!previa) return
    if (!paraEmail.trim()) { toast.error('Informe o e-mail do destinatário.'); return }
    setEtapa('enviando')
    try {
      const res = await fetch(`/api/processos/${processoId}/emails/confirmacao-valores/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          para_email: paraEmail.trim(),
          assunto: assunto.trim(),
          corpo,
          template: previa.template,
          dados: previa.dados ?? null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao enviar e-mail')
      toast.success(json.mensagem ?? 'E-mail enviado com sucesso!', {
        className: 'border-l-4 border-l-[#C2AA6A] bg-[#E7E0C4] text-[#253B29]',
        duration: 5000,
      })
      queryClient.invalidateQueries({ queryKey: ['email_confirmacoes', processoId] })
      queryClient.invalidateQueries({ queryKey: ['email_confirmacao', processoId] })
      setTela('lista')
      setEtapa('carregando')
    } catch (e: any) {
      toast.error(e.message ?? 'Falha ao enviar e-mail.')
      setEtapa('previa')
    }
  }

  function fechar() {
    setPrevia(null)
    setParaEmail('')
    setAssunto('')
    setCorpo('')
    setEtapa('carregando')
    setModoEdicao(false)
    setTela('lista')
    setVerEmailCorpo(null)
    onFechar()
  }

  return (
    <>
      {/* Dialog principal */}
      <Dialog open={aberto} onOpenChange={(open) => { if (!open) fechar() }}>
        <DialogContent className="max-w-5xl w-full max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2 text-[#253B29]">
              <Mail className="h-4 w-4 text-[#C2AA6A]" />
              {tela === 'lista' ? 'Histórico de Confirmações de Valores' : 'Nova Confirmação de Valores'}
            </DialogTitle>
          </DialogHeader>

          {/* Corpo com scroll */}
          <div className="flex-1 overflow-y-auto min-h-0">

            {/* TELA LISTA */}
            {tela === 'lista' && (
              <div className="space-y-3 pb-2">
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5 h-8"
                    onClick={() => { setTela('nova'); carregarPrevia() }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Nova confirmação
                  </Button>
                </div>

                {loadingLista ? (
                  <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Carregando...</span>
                  </div>
                ) : (
                  <div className="rounded-lg border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-2 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Data envio</th>
                          <th className="text-left px-2 py-2.5 text-xs font-medium text-gray-500">Destinatário</th>
                          <th className="text-left px-2 py-2.5 text-xs font-medium text-gray-500">Status</th>
                          <th className="text-left px-2 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Confirmado em</th>
                          <th className="text-left px-2 py-2.5 text-xs font-medium text-gray-500">Protocolo</th>
                          <th className="text-left px-2 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">IP / Dispositivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {confirmacoes.map((c) => (
                          <tr
                            key={c.id}
                            className="border-b border-gray-50 last:border-0 hover:bg-[#E7E0C4]/30 cursor-pointer transition-colors"
                            title={c.corpo ? 'Clique para ver o e-mail enviado' : undefined}
                            onClick={() => c.corpo && setVerEmailCorpo(c.corpo)}
                          >
                            <td className="px-2 py-3 text-xs text-gray-600 whitespace-nowrap">{fmtDataHora(c.sent_at)}</td>
                            <td className="px-2 py-3 text-xs text-gray-700 max-w-[180px] truncate" title={c.para_email}>{c.para_email}</td>
                            <td className="px-2 py-3">
                              {c.confirmado_em ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                                  <CheckCircle2 className="h-3 w-3" /> Confirmado
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                                  <Clock className="h-3 w-3" /> Aguardando
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-3 text-xs text-gray-600 whitespace-nowrap">{fmtDataHora(c.confirmado_em)}</td>
                            <td className="px-2 py-3 text-xs font-mono text-gray-500 max-w-[120px] truncate" title={c.numero_protocolo ?? ''}>{c.numero_protocolo ?? '—'}</td>
                            <td className="px-2 py-3 text-xs text-gray-500 whitespace-nowrap">
                              {c.confirmado_em
                                ? <span title={c.confirmacao_ip ?? ''}>{mascararIp(c.confirmacao_ip)} · {resumirDispositivo(c.confirmacao_user_agent)}</span>
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TELA NOVA */}
            {tela === 'nova' && (
              <div className="space-y-3 pb-2">
                {etapa === 'carregando' && (
                  <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">Gerando prévia...</span>
                  </div>
                )}

                {(etapa === 'previa' || etapa === 'enviando') && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">Destinatário</Label>
                      <Input type="email" value={paraEmail} onChange={e => setParaEmail(e.target.value)}
                        placeholder="email@cliente.com" className="text-sm" disabled={etapa === 'enviando'} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">Assunto</Label>
                      <Input value={assunto} onChange={e => setAssunto(e.target.value)}
                        className="text-sm" disabled={etapa === 'enviando'} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-gray-500">Corpo do e-mail</Label>
                        <button type="button" onClick={() => setModoEdicao(v => !v)}
                          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
                          {modoEdicao ? <><Eye className="h-3 w-3" /> Ver prévia</> : <><Code className="h-3 w-3" /> Editar HTML</>}
                        </button>
                      </div>
                      {modoEdicao ? (
                        <textarea value={corpo} onChange={e => setCorpo(e.target.value)} rows={16}
                          disabled={etapa === 'enviando'}
                          className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#253B29]/30 resize-y disabled:opacity-60" />
                      ) : (
                        <div className="rounded-md border border-gray-200 overflow-hidden" style={{ height: 300 }}>
                          <iframe srcDoc={corpo} title="Prévia do e-mail" className="w-full h-full" sandbox="allow-same-origin" />
                        </div>
                      )}
                    </div>
                    {!paraEmail.trim() && (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                        Nenhum e-mail encontrado para o comprador principal. Preencha o destinatário manualmente.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 gap-2 pt-2 border-t border-gray-100">
            {tela === 'lista' ? (
              <Button variant="outline" size="sm" onClick={fechar}>
                <X className="h-3.5 w-3.5 mr-1" /> Fechar
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm"
                  onClick={() => confirmacoes.length > 0 ? setTela('lista') : fechar()}
                  disabled={etapa === 'enviando'}>
                  {confirmacoes.length > 0
                    ? <><ArrowLeft className="h-3.5 w-3.5 mr-1" /> Voltar</>
                    : <><X className="h-3.5 w-3.5 mr-1" /> Cancelar</>}
                </Button>
                {etapa !== 'carregando' && (
                  <Button size="sm" className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5"
                    onClick={enviarEmail}
                    disabled={etapa === 'enviando' || !assunto.trim() || !corpo.trim()}>
                    {etapa === 'enviando'
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando...</>
                      : <><Send className="h-3.5 w-3.5" /> Enviar e-mail</>}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog separado para visualizar o e-mail enviado */}
      <Dialog open={!!verEmailCorpo} onOpenChange={(o) => { if (!o) setVerEmailCorpo(null) }}>
        <DialogContent className="max-w-2xl w-full max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-[#253B29] text-sm">
              <Mail className="h-4 w-4 text-[#C2AA6A]" /> E-mail enviado ao cliente
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {verEmailCorpo && (
              <iframe srcDoc={verEmailCorpo} title="E-mail enviado" className="w-full h-full" style={{ minHeight: 500 }} sandbox="allow-same-origin" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
