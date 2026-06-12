'use client'

import { useEffect } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCriarLead } from '@/hooks/leads/useCriarLead'
import { useFases } from '@/hooks/configuracoes/useFases'
import { useMembrosAtivos } from '@/hooks/dashboard/useDashboard'

const schema = z.object({
  nome: z.string().min(2, 'Informe o nome completo'),
  telefone: z.string().min(10, 'Telefone inválido'),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  fase_id: z.string().uuid('Selecione uma fase'),
  responsavel_id: z.string().uuid().optional(),
  responsavel_operacional_id: z.string().uuid().optional(),
  origem: z.enum(['indicacao', 'site', 'whatsapp', 'instagram', 'facebook', 'outros']),
  valor_pretendido: z.coerce.number().positive().optional(),
  observacoes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  aberto: boolean
  onFechar: () => void
  faseIdInicial?: string
}

export function LeadModal({ aberto, onFechar, faseIdInicial }: Props) {
  const criarLead = useCriarLead()
  const { data: fases = [] } = useFases('leads')
  const { data: membros = [] } = useMembrosAtivos()

  const form = useForm<FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
    defaultValues: {
      nome: '',
      telefone: '',
      email: '',
      fase_id: faseIdInicial ?? '',
      origem: 'indicacao',
    },
  })

  useEffect(() => {
    if (aberto) {
      form.reset({
        nome: '',
        telefone: '',
        email: '',
        fase_id: faseIdInicial ?? (fases[0]?.id ?? ''),
        origem: 'indicacao',
      })
    }
  }, [aberto, faseIdInicial, fases])

  async function onSubmit(data: FormData) {
    try {
      await criarLead.mutateAsync({
        ...data,
        email: data.email || undefined,
        responsavel_operacional_id: data.responsavel_operacional_id || undefined,
      })
      onFechar()
    } catch {
      // erro exibido pelo onError do hook
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onFechar}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="text-[#253B29] text-lg">Novo Lead</DialogTitle>
          <p className="text-sm text-gray-500 mt-0.5">Preencha os dados do novo lead</p>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="px-6 pb-6 pt-4 space-y-4">

            {/* Nome */}
            <FormField control={form.control} name="nome" render={({ field }) => (
              <FormItem>
                <FormLabel>Nome completo *</FormLabel>
                <FormControl>
                  <Input placeholder="Ex: João da Silva" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Telefone + Email */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="telefone" render={({ field }) => (
                <FormItem>
                  <FormLabel>WhatsApp *</FormLabel>
                  <FormControl>
                    <Input placeholder="(44) 99999-9999" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail <span className="text-gray-400 font-normal text-xs">(opcional)</span></FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="joao@email.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Fase + Origem */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="fase_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Fase *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a fase" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {fases.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: f.cor ?? '#94a3b8' }}
                            />
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
                  <FormLabel>Origem *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
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
            </div>

            {/* Responsáveis + Valor */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <FormField control={form.control} name="responsavel_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Comercial <span className="text-gray-400 font-normal text-xs">(opcional)</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sem responsável" />
                      </SelectTrigger>
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

              <FormField control={form.control} name="responsavel_operacional_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Operacional <span className="text-gray-400 font-normal text-xs">(opcional)</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sem responsável" />
                      </SelectTrigger>
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
                  <FormLabel>Valor pretendido <span className="text-gray-400 font-normal text-xs">(R$, opcional)</span></FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="350000"
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Observações */}
            <FormField control={form.control} name="observacoes" render={({ field }) => (
              <FormItem>
                <FormLabel>Observações <span className="text-gray-400 font-normal text-xs">(opcional)</span></FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="Informações adicionais sobre o lead..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Botões */}
            <div className="flex justify-end gap-3 pt-2 border-t">
              <Button type="button" variant="outline" onClick={onFechar} disabled={criarLead.isPending}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-[#253B29] hover:bg-[#1a2b1e] text-white min-w-[120px]"
                disabled={criarLead.isPending}
              >
                {criarLead.isPending ? 'Salvando...' : 'Criar lead'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
