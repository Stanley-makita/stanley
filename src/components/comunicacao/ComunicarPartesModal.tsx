'use client'

import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { type Interessado, type ResultadoEnvio } from '@/types/comunicacao'
import { useComunicacaoTemplates } from '@/hooks/comunicacao/useComunicacaoTemplates'
import { enviarParaInteressados, chaveInteressado } from '@/lib/comunicacao/enviarParaInteressados'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Loader2, Send, CheckCircle2, XCircle } from 'lucide-react'

export const LABEL_TIPO_INTERESSADO: Record<'comprador' | 'corretor' | 'parceiro' | 'imobiliaria' | 'construtora', string> = {
  comprador:   'Comprador',
  corretor:    'Corretor',
  parceiro:    'Parceiro',
  imobiliaria: 'Imobiliária',
  construtora: 'Construtora',
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Interessados já carregados pelo wrapper de contexto (Lead/Processo) — cada contexto usa
   * seu próprio hook de fetch (query key/endpoint diferentes), a modal em si é agnóstica. */
  interessados: Interessado[]
  carregandoInteressados: boolean
  /** Rota de envio do contexto — ex: `/api/leads/${id}/atualizar-cliente` ou
   * `/api/processos/${id}/atualizar-cliente`. */
  endpointEnvio: string
  /** Chamado após um envio (sucesso ou falha parcial) pra o wrapper invalidar as queries certas
   * do seu próprio contexto (histórico/timeline). */
  onEnviado?: () => void
}

// Núcleo genérico de UI da Central de Comunicação — checkboxes de seleção múltipla, modelo,
// mensagem, envio sequencial (via enviarParaInteressados) e tela de resultado por
// destinatário. Compartilhado entre Lead e Processo (ver AtualizarClienteLeadModal.tsx e o
// wrapper de Processo) -- mesmo padrão de "componente genérico + wrapper fino por contexto"
// já usado em src/components/documentos/AbaDocumentos.tsx.
export function ComunicarPartesModal({ open, onOpenChange, interessados, carregandoInteressados, endpointEnvio, onEnviado }: Props) {
  const { data: templates = [] } = useComunicacaoTemplates()

  const [selecionados, setSelecionados] = useState<Record<string, boolean>>({})
  const [templateCodigo, setTemplateCodigo] = useState('')
  const [texto, setTexto] = useState('')
  const [resultado, setResultado] = useState<ResultadoEnvio[] | null>(null)

  const selecionadosCount = Object.values(selecionados).filter(Boolean).length

  useEffect(() => {
    if (open) {
      setTemplateCodigo('')
      setTexto('')
      setSelecionados({})
      setResultado(null)
    }
  }, [open])

  // Pré-seleciona o Comprador (destinatário mais comum) se estiver apto, assim que a lista
  // de interessados carregar.
  useEffect(() => {
    if (open && selecionadosCount === 0 && interessados.length > 0) {
      const compradorApto = interessados.find((i) => i.tipo_interessado === 'comprador' && i.apto)
      if (compradorApto) setSelecionados({ [chaveInteressado(compradorApto)]: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, interessados])

  function alternarSelecionado(i: Interessado) {
    const chave = chaveInteressado(i)
    setSelecionados((prev) => ({ ...prev, [chave]: !prev[chave] }))
  }

  function aplicarTemplate(codigo: string) {
    setTemplateCodigo(codigo)
    const template = templates.find((t) => t.codigo === codigo)
    if (!template) return
    // Guarda o corpo BRUTO do template (com {{comprador_nome}} ainda dentro) — a substituição
    // roda individualmente por destinatário no momento do envio.
    setTexto(template.corpo)
  }

  const enviar = useMutation({
    mutationFn: async (): Promise<ResultadoEnvio[]> => {
      const alvos = interessados.filter((i) => selecionados[chaveInteressado(i)])
      if (alvos.length === 0) throw new Error('Selecione ao menos um destinatário.')

      const { data: { session } } = await supabase.auth.getSession()
      return enviarParaInteressados({
        endpoint: endpointEnvio,
        interessados: alvos,
        texto,
        accessToken: session?.access_token,
      })
    },
    onSuccess: (resultados) => {
      setResultado(resultados)
      onEnviado?.()
      const sucesso = resultados.filter((r) => r.ok).length
      if (sucesso === resultados.length) {
        toast.success(`${sucesso} de ${resultados.length} mensagem${resultados.length > 1 ? 'ns' : ''} enviada${resultados.length > 1 ? 's' : ''}.`)
      } else {
        toast.warning(`${sucesso} de ${resultados.length} enviada(s) — ${resultados.length - sucesso} falhou/falharam.`)
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Falha ao enviar mensagens.')
    },
  })

  function fechar() {
    onOpenChange(false)
  }

  const podeEnviar = selecionadosCount > 0 && !!texto.trim() && !enviar.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-fonti-primary">Comunicar partes</DialogTitle>
        </DialogHeader>

        {resultado ? (
          <>
            <div className="space-y-2">
              {resultado.map((r) => (
                <div key={r.chave} className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2.5 text-sm">
                  {r.ok
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 mt-0.5" />
                    : <XCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />}
                  <div className="min-w-0">
                    <p className="text-gray-700">{LABEL_TIPO_INTERESSADO[r.tipo]} — {r.nome}</p>
                    {!r.ok && <p className="text-xs text-red-600 mt-0.5">{r.erro}</p>}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={fechar}>Fechar</Button>
            </div>
          </>
        ) : (
          <>
            <div>
              <Label className="text-xs text-gray-500">Destinatários</Label>
              <div className="mt-1 space-y-2 rounded-lg border border-gray-100 p-3">
                {carregandoInteressados ? (
                  <p className="text-xs text-gray-400">Carregando destinatários...</p>
                ) : interessados.length === 0 ? (
                  <p className="text-xs text-gray-400">Nenhum interessado vinculado ainda.</p>
                ) : (
                  interessados.map((i) => {
                    const chave = chaveInteressado(i)
                    return (
                      <div key={chave} className="flex items-center gap-2">
                        <Checkbox
                          id={chave}
                          checked={!!selecionados[chave]}
                          disabled={!i.apto || enviar.isPending}
                          onCheckedChange={() => alternarSelecionado(i)}
                        />
                        <label htmlFor={chave} className="text-sm text-gray-700 cursor-pointer select-none">
                          {LABEL_TIPO_INTERESSADO[i.tipo_interessado]} — {i.nome}
                          {!i.apto && <span className="text-gray-400"> ({i.motivo_indisponibilidade})</span>}
                        </label>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div>
              <Label className="text-xs text-gray-500">Modelo</Label>
              <Select value={templateCodigo} onValueChange={aplicarTemplate} disabled={enviar.isPending}>
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
                disabled={enviar.isPending}
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {selecionadosCount} destinatário{selecionadosCount !== 1 ? 's' : ''} selecionado{selecionadosCount !== 1 ? 's' : ''}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fechar} disabled={enviar.isPending}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 bg-fonti-primary text-white hover:bg-fonti-primary-hover"
                  onClick={() => enviar.mutate()}
                  disabled={!podeEnviar}
                >
                  {enviar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Enviar {selecionadosCount || ''} mensagem{selecionadosCount !== 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
