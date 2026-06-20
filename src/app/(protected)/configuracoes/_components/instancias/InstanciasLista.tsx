'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePermissao } from '@/lib/auth/guards'
import { useAuth } from '@/hooks/auth/useAuth'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Plus, Pencil, Smartphone, Copy, Check } from 'lucide-react'
import type { Usuario } from '@/types/auth'

interface Instancia {
  id: string
  nome: string
  token: string
  numero_telefone: string | null
  atendente_id: string | null
  ativo: boolean
  created_at: string
  atendente?: { nome: string } | null
}

const EMPTY_FORM = { nome: '', token: '', numero_telefone: '', atendente_id: '' }

function useWebhookUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl && appUrl.startsWith('http') && !appUrl.includes('localhost')) {
    return `${appUrl}/api/bot/whatsapp/webhook`
  }
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}/api/bot/whatsapp/webhook`
}

function useInstancias() {
  return useQuery({
    queryKey: ['instancias'],
    queryFn: async (): Promise<Instancia[]> => {
      const { data, error } = await supabase
        .from('instancias')
        .select('*, atendente:usuarios!atendente_id(nome)')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 2,
  })
}

function useAtendentes() {
  return useQuery({
    queryKey: ['usuarios', 'atendentes'],
    queryFn: async (): Promise<Pick<Usuario, 'id' | 'nome'>[]> => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome')
        .is('deleted_at', null)
        .eq('ativo', true)
        .not('perfil', 'eq', 'cliente')
        .order('nome')
      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 5,
  })
}

export function InstanciasLista() {
  const { pode } = usePermissao()
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const { data: instancias, isLoading } = useInstancias()
  const { data: atendentes } = useAtendentes()

  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Instancia | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [copiado, setCopiado] = useState(false)
  const webhookUrl = useWebhookUrl()

  function copiarWebhook() {
    navigator.clipboard.writeText(webhookUrl)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const podeGerenciar = pode('instancias.gerenciar')

  const salvar = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: form.nome.trim(),
        token: form.token.trim(),
        numero_telefone: form.numero_telefone.trim() || null,
        atendente_id: form.atendente_id && form.atendente_id !== 'none' ? form.atendente_id : null,
        empresa_id: usuario!.empresa_id,
      }
      if (editando) {
        const { error } = await supabase.from('instancias').update(payload).eq('id', editando.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('instancias').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instancias'] })
      toast.success(editando ? 'Instância atualizada.' : 'Instância cadastrada.')
      setModalAberto(false)
      setEditando(null)
      setForm(EMPTY_FORM)
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  })

  const alternarAtivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from('instancias').update({ ativo }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instancias'] }),
  })

  function abrirNova() {
    setEditando(null)
    setForm(EMPTY_FORM)
    setModalAberto(true)
  }

  function abrirEditar(inst: Instancia) {
    setEditando(inst)
    setForm({
      nome: inst.nome,
      token: inst.token,
      numero_telefone: inst.numero_telefone ?? '',
      atendente_id: inst.atendente_id ?? 'none',
    })
    setModalAberto(true)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          Cada instância corresponde a um número WhatsApp. Vincule ao atendente responsável.
        </p>
        {podeGerenciar && (
          <Button
            size="sm"
            className="bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-1.5"
            onClick={abrirNova}
          >
            <Plus className="w-3.5 h-3.5" /> Nova instância
          </Button>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Nome</TableHead>
              <TableHead>Número</TableHead>
              <TableHead>Atendente</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>Ativo</TableHead>
              {podeGerenciar && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-400 py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : instancias?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-400 py-8">
                  Nenhuma instância cadastrada.
                </TableCell>
              </TableRow>
            ) : (
              instancias?.map((inst) => (
                <TableRow key={inst.id}>
                  <TableCell className="font-medium text-fonti-primary flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-gray-400 shrink-0" />
                    {inst.nome}
                  </TableCell>
                  <TableCell className="text-gray-600 font-mono text-sm">
                    {inst.numero_telefone ?? <span className="text-gray-400 italic">não informado</span>}
                  </TableCell>
                  <TableCell>
                    {inst.atendente?.nome
                      ? <Badge variant="secondary">{inst.atendente.nome}</Badge>
                      : <span className="text-gray-400 text-sm">—</span>
                    }
                  </TableCell>
                  <TableCell className="font-mono text-xs text-gray-500">
                    {inst.token.slice(0, 8)}••••{inst.token.slice(-4)}
                  </TableCell>
                  <TableCell>
                    {podeGerenciar ? (
                      <Switch
                        checked={inst.ativo}
                        onCheckedChange={(v) => alternarAtivo.mutate({ id: inst.id, ativo: v })}
                      />
                    ) : (
                      <Badge variant={inst.ativo ? 'default' : 'secondary'}>
                        {inst.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    )}
                  </TableCell>
                  {podeGerenciar && (
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => abrirEditar(inst)}>
                        <Pencil className="w-4 h-4 text-gray-500" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar instância' : 'Nova instância'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                placeholder="ex: WhatsApp Marcio"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Token da instância (Uazapi)</Label>
              <Input
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={form.token}
                onChange={(e) => setForm({ ...form, token: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Número de telefone (opcional)</Label>
              <Input
                placeholder="5544999990000"
                value={form.numero_telefone}
                onChange={(e) => setForm({ ...form, numero_telefone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>URL do Webhook (configure no Uazapi)</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={webhookUrl}
                  className="font-mono text-xs text-gray-600 bg-gray-50 cursor-default"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={copiarWebhook}
                  title="Copiar URL"
                >
                  {copiado ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-gray-400">
                Cole esta URL no campo Webhook do dashboard Uazapi, com os eventos: messages, messages_update, contacts, sender.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Atendente responsável</Label>
              <Select
                value={form.atendente_id}
                onValueChange={(v) => setForm({ ...form, atendente_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um atendente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem atendente fixo</SelectItem>
                  {atendentes?.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button
              className="bg-fonti-primary hover:bg-fonti-primary-hover text-white"
              disabled={!form.nome.trim() || !form.token.trim() || salvar.isPending}
              onClick={() => salvar.mutate()}
            >
              {salvar.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
