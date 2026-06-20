'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

const schema = z.object({
  nome: z.string().min(2, 'Informe seu nome completo'),
  senha: z.string().min(8, 'Senha deve ter ao menos 8 caracteres'),
  confirmar: z.string(),
}).refine((d) => d.senha === d.confirmar, {
  message: 'As senhas não conferem',
  path: ['confirmar'],
})

type FormData = z.infer<typeof schema>

export default function AceitarConvitePage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [tokenValido, setTokenValido] = useState<boolean | null>(null)
  const [carregando, setCarregando] = useState(false)

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { nome: '', senha: '', confirmar: '' },
  })

  useEffect(() => {
    // Busca convite pelo token (sem RLS — função pública de validação)
    async function validarToken() {
      const res = await fetch(`/api/convites/validar?token=${token}`)
      const json = await res.json()

      if (json.valido) {
        setEmail(json.email)
        setTokenValido(true)
      } else {
        setTokenValido(false)
      }
    }

    validarToken()
  }, [token])

  async function onSubmit(data: FormData) {
    setCarregando(true)

    const res = await fetch('/api/convites/aceitar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, nome: data.nome, senha: data.senha }),
    })

    if (!res.ok) {
      toast.error('Erro ao aceitar convite. O link pode ter expirado.')
      setCarregando(false)
      return
    }

    toast.success('Conta criada! Bem-vindo ao Credifon.', {
      className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary',
    })
    router.push('/login')
  }

  if (tokenValido === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Validando convite...</p>
      </div>
    )
  }

  if (!tokenValido) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-card">
        <div className="text-center space-y-4">
          <p className="text-fonti-primary font-semibold text-lg">Convite inválido ou expirado</p>
          <p className="text-sm text-gray-500">
            Este link de convite não é mais válido. Solicite um novo convite ao administrador.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-card">
      <div className="w-full max-w-md space-y-8 px-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-fonti-primary mb-4">
            <span className="text-fonti-accent text-2xl font-bold">F</span>
          </div>
          <h1 className="text-2xl font-bold text-fonti-primary">Criar sua conta</h1>
          <p className="text-sm text-gray-500 mt-1">{email}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Seu nome completo</FormLabel>
                    <FormControl>
                      <Input placeholder="João da Silva" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="senha"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Criar senha</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Mínimo 8 caracteres" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmar"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirmar senha</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Repita a senha" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full bg-fonti-primary hover:bg-fonti-primary-hover text-white"
                disabled={carregando}
              >
                {carregando ? 'Criando conta...' : 'Criar minha conta'}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  )
}