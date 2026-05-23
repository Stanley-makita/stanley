'use client'

import { useEffect } from 'react'
import { useForm, type Resolver, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useEditarLead } from '@/hooks/leads/useEditarLead'
import { useFases } from '@/hooks/configuracoes/useFases'
import { useMembrosAtivos } from '@/hooks/dashboard/useDashboard'
import { type Lead } from '@/types/leads'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const schema = z.object({
  // Dados pessoais
  nome:            z.string().min(2, 'Informe o nome'),
  telefone:        z.string().min(10, 'Telefone inválido'),
  email:           z.string().email('E-mail inválido').optional().or(z.literal('')),
  cpf:             z.string().optional(),
  rg:              z.string().optional(),
  data_nascimento: z.string().optional(),
  profissao:       z.string().optional(),
  // Estado civil
  estado_civil: z.enum(['solteiro', 'casado', 'uniao_estavel', 'divorciado', 'viuvo']).optional(),
  regime_casamento:         z.string().optional(),
  conjuge_nome:             z.string().optional(),
  conjuge_cpf:              z.string().optional(),
  conjuge_data_nascimento:  z.string().optional(),
  // Financeiro
  renda_formal:      z.coerce.number().min(0).optional(),
  renda_informal:    z.coerce.number().min(0).optional(),
  valor_pretendido:  z.coerce.number().min(0).optional(),
  produto_interesse: z.enum(['financiamento', 'consorcio', 'cgi', 'portabilidade', 'contrato']).optional(),
  // CRM
  fase_id:        z.string().uuid(),
  responsavel_id: z.string().uuid().optional(),
  origem:         z.enum(['indicacao', 'site', 'whatsapp', 'instagram', 'facebook', 'outros']),
  observacoes:    z.string().optional(),
})

type FormData = z.infer<typeof schema>

const ESTADO_CIVIL_LABELS: Record<string, string> = {
  solteiro:      'Solteiro(a)',
  casado:        'Casado(a)',
  uniao_estavel: 'União Estável',
  divorciado:    'Divorciado(a)',
  viuvo:         'Viúvo(a)',
}

const REGIME_LABELS: Record<string, string> = {
  comunhao_parcial: 'Comunhão Parcial de Bens',
  comunhao_total:   'Comunhão Total de Bens',
  separacao:        'Separação de Bens',
  participacao:     'Participação Final nos Aquestos',
}

interface Props {
  aberto: boolean
  onFechar: () => void
  lead: Lead
}

export function LeadEditarModal({ aberto, onFechar, lead }: Props) {
  const editarLead = useEditarLead()
  const { data: fases = [] } = useFases('leads')
  const { data: membros = [] } = useMembrosAtivos()

  const form = useForm<FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
    defaultValues: leadToForm(lead),
  })

  const estadoCivil = useWatch({ control: form.control, name: 'estado_civil' })
  const temConjuge = estadoCivil === 'casado' || estadoCivil === 'uniao_estavel'

  useEffect(() => {
    if (aberto) form.reset(leadToForm(lead))
  }, [aberto, lead])

  async function onSubmit(data: FormData) {
    try {
      await editarLead.mutateAsync({
        id: lead.id,
        // Campos base — sempre presentes
        nome:            data.nome,
        telefone:        data.telefone,
        email:           data.email || undefined,
        cpf:             data.cpf || undefined,
        fase_id:         data.fase_id,
        responsavel_id:  data.responsavel_id,
        origem:          data.origem,
        valor_pretendido: data.valor_pretendido ?? null,
        observacoes:     data.observacoes || null,
        // Campos novos: só enviados quando têm valor (undefined = ignorado pelo Supabase)
        // Isso garante compatibilidade enquanto a migration add_lead_fields.sql não for aplicada
        ...(data.rg             ? { rg: data.rg }                         : {}),
        ...(data.data_nascimento? { data_nascimento: data.data_nascimento }: {}),
        ...(data.profissao      ? { profissao: data.profissao }            : {}),
        ...(data.estado_civil   ? { estado_civil: data.estado_civil }      : {}),
        ...(data.renda_formal   ? { renda_formal: data.renda_formal }      : {}),
        ...(data.renda_informal ? { renda_informal: data.renda_informal }  : {}),
        ...(data.produto_interesse ? { produto_interesse: data.produto_interesse } : {}),
        ...(temConjuge && data.conjuge_nome            ? { conjuge_nome: data.conjuge_nome }                       : {}),
        ...(temConjuge && data.conjuge_cpf             ? { conjuge_cpf: data.conjuge_cpf }                         : {}),
        ...(temConjuge && data.conjuge_data_nascimento ? { conjuge_data_nascimento: data.conjuge_data_nascimento } : {}),
        ...(temConjuge && data.regime_casamento        ? { regime_casamento: data.regime_casamento }               : {}),
      })
      onFechar()
    } catch {
      // erro tratado pelo onError do hook
    }
  }

  function onInvalid(errors: Record<string, unknown>) {
    const campos = Object.keys(errors).join(', ')
    toast.error(`Campos inválidos: ${campos}`)
  }

  return (
    <Dialog open={aberto} onOpenChange={onFechar}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <DialogTitle className="text-[#253B29]">Editar Lead</DialogTitle>
          <p className="text-sm text-gray-400 mt-0.5">{lead.nome}</p>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="px-6 pb-6 pt-5 space-y-6">

            {/* ── DADOS PESSOAIS ── */}
            <Secao titulo="Dados Pessoais">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="nome" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Nome Completo</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="cpf" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF</FormLabel>
                    <FormControl><Input placeholder="000.000.000-00" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="rg" render={({ field }) => (
                  <FormItem>
                    <FormLabel>RG <Opcional /></FormLabel>
                    <FormControl><Input placeholder="00.000.000-0" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email <Opcional /></FormLabel>
                    <FormControl><Input type="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="telefone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone / WhatsApp</FormLabel>
                    <FormControl><Input placeholder="(44) 99999-9999" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="data_nascimento" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Nascimento <Opcional /></FormLabel>
                    <FormControl><Input type="date" {...field} value={field.value ?? ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="profissao" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Profissão <Opcional /></FormLabel>
                    <FormControl><Input placeholder="Ex: Gerente Comercial" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </Secao>

            {/* ── ESTADO CIVIL ── */}
            <Secao titulo="Estado Civil">
              <FormField control={form.control} name="estado_civil" render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(ESTADO_CIVIL_LABELS).map(([val, label]) => (
                        <label
                          key={val}
                          className={cn(
                            'flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border text-sm transition-all',
                            field.value === val
                              ? 'border-[#253B29] bg-[#253B29] text-white font-medium'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          )}
                        >
                          <input
                            type="radio"
                            className="sr-only"
                            value={val}
                            checked={field.value === val}
                            onChange={() => field.onChange(val)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {temConjuge && (
                <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Cônjuge / Companheiro(a)</p>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="conjuge_nome" render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Nome</FormLabel>
                        <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="conjuge_cpf" render={({ field }) => (
                      <FormItem>
                        <FormLabel>CPF</FormLabel>
                        <FormControl><Input placeholder="000.000.000-00" {...field} value={field.value ?? ''} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="conjuge_data_nascimento" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data de Nascimento</FormLabel>
                        <FormControl><Input type="date" {...field} value={field.value ?? ''} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="regime_casamento" render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Regime de Bens</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? ''}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(REGIME_LABELS).map(([val, label]) => (
                              <SelectItem key={val} value={val}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </div>
              )}
            </Secao>

            {/* ── DADOS FINANCEIROS ── */}
            <Secao titulo="Dados Financeiros">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="renda_formal" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Renda Formal <Opcional /></FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="0"
                        {...field}
                        value={field.value ?? ''}
                        onChange={e => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="renda_informal" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Renda Informal <Opcional /></FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="0"
                        {...field}
                        value={field.value ?? ''}
                        onChange={e => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="valor_pretendido" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor Pretendido <Opcional /></FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="0"
                        {...field}
                        value={field.value ?? ''}
                        onChange={e => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="produto_interesse" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Produto de Interesse <Opcional /></FormLabel>
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
              </div>
            </Secao>

            {/* ── CLASSIFICAÇÃO ── */}
            <Secao titulo="Classificação">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="fase_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status / Fase</FormLabel>
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
                        <SelectItem value="indicacao">Indicação</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="facebook">Facebook</SelectItem>
                        <SelectItem value="site">Site</SelectItem>
                        <SelectItem value="outros">Outros</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="responsavel_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responsável <Opcional /></FormLabel>
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

            {/* ── OBSERVAÇÕES ── */}
            <FormField control={form.control} name="observacoes" render={({ field }) => (
              <FormItem>
                <FormLabel>Observações <Opcional /></FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="Notas sobre o lead..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <Button type="button" variant="outline" onClick={onFechar} disabled={editarLead.isPending}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-[#253B29] hover:bg-[#1a2b1e] text-white min-w-[140px]"
                disabled={editarLead.isPending}
              >
                {editarLead.isPending ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

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

function Opcional() {
  return <span className="text-gray-400 font-normal text-xs ml-1">(opcional)</span>
}

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

function leadToForm(lead: Lead): FormData {
  return {
    nome:            lead.nome,
    telefone:        lead.telefone,
    email:           lead.email ?? '',
    cpf:             lead.cpf ?? '',
    rg:              lead.rg ?? '',
    data_nascimento: lead.data_nascimento ?? '',
    profissao:       lead.profissao ?? '',
    estado_civil:    lead.estado_civil ?? undefined,
    regime_casamento:        lead.regime_casamento ?? '',
    conjuge_nome:            lead.conjuge_nome ?? '',
    conjuge_cpf:             lead.conjuge_cpf ?? '',
    conjuge_data_nascimento: lead.conjuge_data_nascimento ?? '',
    renda_formal:     lead.renda_formal ?? undefined,
    renda_informal:   lead.renda_informal ?? undefined,
    valor_pretendido: lead.valor_pretendido ?? undefined,
    produto_interesse: normalizarProduto(lead.produto_interesse),
    fase_id:        lead.fase_id,
    responsavel_id: lead.responsavel_id ?? undefined,
    origem:         lead.origem,
    observacoes:    lead.observacoes ?? '',
  }
}
