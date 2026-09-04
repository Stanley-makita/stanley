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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator,
} from '@/components/ui/select'
import { useCriarConvite } from '@/hooks/auth/useConvites'
import { usePerfisCustomizados } from '@/app/(protected)/configuracoes/_hooks/usePerfisCustomizados'
import { type UsuarioPerfil } from '@/types/auth'
import { UserPlus } from 'lucide-react'

const schema = z.object({
  email: z.string().email('E-mail inválido'),
  perfil: z.string().min(1, 'Selecione um perfil'),
})

type FormData = z.infer<typeof schema>

export function ConviteFormDrawer() {
  const [aberto, setAberto] = useState(false)
  const criarConvite = useCriarConvite()
  const { data: perfisCustomizados = [] } = usePerfisCustomizados()
  const perfisCustomizadosAtivos = perfisCustomizados.filter((p) => p.ativo)

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', perfil: undefined },
  })

  async function onSubmit(data: FormData) {
    const perfilCustomizadoEscolhido = perfisCustomizados.find((p) => p.id === data.perfil)
    await criarConvite.mutateAsync({
      email: data.email,
      perfil: perfilCustomizadoEscolhido ? 'customizado' : (data.perfil as UsuarioPerfil),
      perfil_customizado_id: perfilCustomizadoEscolhido ? perfilCustomizadoEscolhido.id : null,
    })
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
          <SheetTitle className="text-fonti-primary">Convidar novo membro</SheetTitle>
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
                      <SelectGroup>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="gestor">Gestor</SelectItem>
                        <SelectItem value="comercial">Comercial</SelectItem>
                        <SelectItem value="operacional">Operacional</SelectItem>
                        <SelectItem value="juridico">Jurídico</SelectItem>
                        <SelectItem value="apoio">Apoio</SelectItem>
                      </SelectGroup>
                      {perfisCustomizadosAtivos.length > 0 && (
                        <>
                          <SelectSeparator />
                          <SelectGroup>
                            <SelectLabel>Perfis customizados</SelectLabel>
                            {perfisCustomizadosAtivos.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                            ))}
                          </SelectGroup>
                        </>
                      )}
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