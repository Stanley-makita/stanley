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
import { InputMoeda } from '@/components/ui/input-moeda'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCriarLead } from '@/hooks/leads/useCriarLead'
import { useFases } from '@/hooks/configuracoes/useFases'
import { useMembrosAtivos } from '@/hooks/dashboard/useDashboard'
import { useAuth } from '@/hooks/auth/useAuth'

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

interface PessoaExistente {
  id: string
  nome: string
  telefone: string | null
  cpf: string | null
}

interface Props {
  aberto: boolean
  onFechar: () => void
  faseIdInicial?: string
  // Reaproveitamento de uma Pessoa já cadastrada, sem atendimento ativo com
  // outro comercial (ver diálogo de resumo da Busca Global, Topbar.tsx) —
  // pré-preenche o formulário e evita duplicar o cadastro de Pessoa.
  pessoaExistente?: PessoaExistente
}

export function LeadModal({ aberto, onFechar, faseIdInicial, pessoaExistente }: Props) {
  const { usuario } = useAuth()
  const ehComercial = usuario?.perfil === 'comercial'
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
        nome: pessoaExistente?.nome ?? '',
        telefone: pessoaExistente?.telefone ?? '',
        email: '',
        fase_id: faseIdInicial ?? (fases[0]?.id ?? ''),
        origem: 'indicacao',
        // Comercial cria sempre na própria carteira — o servidor força isso
        // de qualquer forma, mas já deixamos refletido no formulário.
        responsavel_id: ehComercial ? usuario?.id : undefined,
      })
    }
  }, [aberto, faseIdInicial, fases, ehComercial, usuario?.id, pessoaExistente])

  async function onSubmit(data: FormData) {
    try {
      await criarLead.mutateAsync({
        ...data,
        email: data.email || undefined,
        responsavel_operacional_id: data.responsavel_operacional_id || undefined,
        cpf: pessoaExistente?.cpf ?? undefined,
        pessoa_id: pessoaExistente?.id,
      })
      onFechar()
    } catch {
      // erro exibido pelo onError do hook
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onFechar}>
      <DialogContent className="max-h-[92svh] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto p-0 sm:w-full">
        <DialogHeader className="px-4 pt-5 pb-0 sm:px-6 sm:pt-6">
          <DialogTitle className="text-fonti-primary text-lg">Novo Lead</DialogTitle>
          <p className="text-sm text-gray-500 mt-0.5">
            {pessoaExistente
              ? `Retomando cadastro existente de ${pessoaExistente.nome}`
              : 'Preencha os dados do novo lead'}
          </p>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 px-4 pb-5 pt-4 sm:px-6 sm:pb-6">

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
            <div className="grid gap-4 sm:grid-cols-2">
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
            <div className="grid gap-4 sm:grid-cols-2">
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ehComercial ? (
                <FormItem>
                  <FormLabel>Comercial</FormLabel>
                  <Input value={usuario?.nome ?? ''} disabled />
                </FormItem>
              ) : (
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
              )}

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
                    <InputMoeda
                      value={field.value != null ? String(field.value) : ''}
                      onChange={(v) => field.onChange(v ? Number(v) : undefined)}
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
            <div className="flex flex-col-reverse gap-2 border-t pt-2 sm:flex-row sm:justify-end sm:gap-3">
              <Button type="button" variant="outline" onClick={onFechar} disabled={criarLead.isPending} className="w-full sm:w-auto">
                Cancelar
              </Button>
              <Button
                type="submit"
                className="w-full min-w-[120px] bg-fonti-primary text-white hover:bg-fonti-primary-hover sm:w-auto"
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
