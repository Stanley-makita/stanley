'use client'

import { useEffect, useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { InputMoeda } from '@/components/ui/input-moeda'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Search } from 'lucide-react'
import { useEditarLead } from '@/hooks/leads/useEditarLead'
import { useFases } from '@/hooks/configuracoes/useFases'
import { useMembrosAtivos } from '@/hooks/dashboard/useDashboard'
import { type Lead } from '@/types/leads'
import { Loader2 } from 'lucide-react'

// ── schema ────────────────────────────────────────────────────────────────────

const schema = z.object({
  fase_id: z.string().uuid('Selecione uma fase'),
  responsavel_id:             z.string().optional(),
  responsavel_operacional_id: z.string().optional(),
  origem: z.enum([
    'indicacao', 'site', 'whatsapp', 'instagram', 'facebook',
    'outros', 'direto', 'corretor', 'imobiliaria', 'construtora', 'parceiro_comercial',
  ]),
  produto_interesse: z.enum(['financiamento', 'consorcio', 'cgi', 'portabilidade', 'contrato']).optional(),
  produto_subtipo:   z.string().optional(),
  valor_pretendido:  z.coerce.number().min(0).optional(),
  canal:             z.string().optional(),
  campanha:          z.string().optional(),
  observacoes:       z.string().optional(),
})

type FormData = z.infer<typeof schema>

const ORIGENS: { value: string; label: string }[] = [
  { value: 'indicacao',          label: 'Indicação' },
  { value: 'whatsapp',           label: 'WhatsApp' },
  { value: 'instagram',          label: 'Instagram' },
  { value: 'facebook',           label: 'Facebook' },
  { value: 'site',               label: 'Site' },
  { value: 'direto',             label: 'Direto' },
  { value: 'corretor',           label: 'Corretor' },
  { value: 'imobiliaria',        label: 'Imobiliária' },
  { value: 'construtora',        label: 'Construtora' },
  { value: 'parceiro_comercial', label: 'Parceiro Comercial' },
  { value: 'outros',             label: 'Outros' },
]

// ── helpers ───────────────────────────────────────────────────────────────────

function normalizarProduto(v: string | null | undefined): FormData['produto_interesse'] {
  if (!v) return undefined
  const k = v.toLowerCase()
  if (k.includes('financ'))  return 'financiamento'
  if (k.includes('cgi'))     return 'cgi'
  if (k.includes('cons'))    return 'consorcio'
  if (k.includes('port'))    return 'portabilidade'
  if (k.includes('contrat')) return 'contrato'
  return undefined
}

function leadParaForm(lead: Lead): FormData {
  return {
    fase_id:                    lead.fase_id,
    responsavel_id:             lead.responsavel_id ?? undefined,
    responsavel_operacional_id: lead.responsavel_operacional_id ?? undefined,
    origem:                     lead.origem,
    produto_interesse:          normalizarProduto(lead.produto_interesse),
    produto_subtipo:            lead.produto_subtipo ?? undefined,
    valor_pretendido:           lead.valor_pretendido ?? undefined,
    canal:                      lead.canal ?? undefined,
    campanha:                   lead.campanha ?? undefined,
    observacoes:                lead.observacoes ?? undefined,
  }
}

// ── sub-componentes ───────────────────────────────────────────────────────────

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">
        {titulo}
      </h3>
      {children}
    </div>
  )
}

function Opc() {
  return <span className="text-gray-400 font-normal text-xs ml-1">(opcional)</span>
}

// ── componente principal ──────────────────────────────────────────────────────

interface Props {
  lead: Lead
}

export function AbaOportunidade({ lead }: Props) {
  const editarLead = useEditarLead()
  const { data: fases = [] } = useFases('leads')
  const { data: membros = [] } = useMembrosAtivos()
  const [avisoCpfAberto, setAvisoCpfAberto] = useState(false)

  const form = useForm<FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
    defaultValues: leadParaForm(lead),
  })

  useEffect(() => {
    form.reset(leadParaForm(lead))
  }, [lead.id])

  async function onSubmit(data: FormData) {
    await editarLead.mutateAsync({
      id:                         lead.id,
      fase_id:                    data.fase_id,
      responsavel_id:             data.responsavel_id || undefined,
      responsavel_operacional_id: data.responsavel_operacional_id || null,
      origem:                     data.origem,
      produto_interesse:          data.produto_interesse ?? null,
      produto_subtipo:            data.produto_subtipo || null,
      valor_pretendido:           data.valor_pretendido ?? null,
      canal:                      data.canal || null,
      campanha:                   data.campanha || null,
      observacoes:                data.observacoes || null,
    })
    // Lembrete pós-salvar — a consulta em si é feita marcando o item
    // obrigatório "Consulta CPF" no checklist da fase (painel direito), que
    // avança o lead automaticamente para Documentação quando concluído. Este
    // aviso só lembra o atendente, não substitui o checklist.
    setAvisoCpfAberto(true)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-8">

        {/* ── Classificação ─────────────────────────────────────────────── */}
        <Secao titulo="Classificação">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField control={form.control} name="fase_id" render={({ field }) => (
              <FormItem>
                <FormLabel>Fase / Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {fases.map(f => (
                      <SelectItem key={f.id} value={f.id}>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: f.cor ?? '#94a3b8' }} />
                          {f.nome}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="origem" render={({ field }) => (
              <FormItem>
                <FormLabel>Origem</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ORIGENS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="responsavel_id" render={({ field }) => (
              <FormItem>
                <FormLabel>Comercial <Opc /></FormLabel>
                <Select onValueChange={field.onChange} value={field.value ?? ''}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Sem responsável" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {membros.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="responsavel_operacional_id" render={({ field }) => (
              <FormItem>
                <FormLabel>Operacional <Opc /></FormLabel>
                <Select onValueChange={field.onChange} value={field.value ?? ''}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Sem responsável" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {membros.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </Secao>

        {/* ── Produto ───────────────────────────────────────────────────── */}
        <Secao titulo="Produto">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField control={form.control} name="produto_interesse" render={({ field }) => (
              <FormItem>
                <FormLabel>Produto de Interesse <Opc /></FormLabel>
                <Select onValueChange={field.onChange} value={field.value ?? ''}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="financiamento">Financiamento Imobiliário</SelectItem>
                    <SelectItem value="consorcio">Consórcio</SelectItem>
                    <SelectItem value="cgi">CGI</SelectItem>
                    <SelectItem value="portabilidade">Portabilidade</SelectItem>
                    <SelectItem value="contrato">Contrato</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="produto_subtipo" render={({ field }) => (
              <FormItem>
                <FormLabel>Subtipo <Opc /></FormLabel>
                <FormControl>
                  <Input placeholder="Ex: consorcio_imobiliario" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="valor_pretendido" render={({ field }) => (
              <FormItem>
                <FormLabel>Valor Pretendido <Opc /></FormLabel>
                <FormControl>
                  <InputMoeda
                    value={field.value != null ? String(field.value) : ''}
                    onChange={v => field.onChange(v ? Number(v) : undefined)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </Secao>

        {/* ── Captação ──────────────────────────────────────────────────── */}
        <Secao titulo="Captação">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField control={form.control} name="canal" render={({ field }) => (
              <FormItem>
                <FormLabel>Canal <Opc /></FormLabel>
                <FormControl>
                  <Input placeholder="Ex: whatsapp" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="campanha" render={({ field }) => (
              <FormItem>
                <FormLabel>Campanha <Opc /></FormLabel>
                <FormControl>
                  <Input placeholder="Ex: folder_consorcio_itau" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </Secao>

        {/* ── Parceiro (somente leitura — gerenciar em Crédito) ─────────── */}
        {lead.parceiro && (
          <Secao titulo="Parceiro">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{lead.parceiro.nome}</p>
                {lead.parceiro.imobiliaria && (
                  <p className="text-xs text-gray-500">{lead.parceiro.imobiliaria}</p>
                )}
              </div>
              <p className="text-xs text-gray-400 shrink-0">Alterar via aba Crédito</p>
            </div>
          </Secao>
        )}

        {/* ── Observações ───────────────────────────────────────────────── */}
        <FormField control={form.control} name="observacoes" render={({ field }) => (
          <FormItem>
            <FormLabel>Observações <Opc /></FormLabel>
            <FormControl>
              <Textarea
                rows={3}
                placeholder="Notas sobre a oportunidade..."
                {...field}
                value={field.value ?? ''}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="flex justify-end border-t pt-4">
          <Button
            type="submit"
            size="sm"
            className="bg-fonti-primary hover:bg-fonti-primary-hover text-white"
            disabled={editarLead.isPending}
          >
            {editarLead.isPending
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Salvando...</>
              : 'Salvar Oportunidade'
            }
          </Button>
        </div>
      </form>

      <Dialog open={avisoCpfAberto} onOpenChange={setAvisoCpfAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-fonti-primary">
              <Search className="h-5 w-5 text-amber-500" />
              Consulte o CPF do cliente
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-700">
            Não esqueça de consultar o CPF de <strong>{lead.nome}</strong>. Marque o
            item &quot;Consulta CPF&quot; no checklist da fase quando concluir.
          </p>
          <DialogFooter>
            <Button className="w-full" onClick={() => setAvisoCpfAberto(false)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Form>
  )
}
