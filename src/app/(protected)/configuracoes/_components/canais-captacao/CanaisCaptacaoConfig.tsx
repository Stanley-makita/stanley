'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Globe, Instagram, Handshake, Power } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface CanaisConfigRow {
  site_ativo: boolean
  instagram_ativo: boolean
  indicacao_ativo: boolean
}

const DEFAULTS: CanaisConfigRow = {
  site_ativo: true,
  instagram_ativo: true,
  indicacao_ativo: true,
}

const CANAIS: Array<{
  campo: keyof CanaisConfigRow
  icon: LucideIcon
  label: string
  descricaoAtivo: string
  descricaoInativo: string
}> = [
  {
    campo: 'site_ativo',
    icon: Globe,
    label: 'Formulário do Site',
    descricaoAtivo: 'Contatos do formulário do site institucional viram Lead automaticamente.',
    descricaoInativo: 'Contatos do formulário do site são ignorados — não criam Lead.',
  },
  {
    campo: 'instagram_ativo',
    icon: Instagram,
    label: 'Instagram (DM)',
    descricaoAtivo: 'Mensagens diretas do Instagram viram Lead e Conversa automaticamente.',
    descricaoInativo: 'Mensagens diretas do Instagram são ignoradas — não criam Lead nem Conversa.',
  },
  {
    campo: 'indicacao_ativo',
    icon: Handshake,
    label: 'Indicação (QR Code)',
    descricaoAtivo: 'Indicações via QR Code de parceiros viram Lead automaticamente.',
    descricaoInativo: 'Indicações via QR Code de parceiros são ignoradas — não criam Lead.',
  },
]

export function CanaisCaptacaoConfig() {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const empresa_id = usuario?.empresa_id

  const { data: configDB, isLoading } = useQuery({
    queryKey: ['canais_leads_config', empresa_id],
    enabled: !!empresa_id,
    queryFn: async (): Promise<CanaisConfigRow | null> => {
      const { data } = await supabase
        .from('canais_leads_config')
        .select('*')
        .eq('empresa_id', empresa_id!)
        .maybeSingle()
      return data ?? null
    },
    staleTime: 1000 * 60 * 2,
  })

  const [form, setForm] = useState<CanaisConfigRow>(DEFAULTS)

  useEffect(() => {
    if (configDB) {
      setForm({
        site_ativo:      configDB.site_ativo      ?? DEFAULTS.site_ativo,
        instagram_ativo: configDB.instagram_ativo ?? DEFAULTS.instagram_ativo,
        indicacao_ativo: configDB.indicacao_ativo ?? DEFAULTS.indicacao_ativo,
      })
    }
  }, [configDB])

  // Efeito imediato — cada canal é um interruptor de emergência independente,
  // não fica atrás de um botão "Salvar".
  const alternarCanal = useMutation({
    mutationFn: async ({ campo, valor }: { campo: keyof CanaisConfigRow; valor: boolean }) => {
      if (!empresa_id) throw new Error('Empresa não identificada')
      const { error } = await supabase
        .from('canais_leads_config')
        .upsert({ empresa_id, [campo]: valor }, { onConflict: 'empresa_id' })
      if (error) throw error
      return { campo, valor }
    },
    onSuccess: ({ campo, valor }) => {
      setForm((f) => ({ ...f, [campo]: valor }))
      qc.invalidateQueries({ queryKey: ['canais_leads_config', empresa_id] })
      const canal = CANAIS.find((c) => c.campo === campo)
      toast.success(`${canal?.label}: ${valor ? 'ativado' : 'desativado'}.`)
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  })

  if (isLoading) {
    return <p className="text-sm text-gray-400 py-8 text-center">Carregando configurações...</p>
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-gray-500">
        Desative um canal se ele estiver recebendo spam ou contatos indesejados.
        Contatos recebidos enquanto o canal está desativado são descartados —
        não aparecem na tela de Leads e não podem ser recuperados depois.
      </p>

      {CANAIS.map(({ campo, icon: Icon, label, descricaoAtivo, descricaoInativo }) => {
        const ativo = form[campo]
        return (
          <section
            key={campo}
            className={`flex items-center justify-between gap-4 rounded-lg border p-4 ${
              ativo ? 'border-gray-200 bg-white' : 'border-red-200 bg-red-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <Icon className={`w-5 h-5 ${ativo ? 'text-fonti-accent' : 'text-red-500'}`} />
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {label} {ativo ? '— ativo' : '— desativado'}
                </p>
                <p className="text-xs text-gray-500">{ativo ? descricaoAtivo : descricaoInativo}</p>
              </div>
            </div>
            <Button
              type="button"
              variant={ativo ? 'outline' : 'default'}
              className={ativo ? 'text-red-600 border-red-200 hover:bg-red-50' : 'bg-fonti-primary hover:bg-fonti-primary-hover text-white'}
              disabled={alternarCanal.isPending}
              onClick={() => alternarCanal.mutate({ campo, valor: !ativo })}
            >
              <Power className="w-4 h-4 mr-1.5" />
              {ativo ? 'Desativar' : 'Ativar'}
            </Button>
          </section>
        )
      })}
    </div>
  )
}
