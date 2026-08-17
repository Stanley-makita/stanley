'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { CompromissoLocal } from '@/types/agenda'

export interface NovoCompromissoInput {
  usuario_id: string
  titulo: string
  descricao?: string
  local: CompromissoLocal
  data: string
  hora_inicio?: string
  hora_fim?: string
}

/**
 * Cria o compromisso via API route (não client-direto) porque o disparo de
 * WhatsApp precisa rodar no servidor (token da instância/Uazapi não pode
 * ficar exposto no client) — ver src/app/api/agenda/compromissos/route.ts.
 */
export function useCriarCompromisso() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: NovoCompromissoInput) => {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      if (!token) throw new Error('Sessão expirada — recarregue a página.')

      const res = await fetch('/api/agenda/compromissos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao criar compromisso')
      return json as { ok: true; id: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agenda-tarefas'] })
      toast.success('Compromisso criado — o dono foi avisado por WhatsApp.', {
        className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary',
      })
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao criar compromisso.')
    },
  })
}
