'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)

    const form = e.currentTarget
    const email = (form.elements.namedItem('email') as HTMLInputElement).value
    const password = (form.elements.namedItem('password') as HTMLInputElement).value

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setErro('E-mail ou senha incorretos.')
      setCarregando(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#253B29] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8 space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-[#253B29] rounded-xl mx-auto flex items-center justify-center mb-3">
            <span className="text-[#C2AA6A] text-2xl font-bold">F</span>
          </div>
          <h1 className="text-xl font-bold text-[#253B29]">Fontinhas Assessoria</h1>
          <p className="text-sm text-gray-500 mt-1">Acesse sua conta</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="seu@email.com"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
            />
          </div>

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {erro}
            </p>
          )}

          <Button
            type="submit"
            disabled={carregando}
            className="w-full bg-[#253B29] hover:bg-[#253B29]/90 text-white"
          >
            {carregando ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>

        <div className="text-center">
          <a href="/esqueci-senha" className="text-xs text-gray-400 hover:text-[#253B29] transition-colors">
            Esqueci minha senha
          </a>
        </div>
      </div>
    </div>
  )
}
