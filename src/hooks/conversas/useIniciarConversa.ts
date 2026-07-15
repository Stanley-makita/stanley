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

// Números brasileiros de celular podem chegar com ou sem o "9" extra depois
// do DDD (55 44 9 8455-8945 vs 55 44 8455-8945), dependendo de onde vieram
// (WhatsApp, digitação manual, sistemas antigos). Sem considerar as duas
// formas, o dedup por telefone falha e cria uma conversa duplicada vazia
// mesmo já existindo histórico salvo sob a outra grafia.
function variantesTelefoneBR(telefone: string): string[] {
  const digits = telefone.replace(/\D/g, '')
  const semDDI = digits.startsWith('55') ? digits.slice(2) : digits
  const ddd = semDDI.slice(0, 2)
  const resto = semDDI.slice(2)
  const variantes = new Set<string>([`55${ddd}${resto}`])
  if (resto.length === 9 && resto.startsWith('9')) {
    variantes.add(`55${ddd}${resto.slice(1)}`)
  } else if (resto.length === 8) {
    variantes.add(`55${ddd}9${resto}`)
  }
  return Array.from(variantes)
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

      // Reaproveita conversa já existente (mesmo telefone, com ou sem o "9"
      // extra) em vez de criar uma duplicada vazia perdendo o histórico.
      const { data: existente } = await supabase
        .from('conversas')
        .select('id, lead_id, pessoa_id, instancia_id')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('canal', 'whatsapp')
        .in('contato_telefone', variantesTelefoneBR(tel))
        .maybeSingle()

      let conversaId: string
      if (existente) {
        conversaId = existente.id
        const patch: Record<string, unknown> = {}
        if (!existente.lead_id && input.lead_id) patch.lead_id = input.lead_id
        if (!existente.pessoa_id && input.pessoa_id) patch.pessoa_id = input.pessoa_id
        if (!existente.instancia_id && input.instancia_id) patch.instancia_id = input.instancia_id
        if (Object.keys(patch).length > 0) {
          await supabase.from('conversas').update(patch).eq('id', conversaId)
        }
      } else {
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
        conversaId = conversa.id
      }

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
            conversa_id: conversaId,
            telefone:    tel,
            tipo:        'text',
            texto:       input.mensagemInicial.trim(),
          }),
        })
      }

      return conversaId
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['conversas'] })
      if (vars.lead_id) {
        qc.invalidateQueries({ queryKey: ['conversa-do-lead', vars.lead_id] })
      }
    },
  })
}
