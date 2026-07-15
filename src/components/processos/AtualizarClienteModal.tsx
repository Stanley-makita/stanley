'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { type Processo } from '@/types/processos'
import { useComunicacaoTemplates } from '@/hooks/comunicacao/useComunicacaoTemplates'
import { substituirVariaveis } from '@/lib/comunicacao/substituirVariaveis'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Loader2, Send, User, Phone, UserCog, Milestone } from 'lucide-react'

interface Props {
  processo: Processo
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AtualizarClienteModal({ processo, open, onOpenChange }: Props) {
  const queryClient = useQueryClient()
  const { data: templates = [] } = useComunicacaoTemplates()

  const compradores = processo.compradores ?? []
  const compradorPadrao = compradores.find((c) => c.principal) ?? compradores[0]

  const [compradorId, setCompradorId] = useState(compradorPadrao?.id ?? '')
  const [templateCodigo, setTemplateCodigo] = useState('')
  const [texto, setTexto] = useState('')

  const comprador = compradores.find((c) => c.id === compradorId) ?? compradorPadrao

  // Reseta a seleção pro comprador principal e limpa o texto sempre que o modal é reaberto,
  // pra não arrastar o rascunho de um envio anterior por engano.
  useEffect(() => {
    if (open) {
      setCompradorId(compradorPadrao?.id ?? '')
      setTemplateCodigo('')
      setTexto('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function aplicarTemplate(codigo: string) {
    setTemplateCodigo(codigo)
    const template = templates.find((t) => t.codigo === codigo)
    if (!template || !comprador) return
    setTexto(substituirVariaveis(template.corpo, {
      comprador_nome:       comprador.nome,
      banco:                processo.banco?.nome,
      valor_financiamento:  processo.valor_financiado ?? null,
      fase_atual:           processo.fase_atual?.nome,
      responsavel_nome:     processo.comercial?.nome,
    }))
  }

  const enviar = useMutation({
    mutationFn: async () => {
      if (!comprador?.telefone?.trim()) {
        throw new Error('Este comprador não tem telefone cadastrado.')
      }
      const { data: { session } } = await supabase.auth.getSession()
      const envio_id = crypto.randomUUID()

      const res = await fetch(`/api/processos/${processo.id}/atualizar-cliente`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ comprador_id: comprador.id, texto: texto.trim(), envio_id }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Falha ao enviar mensagem.')
      return body
    },
    onSuccess: () => {
      toast.success('Mensagem enviada ao cliente.')
      queryClient.invalidateQueries({ queryKey: ['processos', processo.id, 'comentarios'] })
      queryClient.invalidateQueries({ queryKey: ['processos', processo.id, 'timeline'] })
      onOpenChange(false)
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Falha ao enviar mensagem.')
    },
  })

  const podeEnviar = !!comprador?.telefone?.trim() && !!texto.trim() && !enviar.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-fonti-primary">Atualizar Cliente</DialogTitle>
        </DialogHeader>

        {/* Cabeçalho de contexto — sempre visível antes da edição da mensagem */}
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600">
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="truncate">{comprador?.nome ?? '—'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="truncate">{comprador?.telefone ?? 'Sem telefone cadastrado'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <UserCog className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="truncate">{processo.comercial?.nome ?? 'Sem responsável'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Milestone className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="truncate">{processo.fase_atual?.nome ?? '—'}</span>
          </div>
        </div>

        {compradores.length > 1 && (
          <div>
            <Label className="text-xs text-gray-500">Comprador</Label>
            <Select value={compradorId} onValueChange={setCompradorId}>
              <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {compradores.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}{c.principal ? ' (principal)' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Label className="text-xs text-gray-500">Modelo</Label>
          <Select value={templateCodigo} onValueChange={aplicarTemplate}>
            <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Selecionar modelo..." /></SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.codigo} value={t.codigo}>{t.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-gray-500">Mensagem</Label>
          <Textarea
            rows={6}
            className="mt-1 text-sm"
            placeholder="Escolha um modelo acima ou escreva livremente..."
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={enviar.isPending}>
            Cancelar
          </Button>
          <Button
            size="sm"
            className="gap-1.5 bg-fonti-primary text-white hover:bg-fonti-primary-hover"
            onClick={() => enviar.mutate()}
            disabled={!podeEnviar}
          >
            {enviar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Enviar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
