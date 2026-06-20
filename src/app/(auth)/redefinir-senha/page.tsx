'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function RedefinirSenhaPage() {
  const router = useRouter()
  const supabase = createClient()

  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [sessaoOk, setSessaoOk] = useState(false)

  useEffect(() => {
    // Supabase detecta o hash e dispara PASSWORD_RECOVERY automaticamente
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessaoOk(true)
      }
    })

    // Fallback: se já há sessão ativa (usuário voltou para a página)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessaoOk(true)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  async function handleRedefinir(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (senha.length < 6) {
      setErro('A senha deve ter no mínimo 6 caracteres.')
      return
    }
    if (senha !== confirmar) {
      setErro('As senhas não coincidem.')
      return
    }

    setCarregando(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: senha })
      if (error) {
        setErro('Não foi possível redefinir a senha. O link pode ter expirado.')
        return
      }
      setSucesso(true)
      setTimeout(() => router.push('/dashboard'), 2000)
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
          <h1 className="text-xl font-bold text-fonti-primary">Nova senha</h1>
          <p className="text-sm text-gray-500 mt-1">Defina sua nova senha de acesso</p>
        </div>

        {sucesso ? (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-3 text-center">
            Senha redefinida com sucesso! Redirecionando...
          </p>
        ) : !sessaoOk ? (
          <div className="space-y-3">
            <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-3 text-center">
              Verificando link de recuperação...
            </p>
            <p className="text-xs text-gray-400 text-center">
              Se esta mensagem persistir, o link expirou.{' '}
              <a href="/esqueci-senha" className="underline">Solicite um novo.</a>
            </p>
          </div>
        ) : (
          <form onSubmit={handleRedefinir} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="senha">Nova senha</Label>
              <Input
                id="senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="mínimo 6 caracteres"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmar">Confirmar senha</Label>
              <Input
                id="confirmar"
                type="password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                placeholder="repita a senha"
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
              className="w-full bg-fonti-primary hover:bg-fonti-primary/90 text-white"
            >
              {carregando ? 'Salvando...' : 'Salvar nova senha'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
