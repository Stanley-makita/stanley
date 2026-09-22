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

// Extraída do mutationFn pra dar pra testar sem montar o hook (useMutation exige um
// componente React de verdade, sem @testing-library/react ou react-test-renderer no
// projeto hoje).
export async function iniciarConversaImpl(
  input: IniciarConversaInput,
  usuarioId: string,
  empresaId: string,
): Promise<string> {
  const telRaw = input.telefone.replace(/\D/g, '')
  // Normaliza para formato internacional: o Uazapi devolve webhooks com prefixo 55,
  // então contato_telefone deve usar o mesmo formato para o lookup encontrar a conversa.
  const tel = telRaw.length <= 11 && !telRaw.startsWith('55') ? `55${telRaw}` : telRaw

  // Get-or-create atômico via RPC (INSERT ... ON CONFLICT) — evita a corrida de um
  // SELECT-then-INSERT que criava conversas duplicadas para o mesmo telefone.
  //
  // p_atendente_id = quem está criando: a RLS de SELECT em `conversas`
  // (empresa_conversas_select, migration 20260801_230) só libera ver a conversa pra
  // admin/gerente/gestor, o atendente dela, o atendente da instância, um participante
  // explícito, ou uma conversa sem atendente E sem instância. Sem isso, quem cria a
  // conversa (perfil comercial/operacional/etc, instância com outro atendente
  // designado) fica banido de ver a própria conversa que acabou de criar — ela
  // aparece pro WhatsApp e pra admin, mas some da lista de quem clicou em "+ Nova".
  // No ON CONFLICT (telefone já tinha conversa), a RPC não sobrescreve
  // atendente_id de uma conversa existente — só define na criação.
  const { data: conversaId, error } = await supabase.rpc('obter_ou_criar_conversa', {
    p_empresa_id: empresaId,
    p_canal: 'whatsapp',
    p_telefone: tel,
    p_nome: input.nome,
    p_lead_id: input.lead_id ?? null,
    p_pessoa_id: input.pessoa_id ?? null,
    p_instancia_id: input.instancia_id ?? null,
    p_atendente_id: usuarioId,
    p_bot_ativo: false,
  })

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
        conversa_id: conversaId,
        telefone:    tel,
        tipo:        'text',
        texto:       input.mensagemInicial.trim(),
      }),
    })
  }

  return conversaId as string
}

export function useIniciarConversa() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (input: IniciarConversaInput) =>
      iniciarConversaImpl(input, usuario!.id, usuario!.empresa_id),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['conversas'] })
      if (vars.lead_id) {
        qc.invalidateQueries({ queryKey: ['conversa-do-lead', vars.lead_id] })
      }
    },
  })
}
