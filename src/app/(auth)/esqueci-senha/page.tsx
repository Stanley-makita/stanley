'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

export default function EsqueciSenhaPage() {
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  async function handleEnviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      })
      if (error) {
        setErro('Não foi possível enviar o e-mail. Tente novamente.')
        return
      }
      setEnviado(true)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="min-h-screen bg-fonti-primary flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8 space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-fonti-primary rounded-xl mx-auto flex items-center justify-center mb-3">
            <span className="text-fonti-accent text-2xl font-bold">F</span>
          </div>
          <h1 className="text-xl font-bold text-fonti-primary">Recuperar senha</h1>
          <p className="text-sm text-gray-500 mt-1">
            {enviado ? 'Verifique seu e-mail' : 'Informe seu e-mail para receber o link'}
          </p>
        </div>

        {enviado ? (
          <div className="space-y-4">
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-3 text-center">
              Enviamos um link de redefinição para <strong>{email}</strong>
            </p>
            <Link href="/login">
              <Button variant="outline" className="w-full">
                Voltar ao login
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleEnviar} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoFocus
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
              className="w-full bg-fonti-primary hover:bg-fonti-primary/90 text-white"
            >
              {carregando ? 'Enviando...' : 'Enviar link'}
            </Button>

            <div className="text-center">
              <Link href="/login" className="text-xs text-gray-400 hover:text-fonti-primary transition-colors">
                Voltar ao login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
