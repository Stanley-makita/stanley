'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { usePermissao } from '@/lib/auth/guards'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ShieldCheck, MessageSquare, Clock, Users, Smartphone, ArrowRightLeft, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ConversaGestao {
  id: string
  canal: string
  contato_telefone: string | null
  contato_nome: string | null
  status: string
  bot_ativo: boolean
  updated_at: string
  instancia_id: string | null
  atendente_id: string | null
  instancia: { nome: string; numero_telefone: string | null } | null
  atendente: { nome: string } | null
  lead: { fase: { nome: string; cor: string } | null } | null
}

interface Atendente {
  id: string
  nome: string
}

interface Instancia {
  id: string
  nome: string
  atendente_id: string | null
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  ativo:       { label: 'Ativo',          className: 'bg-blue-100 text-blue-700' },
  qualificado: { label: 'Qualificado',    className: 'bg-green-100 text-green-700' },
  encerrado:   { label: 'Encerrado',      className: 'bg-gray-100 text-gray-500' },
  humano:      { label: 'Em atendimento', className: 'bg-amber-100 text-amber-700' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? STATUS_MAP.ativo
  return (
    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', s.className)}>
      {s.label}
    </span>
  )
}

export default function GestaoPage() {
  const { usuario } = useAuth()
  const { pode } = usePermissao()
  const router = useRouter()
  const qc = useQueryClient()

  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroAtendente, setFiltroAtendente] = useState('todos')
  const [filtroInstancia, setFiltroInstancia] = useState('todos')
  const [transferindoConversa, setTransferindoConversa] = useState<ConversaGestao | null>(null)
  const [novoAtendente, setNovoAtendente] = useState('')

  // Redireciona se não tem permissão
  if (usuario && !pode('conversas.ver_todas')) {
    router.replace('/dashboard')
    return null
  }

  const { data: conversas = [], isLoading } = useQuery({
    queryKey: ['gestao-conversas', usuario?.empresa_id, filtroStatus, filtroAtendente, filtroInstancia],
    enabled: !!usuario?.empresa_id,
    refetchInterval: 10000,
    queryFn: async (): Promise<ConversaGestao[]> => {
      let q = supabase
        .from('conversas')
        .select(`
          id, canal, contato_telefone, contato_nome, status, bot_ativo,
          updated_at, instancia_id, atendente_id,
          instancia:instancias(nome, numero_telefone),
          atendente:usuarios!atendente_id(nome),
          lead:leads!lead_id(fase:fases!fase_id(nome, cor))
        `)
        .eq('empresa_id', usuario!.empresa_id)
        .order('updated_at', { ascending: false })
        .limit(200)

      if (filtroStatus !== 'todos')    q = q.eq('status', filtroStatus)
      if (filtroAtendente !== 'todos') q = q.eq('atendente_id', filtroAtendente)
      if (filtroInstancia !== 'todos') q = q.eq('instancia_id', filtroInstancia)

      const { data, error } = await q
      if (error) throw error
      return data as unknown as ConversaGestao[]
    },
  })

  const { data: atendentes = [] } = useQuery({
    queryKey: ['atendentes-gestao', usuario?.empresa_id],
    enabled: !!usuario?.empresa_id,
    queryFn: async (): Promise<Atendente[]> => {
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
  })

  const { data: instancias = [] } = useQuery({
    queryKey: ['instancias-gestao', usuario?.empresa_id],
    enabled: !!usuario?.empresa_id,
    queryFn: async (): Promise<Instancia[]> => {
      const { data, error } = await supabase
        .from('instancias')
        .select('id, nome, atendente_id')
        .eq('ativo', true)
        .order('nome')
      if (error) throw error
      return data
    },
  })

  const transferir = useMutation({
    mutationFn: async ({ conversa_id, atendente_id }: { conversa_id: string; atendente_id: string }) => {
      const instanciaDoAtendente = instancias.find((i) => i.atendente_id === atendente_id)
      const { error } = await supabase
        .from('conversas')
        .update({
          atendente_id,
          instancia_id: instanciaDoAtendente?.id ?? null,
        })
        .eq('id', conversa_id)
      if (error) throw error

      const nomeAtendente = atendentes.find((a) => a.id === atendente_id)?.nome ?? 'outro atendente'
      await supabase.from('notas_internas').insert({
        conversa_id,
        autor_id: usuario!.id,
        conteudo: `Conversa transferida para ${nomeAtendente} pelo gestor.`,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gestao-conversas'] })
      setTransferindoConversa(null)
      setNovoAtendente('')
      toast.success('Conversa transferida com sucesso.')
    },
    onError: () => toast.error('Erro ao transferir conversa.'),
  })

  // Resumo por status
  const totais = {
    ativo:       conversas.filter((c) => c.status === 'ativo').length,
    humano:      conversas.filter((c) => c.status === 'humano').length,
    qualificado: conversas.filter((c) => c.status === 'qualificado').length,
    encerrado:   conversas.filter((c) => c.status === 'encerrado').length,
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-fonti-accent" />
        <h1 className="text-xl font-semibold text-fonti-primary">Gestão de Conversas</h1>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Ativas (bot)', value: totais.ativo,       icon: MessageSquare, color: 'text-blue-600',  bg: 'bg-blue-50' },
          { label: 'Em atendimento', value: totais.humano,    icon: Users,         color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Qualificadas',   value: totais.qualificado, icon: ShieldCheck,  color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Encerradas',     value: totais.encerrado, icon: Clock,         color: 'text-gray-500',  bg: 'bg-gray-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', bg)}>
              <Icon className={cn('w-4 h-4', color)} />
            </div>
            <div>
              <p className="text-2xl font-bold text-fonti-primary">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-44 h-8 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="humano">Em atendimento</SelectItem>
            <SelectItem value="qualificado">Qualificado</SelectItem>
            <SelectItem value="encerrado">Encerrado</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filtroAtendente} onValueChange={setFiltroAtendente}>
          <SelectTrigger className="w-48 h-8 text-sm">
            <SelectValue placeholder="Atendente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os atendentes</SelectItem>
            {atendentes.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {instancias.length > 0 && (
          <Select value={filtroInstancia} onValueChange={setFiltroInstancia}>
            <SelectTrigger className="w-48 h-8 text-sm">
              <SelectValue placeholder="Instância" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as instâncias</SelectItem>
              {instancias.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {(filtroStatus !== 'todos' || filtroAtendente !== 'todos' || filtroInstancia !== 'todos') && (
          <Button variant="ghost" size="sm" className="h-8 text-xs text-gray-500 gap-1"
            onClick={() => { setFiltroStatus('todos'); setFiltroAtendente('todos'); setFiltroInstancia('todos') }}>
            <X className="w-3 h-3" /> Limpar filtros
          </Button>
        )}

        <span className="ml-auto text-xs text-gray-400">{conversas.length} conversa(s)</span>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Contato</TableHead>
              <TableHead>Instância</TableHead>
              <TableHead>Atendente</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Fase</TableHead>
              <TableHead>Última atividade</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-400 py-10">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : conversas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-400 py-10">
                  Nenhuma conversa encontrada.
                </TableCell>
              </TableRow>
            ) : (
              conversas.map((c) => (
                <TableRow key={c.id} className="hover:bg-gray-50/50">
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium text-fonti-primary">
                        {c.contato_nome ?? c.contato_telefone ?? 'Desconhecido'}
                      </p>
                      {c.contato_nome && c.contato_telefone && (
                        <p className="text-xs text-gray-400 font-mono">{c.contato_telefone}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {c.instancia ? (
                      <div className="flex items-center gap-1.5">
                        <Smartphone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="text-sm text-gray-700">{c.instancia.nome}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.atendente ? (
                      <Badge variant="secondary" className="text-xs">{c.atendente.nome}</Badge>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Sem atendente</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
                  </TableCell>
                  <TableCell>
                    {c.lead?.fase ? (
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ background: c.lead.fase.cor + '22', color: c.lead.fase.cor }}
                      >
                        {c.lead.fase.nome}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 italic">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true, locale: ptBR })}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 text-xs gap-1 text-gray-600 hover:text-fonti-primary"
                        onClick={() => router.push(`/conversas?id=${c.id}`)}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Ver
                      </Button>
                      {c.status !== 'encerrado' && (
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 text-xs gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          onClick={() => { setTransferindoConversa(c); setNovoAtendente(c.atendente_id ?? '') }}
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          Transferir
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal transferência */}
      <Dialog open={!!transferindoConversa} onOpenChange={(o) => { if (!o) { setTransferindoConversa(null); setNovoAtendente('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Transferir conversa</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-gray-600">
              Contato: <span className="font-medium text-fonti-primary">
                {transferindoConversa?.contato_nome ?? transferindoConversa?.contato_telefone}
              </span>
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Transferir para</label>
              <Select value={novoAtendente} onValueChange={setNovoAtendente}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o atendente" />
                </SelectTrigger>
                <SelectContent>
                  {atendentes
                    .filter((a) => a.id !== transferindoConversa?.atendente_id)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferindoConversa(null)}>Cancelar</Button>
            <Button
              className="bg-fonti-primary hover:bg-fonti-primary-hover text-white"
              disabled={!novoAtendente || transferir.isPending}
              onClick={() => transferir.mutate({ conversa_id: transferindoConversa!.id, atendente_id: novoAtendente })}
            >
              {transferir.isPending ? 'Transferindo...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
