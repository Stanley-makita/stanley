'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { type Lead } from '@/types/leads'
import { useComunicacaoTemplates } from '@/hooks/comunicacao/useComunicacaoTemplates'
import { useInteressadosLead } from '@/hooks/leads/useInteressadosLead'
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
import { Loader2, Send, User, UserCog } from 'lucide-react'

interface Props {
  lead: Lead
  open: boolean
  onOpenChange: (open: boolean) => void
}

const LABEL_TIPO_INTERESSADO: Record<'comprador' | 'corretor' | 'parceiro' | 'imobiliaria' | 'construtora', string> = {
  comprador:   'Comprador',
  corretor:    'Corretor',
  parceiro:    'Parceiro',
  imobiliaria: 'Imobiliária',
  construtora: 'Construtora',
}

export function AtualizarClienteLeadModal({ lead, open, onOpenChange }: Props) {
  const queryClient = useQueryClient()
  const { data: templates = [] } = useComunicacaoTemplates()
  const { data: interessados = [], isLoading: carregandoInteressados } = useInteressadosLead(lead.id, open)

  // Chave composta "tipo:id", já que interessado_id sozinho não é único entre papéis diferentes.
  const [destinatarioChave, setDestinatarioChave] = useState('')
  const [templateCodigo, setTemplateCodigo] = useState('')
  const [texto, setTexto] = useState('')

  const destinatarioSelecionado = useMemo(() => {
    const [tipo, id] = destinatarioChave.split(':')
    return interessados.find((i) => i.tipo_interessado === tipo && i.interessado_id === id) ?? null
  }, [destinatarioChave, interessados])

  // Reseta seleção e limpa o texto sempre que o modal é reaberto, pra não arrastar o rascunho de
  // um envio anterior por engano. Pré-seleciona o comprador (destinatário mais comum) se ele
  // estiver apto.
  useEffect(() => {
    if (open) {
      setTemplateCodigo('')
      setTexto('')
      setDestinatarioChave('')
    }
  }, [open])

  useEffect(() => {
    if (open && !destinatarioChave && interessados.length > 0) {
      const compradorApto = interessados.find((i) => i.tipo_interessado === 'comprador' && i.apto)
      if (compradorApto) setDestinatarioChave(`${compradorApto.tipo_interessado}:${compradorApto.interessado_id}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, interessados])

  function aplicarTemplate(codigo: string) {
    setTemplateCodigo(codigo)
    const template = templates.find((t) => t.codigo === codigo)
    if (!template || !destinatarioSelecionado) return
    setTexto(substituirVariaveis(template.corpo, {
      comprador_nome: destinatarioSelecionado.nome,
    }))
  }

  const enviar = useMutation({
    mutationFn: async () => {
      if (!destinatarioSelecionado?.apto) {
        throw new Error('Selecione um destinatário apto para envio.')
      }
      const { data: { session } } = await supabase.auth.getSession()
      const envio_id = crypto.randomUUID()

      const res = await fetch(`/api/leads/${lead.id}/atualizar-cliente`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          tipo_interessado: destinatarioSelecionado.tipo_interessado,
          interessado_id:   destinatarioSelecionado.interessado_id,
          texto:             texto.trim(),
          envio_id,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Falha ao enviar mensagem.')
      return body
    },
    onSuccess: () => {
      toast.success('Mensagem enviada.')
      queryClient.invalidateQueries({ queryKey: ['leads', lead.id, 'historico'] })
      onOpenChange(false)
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Falha ao enviar mensagem.')
    },
  })

  const podeEnviar = !!destinatarioSelecionado?.apto && !!texto.trim() && !enviar.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-fonti-primary">Comunicar partes</DialogTitle>
        </DialogHeader>

        <div>
          <Label className="text-xs text-gray-500">Destinatário</Label>
          <Select value={destinatarioChave} onValueChange={setDestinatarioChave} disabled={carregandoInteressados}>
            <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Selecionar destinatário..." /></SelectTrigger>
            <SelectContent>
              {interessados.map((i) => (
                <SelectItem
                  key={`${i.tipo_interessado}:${i.interessado_id}`}
                  value={`${i.tipo_interessado}:${i.interessado_id}`}
                  disabled={!i.apto}
                >
                  {LABEL_TIPO_INTERESSADO[i.tipo_interessado]} — {i.nome}
                  {!i.apto ? ` (${i.motivo_indisponibilidade})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {destinatarioSelecionado && (
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600">
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="truncate">{destinatarioSelecionado.nome}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <UserCog className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="truncate">{LABEL_TIPO_INTERESSADO[destinatarioSelecionado.tipo_interessado]}</span>
            </div>
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
            Enviar mensagem
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
