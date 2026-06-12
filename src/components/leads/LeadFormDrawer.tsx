'use client'

import { useEffect, useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { useCriarLead } from '@/hooks/leads/useCriarLead'
import { useFases } from '@/hooks/configuracoes/useFases'
import { useMembrosAtivos } from '@/hooks/dashboard/useDashboard'
import { type Lead } from '@/types/leads'
import { createClient } from '@/lib/supabase/client'

const schema = z.object({
  nome: z.string().min(2, 'Informe o nome completo'),
  telefone: z.string().min(10, 'Telefone inválido'),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  cpf: z.string().optional(),
  fase_id: z.string().uuid('Selecione uma fase'),
  responsavel_id: z.string().uuid().optional(),
  origem: z.enum(['indicacao', 'site', 'whatsapp', 'instagram', 'facebook', 'outros', 'direto', 'corretor', 'imobiliaria', 'construtora', 'parceiro_comercial']),
  valor_pretendido: z.coerce.number().positive().optional(),
  observacoes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  aberto: boolean
  onFechar: () => void
  faseIdInicial?: string
  onCriado?: (lead: Lead) => void
  initialValues?: {
    nome?: string
    telefone?: string
    email?: string
    cpf?: string
    origem?: Lead['origem']
  }
}

export function LeadFormDrawer({ aberto, onFechar, faseIdInicial, onCriado, initialValues }: Props) {
  const criarLead = useCriarLead()
  const { data: fases = [] } = useFases('leads')
  const { data: membros = [] } = useMembrosAtivos()

  const [pessoaEncontrada, setPessoaEncontrada] = useState<{ id: string; nome: string } | null>(null)
  const [dialogCpfAberto, setDialogCpfAberto] = useState(false)
  // Flag local para travar o botão imediatamente no primeiro clique,
  // antes do React re-renderizar com criarLead.isPending=true
  const [enviando, setEnviando] = useState(false)

  const form = useForm<FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
    defaultValues: {
      nome: '',
      telefone: '',
      email: '',
      cpf: '',
      fase_id: faseIdInicial ?? '',
      origem: 'indicacao',
    },
  })

  useEffect(() => {
    if (aberto) {
      form.reset({
        nome:      initialValues?.nome      ?? '',
        telefone:  initialValues?.telefone  ?? '',
        email:     initialValues?.email     ?? '',
        cpf:       initialValues?.cpf       ?? '',
        fase_id:   faseIdInicial            ?? '',
        origem:    initialValues?.origem    ?? 'indicacao',
      })
      setPessoaEncontrada(null)
    }
  }, [aberto]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCpfBlur(cpf: string) {
    const cpfNorm = cpf.replace(/\D/g, '')
    if (cpfNorm.length !== 11) return

    const supabase = createClient()
    const { data } = await supabase
      .from('pessoas')
      .select('id, nome')
      .eq('cpf', cpfNorm)
      .maybeSingle()

    if (data) {
      setPessoaEncontrada({ id: data.id, nome: data.nome })
      setDialogCpfAberto(true)
    }
  }

  function handleVincularSim() {
    // Mantém o CPF — servidor fará o vínculo automaticamente via buscarOuCriarPessoa
    setDialogCpfAberto(false)
  }

  function handleVincularNao() {
    form.setValue('cpf', '')
    setPessoaEncontrada(null)
    setDialogCpfAberto(false)
  }

  async function onSubmit(data: FormData) {
    if (enviando) return
    setEnviando(true)
    try {
      const lead = await criarLead.mutateAsync({
        ...data,
        email: data.email || undefined,
        cpf:   data.cpf   || undefined,
      })
      form.reset()
      setPessoaEncontrada(null)
      onFechar()
      onCriado?.(lead)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <Sheet open={aberto} onOpenChange={onFechar}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-[#253B29]">Novo lead</SheetTitle>
          </SheetHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
              <FormField control={form.control} name="nome" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome completo</FormLabel>
                  <FormControl><Input placeholder="João da Silva" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="telefone" render={({ field }) => (
                <FormItem>
                  <FormLabel>WhatsApp</FormLabel>
                  <FormControl><Input placeholder="(44) 99999-9999" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail <span className="text-gray-400 font-normal">(opcional)</span></FormLabel>
                  <FormControl><Input type="email" placeholder="joao@email.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="cpf" render={({ field }) => (
                <FormItem>
                  <FormLabel>CPF <span className="text-gray-400 font-normal">(opcional)</span></FormLabel>
                  <FormControl>
                    <Input
                      placeholder="000.000.000-00"
                      {...field}
                      onBlur={(e) => {
                        field.onBlur()
                        handleCpfBlur(e.target.value)
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="fase_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fase</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {fases.map((f) => (
                          <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="origem" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Origem</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="indicacao">Indicação</SelectItem>
                        <SelectItem value="site">Site</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="facebook">Facebook</SelectItem>
                        <SelectItem value="outros">Outros</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="responsavel_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Responsável <span className="text-gray-400 font-normal">(opcional)</span></FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Sem responsável" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {membros.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="valor_pretendido" render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor pretendido <span className="text-gray-400 font-normal">(R$, opcional)</span></FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="350000"
                      {...field}
                      onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="observacoes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações <span className="text-gray-400 font-normal">(opcional)</span></FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Informações adicionais..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={onFechar}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={enviando || criarLead.isPending}
                >
                  {enviando || criarLead.isPending ? 'Salvando...' : 'Criar lead'}
                </Button>
              </div>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      <Dialog open={dialogCpfAberto} onOpenChange={setDialogCpfAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pessoa já cadastrada</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Já existe uma pessoa com este CPF:{' '}
            <span className="font-semibold text-gray-900">{pessoaEncontrada?.nome}</span>.
            Deseja vincular o lead a ela?
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleVincularNao}>
              Não (criar sem CPF)
            </Button>
            <Button onClick={handleVincularSim}>
              Sim, vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
