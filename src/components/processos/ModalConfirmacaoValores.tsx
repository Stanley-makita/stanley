'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Mail, Send, Loader2, X, Code, Eye } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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

type Etapa = 'carregando' | 'previa' | 'enviando'

export function ModalConfirmacaoValores({ processoId, aberto, onFechar }: Props) {
  const [etapa, setEtapa] = useState<Etapa>('carregando')
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [paraEmail, setParaEmail] = useState('')
  const [assunto, setAssunto] = useState('')
  const [corpo, setCorpo] = useState('')
  const [modoEdicao, setModoEdicao] = useState(false)

  // Dispara ao abrir (onOpenChange do Radix não dispara para open externo)
  useEffect(() => {
    if (aberto) carregarPrevia()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

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
      onFechar()
    }
  }

  async function enviarEmail() {
    if (!previa) return
    if (!paraEmail.trim()) {
      toast.error('Informe o e-mail do destinatário.')
      return
    }
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
      fechar()
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
    onFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(open) => { if (!open) fechar() }}>
      <DialogContent className="max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#253B29]">
            <Mail className="h-4 w-4 text-[#C2AA6A]" />
            Confirmação de Valores — Prévia do E-mail
          </DialogTitle>
        </DialogHeader>

        {etapa === 'carregando' && (
          <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Gerando prévia...</span>
          </div>
        )}

        {(etapa === 'previa' || etapa === 'enviando') && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Destinatário</Label>
              <Input
                type="email"
                value={paraEmail}
                onChange={e => setParaEmail(e.target.value)}
                placeholder="email@cliente.com"
                className="text-sm"
                disabled={etapa === 'enviando'}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Assunto</Label>
              <Input
                value={assunto}
                onChange={e => setAssunto(e.target.value)}
                className="text-sm"
                disabled={etapa === 'enviando'}
              />
            </div>

            {/* Área do corpo — preview visual ou editor HTML */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-gray-500">Corpo do e-mail</Label>
                <button
                  type="button"
                  onClick={() => setModoEdicao(v => !v)}
                  className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {modoEdicao
                    ? <><Eye className="h-3 w-3" /> Ver prévia</>
                    : <><Code className="h-3 w-3" /> Editar HTML</>
                  }
                </button>
              </div>

              {modoEdicao ? (
                <textarea
                  value={corpo}
                  onChange={e => setCorpo(e.target.value)}
                  rows={16}
                  disabled={etapa === 'enviando'}
                  className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#253B29]/30 resize-y disabled:opacity-60"
                />
              ) : (
                <div className="rounded-md border border-gray-200 overflow-hidden" style={{ height: 340 }}>
                  <iframe
                    srcDoc={corpo}
                    title="Prévia do e-mail"
                    className="w-full h-full"
                    sandbox="allow-same-origin"
                  />
                </div>
              )}
            </div>

            {!paraEmail.trim() && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                Nenhum e-mail encontrado para o comprador principal. Preencha o destinatário manualmente.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fechar}
            disabled={etapa === 'enviando'}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Cancelar
          </Button>
          {etapa !== 'carregando' && (
            <Button
              size="sm"
              className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5"
              onClick={enviarEmail}
              disabled={etapa === 'enviando' || !assunto.trim() || !corpo.trim()}
            >
              {etapa === 'enviando' ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando...</>
              ) : (
                <><Send className="h-3.5 w-3.5" /> Enviar e-mail</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
