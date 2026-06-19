'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'

interface IniciarConversaInput {
  telefone: string
  nome: string
  lead_id?: string
  pessoa_id?: string
  instancia_id?: string
  mensagemInicial?: string
}

export function useIniciarConversa() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: IniciarConversaInput): Promise<string> => {
      const telRaw = input.telefone.replace(/\D/g, '')
      // Normaliza para formato internacional: o Uazapi devolve webhooks com prefixo 55,
      // então contato_telefone deve usar o mesmo formato para o lookup encontrar a conversa.
      const tel = telRaw.length <= 11 && !telRaw.startsWith('55') ? `55${telRaw}` : telRaw

      // Cria a conversa
      const { data: conversa, error } = await supabase
        .from('conversas')
        .insert({
          empresa_id:        usuario!.empresa_id,
          canal:             'whatsapp',
          contato_telefone:  tel,
          contato_nome:      input.nome,
          lead_id:           input.lead_id ?? null,
          pessoa_id:         input.pessoa_id ?? null,
          instancia_id:      input.instancia_id ?? null,
          status:            'ativo',
          bot_ativo:         false,
        })
        .select('id')
        .single()

      if (error) throw error

      // Envia mensagem inicial se digitada
      if (input.mensagemInicial?.trim()) {
        const { data: { session } } = await supabase.auth.getSession()
        await fetch('/api/bot/whatsapp/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            conversa_id: conversa.id,
            telefone:    tel,
            tipo:        'text',
            texto:       input.mensagemInicial.trim(),
          }),
        })
      }

      return conversa.id
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['conversas'] })
      if (vars.lead_id) {
        qc.invalidateQueries({ queryKey: ['conversa-do-lead', vars.lead_id] })
      }
    },
  })
}
