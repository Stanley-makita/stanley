'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Bot, Save } from 'lucide-react'

interface BotConfigRow {
  id?: string
  nome_agente: string
  mensagem_sazonal: string
  horario_inicio: number
  horario_fim: number
  dias_atendimento: number[]
  mensagem_fora_horario: string
  produtos_ativos: string[]
}

const DIAS = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
]

const PRODUTOS = ['Financiamento Imobiliário', 'CGI', 'Consórcio', 'Contrato']

const DEFAULTS: BotConfigRow = {
  nome_agente: 'Fonti',
  mensagem_sazonal: '',
  horario_inicio: 8,
  horario_fim: 18,
  dias_atendimento: [1, 2, 3, 4, 5],
  mensagem_fora_horario: '',
  produtos_ativos: ['Financiamento Imobiliário', 'CGI', 'Consórcio', 'Contrato'],
}

export function AgenteFontiConfig() {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const empresa_id = usuario?.empresa_id

  const { data: configDB, isLoading } = useQuery({
    queryKey: ['bot_config', empresa_id],
    enabled: !!empresa_id,
    queryFn: async (): Promise<BotConfigRow | null> => {
      const { data } = await supabase
        .from('bot_config')
        .select('*')
        .eq('empresa_id', empresa_id!)
        .maybeSingle()
      return data ?? null
    },
    staleTime: 1000 * 60 * 2,
  })

  const [form, setForm] = useState<BotConfigRow>(DEFAULTS)

  useEffect(() => {
    if (configDB) {
      setForm({
        id:                    configDB.id,
        nome_agente:           configDB.nome_agente           ?? DEFAULTS.nome_agente,
        mensagem_sazonal:      configDB.mensagem_sazonal       ?? '',
        horario_inicio:        configDB.horario_inicio         ?? DEFAULTS.horario_inicio,
        horario_fim:           configDB.horario_fim            ?? DEFAULTS.horario_fim,
        dias_atendimento:      configDB.dias_atendimento       ?? DEFAULTS.dias_atendimento,
        mensagem_fora_horario: configDB.mensagem_fora_horario  ?? '',
        produtos_ativos:       configDB.produtos_ativos        ?? DEFAULTS.produtos_ativos,
      } as BotConfigRow)
    }
  }, [configDB])

  const salvar = useMutation({
    mutationFn: async () => {
      if (!empresa_id) throw new Error('Empresa não identificada')

      const payload = {
        empresa_id,
        nome_agente:           form.nome_agente.trim() || DEFAULTS.nome_agente,
        mensagem_sazonal:      form.mensagem_sazonal.trim() || null,
        horario_inicio:        form.horario_inicio,
        horario_fim:           form.horario_fim,
        dias_atendimento:      form.dias_atendimento,
        mensagem_fora_horario: form.mensagem_fora_horario.trim() || null,
        produtos_ativos:       form.produtos_ativos,
      }

      const { error } = await supabase
        .from('bot_config')
        .upsert(payload, { onConflict: 'empresa_id' })

      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bot_config', empresa_id] })
      toast.success('Configurações do agente salvas.')
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  })

  function toggleDia(dia: number) {
    const atual = form.dias_atendimento
    setForm({
      ...form,
      dias_atendimento: atual.includes(dia)
        ? atual.filter((d) => d !== dia)
        : [...atual, dia].sort(),
    })
  }

  function toggleProduto(produto: string) {
    const atual = form.produtos_ativos
    setForm({
      ...form,
      produtos_ativos: atual.includes(produto)
        ? atual.filter((p) => p !== produto)
        : [...atual, produto],
    })
  }

  if (isLoading) {
    return <p className="text-sm text-gray-400 py-8 text-center">Carregando configurações...</p>
  }

  return (
    <div className="space-y-8 max-w-2xl">

      {/* Identidade */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
          <Bot className="w-4 h-4 text-fonti-accent" />
          <h3 className="text-sm font-semibold text-gray-700">Identidade do agente</h3>
        </div>
        <div className="space-y-1.5">
          <Label>Nome do agente</Label>
          <Input
            value={form.nome_agente}
            onChange={(e) => setForm({ ...form, nome_agente: e.target.value })}
            placeholder="Fonti"
            className="max-w-xs"
          />
          <p className="text-xs text-gray-400">Esse nome aparece nas mensagens enviadas pelo bot.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Mensagem sazonal <span className="text-gray-400 font-normal">(opcional)</span></Label>
          <Textarea
            value={form.mensagem_sazonal}
            onChange={(e) => setForm({ ...form, mensagem_sazonal: e.target.value })}
            placeholder="Ex: Em janeiro estamos com condições especiais para Consórcio. Mencione para novos contatos."
            rows={3}
          />
          <p className="text-xs text-gray-400">Aparece no final do prompt — use para promoções, avisos ou contexto sazonal.</p>
        </div>
      </section>

      {/* Horário de atendimento */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 pb-2 border-b border-gray-100">Horário de atendimento humano</h3>
        <div className="flex items-end gap-4">
          <div className="space-y-1.5">
            <Label>Início (hora)</Label>
            <Input
              type="number"
              min={0}
              max={23}
              value={form.horario_inicio}
              onChange={(e) => setForm({ ...form, horario_inicio: Number(e.target.value) })}
              className="w-20 text-center"
            />
          </div>
          <span className="pb-2 text-gray-400 text-sm">até</span>
          <div className="space-y-1.5">
            <Label>Fim (hora)</Label>
            <Input
              type="number"
              min={1}
              max={24}
              value={form.horario_fim}
              onChange={(e) => setForm({ ...form, horario_fim: Number(e.target.value) })}
              className="w-20 text-center"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Dias de atendimento</Label>
          <div className="flex gap-2 flex-wrap">
            {DIAS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDia(d.value)}
                className={`px-3 py-1.5 rounded-lg border text-sm cursor-pointer select-none transition-colors ${
                  form.dias_atendimento.includes(d.value)
                    ? 'bg-fonti-primary text-white border-fonti-primary'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Mensagem fora do horário <span className="text-gray-400 font-normal">(opcional)</span></Label>
          <Textarea
            value={form.mensagem_fora_horario}
            onChange={(e) => setForm({ ...form, mensagem_fora_horario: e.target.value })}
            placeholder="Deixe em branco para usar o padrão: avisa que o time responde no próximo dia útil."
            rows={3}
          />
        </div>
      </section>

      {/* Produtos ativos */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 pb-2 border-b border-gray-100">Produtos oferecidos pelo agente</h3>
        <div className="space-y-2">
          {PRODUTOS.map((p) => (
            <label key={p} className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.produtos_ativos.includes(p)}
                onChange={() => toggleProduto(p)}
                className="w-4 h-4 rounded border-gray-300 accent-fonti-primary cursor-pointer"
              />
              <span className="text-sm text-gray-700">{p}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-400">Apenas os produtos selecionados serão apresentados nas conversas.</p>
      </section>

      {/* Salvar */}
      <div className="pt-2">
        <Button
          className="bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-2"
          disabled={salvar.isPending || form.produtos_ativos.length === 0}
          onClick={() => salvar.mutate()}
        >
          <Save className="w-4 h-4" />
          {salvar.isPending ? 'Salvando...' : 'Salvar configurações'}
        </Button>
      </div>
    </div>
  )
}
