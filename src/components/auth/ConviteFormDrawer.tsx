'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCriarConvite } from '@/hooks/auth/useConvites'
import { UserPlus } from 'lucide-react'

const schema = z.object({
  email: z.string().email('E-mail inválido'),
  perfil: z.enum(['admin', 'gerente', 'analista', 'consultor', 'cliente'], {
    required_error: 'Selecione um perfil',
  }),
})

type FormData = z.infer<typeof schema>

export function ConviteFormDrawer() {
  const [aberto, setAberto] = useState(false)
  const criarConvite = useCriarConvite()

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', perfil: undefined },
  })

  async function onSubmit(data: FormData) {
    await criarConvite.mutateAsync(data)
    form.reset()
    setAberto(false)
  }

  return (
    <Sheet open={aberto} onOpenChange={setAberto}>
      <SheetTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
          <UserPlus className="h-4 w-4" />
          Convidar membro
        </Button>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-[#253B29]">Convidar novo membro</SheetTitle>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input placeholder="nome@empresa.com.br" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="perfil"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Perfil de acesso</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o perfil" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="gerente">Gerente</SelectItem>
                      <SelectItem value="analista">Analista</SelectItem>
                      <SelectItem value="consultor">Consultor</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAberto(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={criarConvite.isPending}
              >
                {criarConvite.isPending ? 'Enviando...' : 'Enviar convite'}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}