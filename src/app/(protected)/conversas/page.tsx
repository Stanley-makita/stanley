'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { LeadFormDrawer } from '@/components/leads/LeadFormDrawer'
import { type Lead } from '@/types/leads'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { MessageCircle, MessageSquare, Globe, Phone, UserCheck, Clock, X, Image as ImageIcon, FileText, Volume2, Bot, Smartphone, MessageSquareDashed, ArrowRightLeft, Send, Search, Link2, ClipboardList, UserPlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { PainelComposicao } from '@/components/conversas/PainelComposicao'
import { AbaSolicitacoes } from '@/components/solicitacoes/AbaSolicitacoes'
import { NovaSolicitacaoDrawer } from '@/components/solicitacoes/NovaSolicitacaoDrawer'
import { type ContextoSolicitacao } from '@/types/solicitacoes-operacionais'
import { AudioPlayer } from '@/components/conversas/AudioPlayer'
import { usePermissao } from '@/lib/auth/guards'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

type Canal = 'todos' | 'whatsapp' | 'site' | 'instagram' | 'outros'
type Status = 'todos' | 'ativo' | 'qualificado' | 'encerrado' | 'humano' | 'arquivadas'

interface Conversa {
  id: string
  canal: string
  contato_telefone: string | null
  contato_nome: string | null
  lead_id: string | null
  status: string
  bot_ativo: boolean
  instancia_id: string | null
  atendente_id: string | null
  contato_grupo_id: string | null
  arquivada: boolean
  updated_at: string
  created_at: string
  lead: { fase: { nome: string; cor: string } | null } | null
}

interface NotaInterna {
  id: string
  conteudo: string
  created_at: string
  autor: { nome: string }[] | null
}

interface Atendente {
  id: string
  nome: string
}

interface InstanciaSimples {
  id: string
  atendente_id: string | null
}

interface Mensagem {
  id: string
  origem: 'cliente' | 'bot' | 'humano'
  conteudo: string
  created_at: string
  metadata?: {
    tipo_midia?: string
    file_url?: string
    nome_arquivo?: string
    atendente?: string
    transcricao?: string
    sender_nome?: string
    sender_telefone?: string
  } | null
}

interface UltimaMsgInfo {
  origem: string
  created_at: string
}

type NivelUrgencia = 'amarelo' | 'laranja' | 'vermelho'

function formatarTempoEspera(mins: number): string {
  if (mins < 60) return `${mins}min`
  const horas = Math.floor(mins / 60)
  if (horas < 24) return `${horas}h`
  const dias = Math.floor(horas / 24)
  return `${dias}d`
}

function urgenciaInfo(
  ultima: UltimaMsgInfo | undefined,
  agora: number,
  statusConversa: string,
  arquivada: boolean,
): { label: string; nivel: NivelUrgencia } | null {
  if (statusConversa === 'encerrado' || arquivada) return null
  if (!ultima || ultima.origem !== 'cliente') return null
  const mins = Math.floor((agora - new Date(ultima.created_at).getTime()) / 60_000)
  if (mins < 15) return null
  const label = `Aguardando ${formatarTempoEspera(mins)}`
  if (mins < 30)  return { label, nivel: 'amarelo' }
  if (mins < 120) return { label, nivel: 'laranja' }
  return { label, nivel: 'vermelho' }
}

function IndicadorUrgencia({
  ultima, agora, statusConversa, arquivada,
}: {
  ultima: UltimaMsgInfo | undefined
  agora: number
  statusConversa: string
  arquivada: boolean
}) {
  const urg = urgenciaInfo(ultima, agora, statusConversa, arquivada)
  if (!urg) return null
  const cores: Record<NivelUrgencia, { texto: string; dot: string }> = {
    amarelo: { texto: 'text-amber-500',  dot: 'bg-amber-400' },
    laranja: { texto: 'text-orange-500', dot: 'bg-orange-500' },
    vermelho: { texto: 'text-red-600',   dot: 'bg-red-600' },
  }
  const cor = cores[urg.nivel]
  return (
    <span className={cn('flex items-center gap-1 text-[10px]', cor.texto)}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', cor.dot)} />
      {urg.label}
    </span>
  )
}

function CanalIcon({ canal }: { canal: string }) {
  if (canal === 'whatsapp') return <Phone className="w-3.5 h-3.5 text-green-600" />
  if (canal === 'site')      return <Globe className="w-3.5 h-3.5 text-blue-500" />
  return <MessageCircle className="w-3.5 h-3.5 text-gray-400" />
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    ativo:       { label: 'Ativo', className: 'bg-blue-100 text-blue-700' },
    qualificado: { label: 'Qualificado', className: 'bg-green-100 text-green-700' },
    encerrado:   { label: 'Encerrado', className: 'bg-gray-100 text-gray-500' },
    humano:      { label: 'Humano', className: 'bg-amber-100 text-amber-700' },
  }
  const s = map[status] ?? map.ativo
  return (
    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', s.className)}>
      {s.label}
    </span>
  )
}

export default function ConversasPage() {
  const { usuario } = useAuth()
  const { pode } = usePermissao()
  const router = useRouter()
  const qc = useQueryClient()
  const [canal, setCanal] = useState<Canal>('todos')
  const [statusFiltro, setStatusFiltro] = useState<Status>('todos')
  const [pesquisa, setPesquisa] = useState('')
  const [conversaSelecionada, setConversaSelecionada] = useState<Conversa | null>(null)
  const mensagensEndRef = useRef<HTMLDivElement>(null)
  const [painelNotasAberto, setPainelNotasAberto] = useState(false)
  const [textoNota, setTextoNota] = useState('')
  const [modalTransferencia, setModalTransferencia] = useState(false)
  const [novoAtendente, setNovoAtendente] = useState('')
  const notasEndRef = useRef<HTMLDivElement>(null)
  const [transcrevendo, setTranscrevendo] = useState<Set<string>>(new Set())
  const [modoVincular, setModoVincular] = useState<'opcoes' | 'buscar' | null>(null)
  const [drawerCriarLead, setDrawerCriarLead] = useState(false)
  const [novaSolicitacaoAberta, setNovaSolicitacaoAberta] = useState(false)
  const [buscaLead, setBuscaLead] = useState('')
  const [leadSelecionado, setLeadSelecionado] = useState<{ id: string; nome: string; telefone: string } | null>(null)
  const [salvarTelefone, setSalvarTelefone] = useState(true)
  const redirectAposVincularRef = useRef<string | null>(null)
  const [agora, setAgora] = useState(() => Date.now())
  const urlParamsHandledRef = useRef(false)

  const { data: conversas = [], isLoading } = useQuery({
    queryKey: ['conversas', usuario?.empresa_id, canal, statusFiltro],
    enabled: !!usuario?.empresa_id,
    queryFn: async () => {
      let q = supabase
        .from('conversas')
        .select('*, lead:leads!lead_id(fase:fases!fase_id(nome, cor))')
        .eq('empresa_id', usuario!.empresa_id)
        .order('updated_at', { ascending: false })

      if (statusFiltro === 'arquivadas') {
        q = q.eq('arquivada', true)
      } else {
        q = q.eq('arquivada', false)
        if (statusFiltro !== 'todos') q = q.eq('status', statusFiltro)
      }

      if (canal !== 'todos') q = q.eq('canal', canal)

      const { data, error } = await q
      if (error) throw error
      return data as Conversa[]
    },
  })

  const conversaIdsKey = conversas.map((c) => c.id).join(',')
  const { data: ultimasMensagensMap = new Map<string, UltimaMsgInfo>() } = useQuery({
    queryKey: ['ultima-msg-urgencia', conversaIdsKey],
    enabled: conversas.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const ids = conversas.map((c) => c.id)
      const { data, error } = await supabase
        .from('mensagens')
        .select('conversa_id, origem, created_at')
        .in('conversa_id', ids)
        .order('created_at', { ascending: false })
        .limit(Math.min(ids.length * 20, 500))
      if (error) throw error
      const map = new Map<string, UltimaMsgInfo>()
      for (const m of (data ?? [])) {
        if (!map.has(m.conversa_id)) map.set(m.conversa_id, { origem: m.origem, created_at: m.created_at })
      }
      return map
    },
  })

  const { data: mensagens = [] } = useQuery({
    queryKey: ['mensagens', conversaSelecionada?.id],
    enabled: !!conversaSelecionada,
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mensagens')
        .select('*')
        .eq('conversa_id', conversaSelecionada!.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as Mensagem[]
    },
  })

  const { data: notas = [] } = useQuery({
    queryKey: ['notas', conversaSelecionada?.id],
    enabled: !!conversaSelecionada && painelNotasAberto,
    refetchInterval: 3000,
    queryFn: async (): Promise<NotaInterna[]> => {
      const { data, error } = await supabase
        .from('notas_internas')
        .select('id, conteudo, created_at, autor:usuarios!autor_id(nome)')
        .eq('conversa_id', conversaSelecionada!.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as NotaInterna[]
    },
  })

  const { data: atendentes = [] } = useQuery({
    queryKey: ['atendentes-conversa', usuario?.empresa_id],
    enabled: !!usuario?.empresa_id,
    staleTime: 1000 * 60 * 5,
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
    queryKey: ['instancias-conversa', usuario?.empresa_id],
    enabled: !!usuario?.empresa_id,
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<InstanciaSimples[]> => {
      const { data, error } = await supabase
        .from('instancias')
        .select('id, atendente_id')
        .eq('ativo', true)
      if (error) throw error
      return data
    },
  })

  const { data: leadsEncontrados = [] } = useQuery({
    queryKey: ['busca-leads-vincular', buscaLead, usuario?.empresa_id],
    enabled: modoVincular === 'buscar' && buscaLead.trim().length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from('leads')
        .select('id, nome, telefone, fase:fases!fase_id(nome, cor)')
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .or(`nome.ilike.%${buscaLead.trim()}%,telefone.ilike.%${buscaLead.trim()}%`)
        .limit(10)
      return (data ?? []).map((l: { id: string; nome: string; telefone: string; fase: { nome: string; cor: string }[] }) => ({
        ...l,
        fase: l.fase?.[0] ?? null,
      })) as { id: string; nome: string; telefone: string; fase: { nome: string; cor: string } | null }[]
    },
  })

  const vincularLead = useMutation({
    mutationFn: async ({ lead_id, salvar }: { lead_id: string; salvar: boolean }) => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/conversas/${conversaSelecionada!.id}/vincular-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ lead_id, salvar_telefone: salvar }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Erro ao vincular')
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversas'] })
      setModoVincular(null)
      setBuscaLead('')
      setLeadSelecionado(null)
      setSalvarTelefone(true)
      toast.success('Lead vinculado com sucesso.')
      if (redirectAposVincularRef.current) {
        router.push(redirectAposVincularRef.current)
        redirectAposVincularRef.current = null
      }
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const adicionarNota = useMutation({
    mutationFn: async (conteudo: string) => {
      const { error } = await supabase.from('notas_internas').insert({
        conversa_id: conversaSelecionada!.id,
        autor_id: usuario!.id,
        conteudo,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setTextoNota('')
      qc.invalidateQueries({ queryKey: ['notas', conversaSelecionada?.id] })
      setTimeout(() => notasEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    },
    onError: () => toast.error('Erro ao salvar nota.'),
  })

  const transferir = useMutation({
    mutationFn: async (atendenteId: string) => {
      const instanciaDoAtendente = instancias.find((i) => i.atendente_id === atendenteId)
      const { error } = await supabase
        .from('conversas')
        .update({ atendente_id: atendenteId, instancia_id: instanciaDoAtendente?.id ?? null })
        .eq('id', conversaSelecionada!.id)
      if (error) throw error
      const nomeAtendente = atendentes.find((a) => a.id === atendenteId)?.nome ?? 'outro atendente'
      await supabase.from('notas_internas').insert({
        conversa_id: conversaSelecionada!.id,
        autor_id: usuario!.id,
        conteudo: `Conversa transferida para ${nomeAtendente}.`,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversas'] })
      qc.invalidateQueries({ queryKey: ['notas', conversaSelecionada?.id] })
      setModalTransferencia(false)
      setNovoAtendente('')
      toast.success('Conversa transferida.')
    },
    onError: () => toast.error('Erro ao transferir conversa.'),
  })

  async function transcreverAudio(mensagemId: string, fileUrl: string) {
    setTranscrevendo((prev) => new Set(prev).add(mensagemId))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/transcrever-audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ mensagem_id: mensagemId, file_url: fileUrl }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Erro na transcrição.'); return }
      qc.invalidateQueries({ queryKey: ['mensagens', conversaSelecionada?.id] })
      toast.success('Áudio transcrito.')
    } catch {
      toast.error('Erro ao transcrever áudio.')
    } finally {
      setTranscrevendo((prev) => { const s = new Set(prev); s.delete(mensagemId); return s })
    }
  }

  // Auto-scroll notas
  useEffect(() => {
    notasEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [notas])

  // Auto-scroll para última mensagem
  useEffect(() => {
    mensagensEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  // Tick a cada minuto para atualizar indicadores de urgência
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Lê parâmetros de URL: ?busca= pré-filtra pesquisa; ?id= seleciona conversa
  useEffect(() => {
    if (urlParamsHandledRef.current) return
    const params = new URLSearchParams(window.location.search)
    const busca = params.get('busca')
    if (busca) setPesquisa(decodeURIComponent(busca))
  }, [])

  useEffect(() => {
    if (urlParamsHandledRef.current || conversas.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const idParam = params.get('id')
    if (idParam) {
      const conversa = conversas.find(c => c.id === idParam)
      if (conversa) {
        setConversaSelecionada(conversa)
        urlParamsHandledRef.current = true
      }
    } else if (params.get('busca')) {
      urlParamsHandledRef.current = true
    }
  }, [conversas])

  // Realtime: atualiza lista de conversas
  useEffect(() => {
    if (!usuario?.empresa_id) return
    const channel = supabase
      .channel('conversas-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversas',
        filter: `empresa_id=eq.${usuario.empresa_id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['conversas'] })
        qc.invalidateQueries({ queryKey: ['ultima-msg-urgencia'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [usuario?.empresa_id, qc])

  // Realtime: atualiza mensagens da conversa aberta (filtrado por conversa_id para RLS funcionar)
  useEffect(() => {
    if (!conversaSelecionada?.id) return
    const channel = supabase
      .channel(`mensagens-${conversaSelecionada.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mensagens',
        filter: `conversa_id=eq.${conversaSelecionada.id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['mensagens', conversaSelecionada.id] })
        qc.invalidateQueries({ queryKey: ['conversas'] })
        qc.invalidateQueries({ queryKey: ['ultima-msg-urgencia'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [conversaSelecionada?.id, qc])

  const assumir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('conversas')
        .update({ bot_ativo: false, status: 'humano' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversas'] })
      if (conversaSelecionada) {
        setConversaSelecionada({ ...conversaSelecionada, bot_ativo: false, status: 'humano' })
      }
      toast.success('Você assumiu a conversa. Bot desativado.')
    },
  })

  const reativar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('conversas')
        .update({ bot_ativo: true, status: 'ativo' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversas'] })
      if (conversaSelecionada) {
        setConversaSelecionada({ ...conversaSelecionada, bot_ativo: true, status: 'ativo' })
      }
      toast.success('Bot reativado. Atendimento automático retomado.')
    },
  })

  const encerrar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('conversas')
        .update({ status: 'encerrado', bot_ativo: false })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversas'] })
      setConversaSelecionada(null)
      toast.success('Conversa encerrada.')
    },
  })

  const arquivar = useMutation({
    mutationFn: async ({ id, arquivada }: { id: string; arquivada: boolean }) => {
      const { error } = await supabase.from('conversas').update({ arquivada }).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, { arquivada }) => {
      qc.invalidateQueries({ queryKey: ['conversas'] })
      setConversaSelecionada(null)
      toast.success(arquivada ? 'Conversa arquivada.' : 'Conversa desarquivada.')
    },
  })

  const canais: { id: Canal; label: string }[] = [
    { id: 'todos', label: 'Todos' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'site', label: 'Site' },
    { id: 'instagram', label: 'Instagram' },
  ]

  const conversasFiltradas = pesquisa.trim()
    ? conversas.filter((c) => {
        const q = pesquisa.toLowerCase()
        return c.contato_nome?.toLowerCase().includes(q) || c.contato_telefone?.includes(q)
      })
    : conversas

  const statusOpcoes: { id: Status; label: string }[] = [
    { id: 'todos', label: 'Todos' },
    { id: 'ativo', label: 'Ativos' },
    { id: 'qualificado', label: 'Qualificados' },
    { id: 'humano', label: 'Em atendimento' },
    { id: 'encerrado', label: 'Encerrados' },
    { id: 'arquivadas', label: 'Arquivadas' },
  ]

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* Sidebar de conversas */}
      <div className="w-80 border-r border-gray-200 flex flex-col bg-white shrink-0">
        <div className="px-4 py-3 border-b border-gray-100">
          <h1 className="text-base font-semibold text-fonti-primary flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Conversas
          </h1>
        </div>

        {/* Campo de pesquisa */}
        <div className="px-3 py-2 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={pesquisa}
              onChange={(e) => setPesquisa(e.target.value)}
              className="w-full text-xs pl-8 pr-8 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-fonti-primary bg-gray-50 placeholder:text-gray-400"
            />
            {pesquisa && (
              <button onClick={() => setPesquisa('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filtros canal */}
        <div className="px-3 py-2 border-b border-gray-100 flex gap-1.5 flex-wrap">
          {canais.map((c) => (
            <button key={c.id} onClick={() => setCanal(c.id)}
              className={cn('text-xs px-2.5 py-1 rounded-full border transition-all',
                canal === c.id
                  ? 'bg-fonti-primary text-white border-fonti-primary'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              )}>
              {c.label}
            </button>
          ))}
        </div>

        {/* Filtros status */}
        <div className="px-3 py-2 border-b border-gray-100 flex gap-1.5 flex-wrap">
          {statusOpcoes.map((s) => (
            <button key={s.id} onClick={() => setStatusFiltro(s.id)}
              className={cn('text-xs px-2 py-0.5 rounded-full border transition-all',
                statusFiltro === s.id
                  ? 'bg-fonti-accent/20 text-fonti-primary border-fonti-accent'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              )}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-px p-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : conversasFiltradas.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">
              {pesquisa ? 'Nenhum resultado para a pesquisa.' : 'Nenhuma conversa encontrada.'}
            </p>
          ) : (
            conversasFiltradas.map((c) => (
              <button
                key={c.id}
                onClick={() => setConversaSelecionada(c)}
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors',
                  conversaSelecionada?.id === c.id && 'bg-fonti-accent-hover/30 border-l-2 border-l-fonti-accent'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <CanalIcon canal={c.canal} />
                    <span className="text-sm font-medium text-gray-800 truncate max-w-[130px]">
                      {c.contato_nome ?? c.contato_telefone ?? 'Desconhecido'}
                    </span>
                    {c.contato_grupo_id && (
                      <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-purple-100 text-purple-600 shrink-0">
                        Grupo
                      </span>
                    )}
                  </div>
                  {c.lead?.fase ? (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0"
                      style={{ background: c.lead.fase.cor + '22', color: c.lead.fase.cor }}
                    >
                      {c.lead.fase.nome}
                    </span>
                  ) : (
                    <StatusBadge status={c.status} />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  {urgenciaInfo(ultimasMensagensMap.get(c.id), agora, c.status, c.arquivada) ? (
                    <IndicadorUrgencia ultima={ultimasMensagensMap.get(c.id)} agora={agora} statusConversa={c.status} arquivada={c.arquivada} />
                  ) : (
                    <p className="text-xs text-gray-400">
                      {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  )}
                  <div className="flex items-center gap-1">
                    {pode('conversas.ver_todas') && c.instancia_id && (
                      <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                        <Smartphone className="w-2.5 h-2.5" /> inst
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Painel de mensagens + notas */}
      {conversaSelecionada ? (
        <div className="flex-1 flex overflow-hidden">
        {/* Coluna principal da conversa */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CanalIcon canal={conversaSelecionada.canal} />
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {conversaSelecionada.contato_nome ?? conversaSelecionada.contato_telefone ?? 'Desconhecido'}
                </p>
                <div className="flex items-center gap-2">
                  <StatusBadge status={conversaSelecionada.status} />
                  {conversaSelecionada.lead?.fase && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: conversaSelecionada.lead.fase.cor + '22', color: conversaSelecionada.lead.fase.cor }}
                    >
                      {conversaSelecionada.lead.fase.nome}
                    </span>
                  )}
                  {conversaSelecionada.lead_id ? (
                    <a href={`/leads?open=${conversaSelecionada.lead_id}`}
                      className="text-xs text-blue-600 hover:underline">
                      Ver lead
                    </a>
                  ) : (
                    <button
                      onClick={() => { setModoVincular('opcoes'); setBuscaLead(''); setLeadSelecionado(null) }}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-fonti-primary transition-colors"
                    >
                      <Link2 className="w-3 h-3" />
                      Vincular lead
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {/* Botão nova solicitação */}
              <Button size="sm" variant="outline"
                className="h-7 text-xs gap-1.5 border-fonti-accent/60 text-fonti-primary hover:bg-fonti-accent-hover"
                onClick={() => setNovaSolicitacaoAberta(true)}>
                <ClipboardList className="w-3.5 h-3.5" />
                Solicitação
              </Button>

              {/* Botão chat interno */}
              <Button size="sm" variant="outline"
                className={cn('h-7 text-xs gap-1.5',
                  painelNotasAberto
                    ? 'bg-fonti-primary text-white border-fonti-primary'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                )}
                onClick={() => setPainelNotasAberto(!painelNotasAberto)}>
                <MessageSquareDashed className="w-3.5 h-3.5" />
                Notas
              </Button>

              {/* Botão transferir */}
              {pode('conversas.transferir') && conversaSelecionada.status !== 'encerrado' && (
                <Button size="sm" variant="outline"
                  className="h-7 text-xs gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
                  onClick={() => { setModalTransferencia(true); setNovoAtendente('') }}>
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  Transferir
                </Button>
              )}

              {conversaSelecionada.bot_ativo && (
                <Button size="sm" variant="outline"
                  className="h-7 text-xs gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={() => assumir.mutate(conversaSelecionada.id)}
                  disabled={assumir.isPending}>
                  <UserCheck className="w-3.5 h-3.5" />
                  Assumir
                </Button>
              )}
              {!conversaSelecionada.bot_ativo && conversaSelecionada.status !== 'encerrado' && (
                <Button size="sm" variant="outline"
                  className="h-7 text-xs gap-1.5 border-green-200 text-green-700 hover:bg-green-50"
                  onClick={() => reativar.mutate(conversaSelecionada.id)}
                  disabled={reativar.isPending}>
                  <Bot className="w-3.5 h-3.5" />
                  Reativar bot
                </Button>
              )}
              {conversaSelecionada.status !== 'encerrado' && (
                <Button size="sm" variant="outline"
                  className="h-7 text-xs gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                  onClick={() => encerrar.mutate(conversaSelecionada.id)}
                  disabled={encerrar.isPending}>
                  <X className="w-3.5 h-3.5" />
                  Encerrar
                </Button>
              )}
              <Button size="sm" variant="outline"
                className="h-7 text-xs gap-1.5 border-gray-200 text-gray-500 hover:bg-gray-50"
                onClick={() => arquivar.mutate({ id: conversaSelecionada.id, arquivada: !conversaSelecionada.arquivada })}
                disabled={arquivar.isPending}
                title={conversaSelecionada.arquivada ? 'Desarquivar' : 'Arquivar conversa'}>
                {conversaSelecionada.arquivada ? '↩ Desarquivar' : '📁 Arquivar'}
              </Button>
            </div>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-gray-50">
            {mensagens.map((m) => {
              const tipoMidia = m.metadata?.tipo_midia
              const fileUrl = m.metadata?.file_url

              return (
                <div key={m.id} className={`flex ${m.origem === 'cliente' ? 'justify-start' : 'justify-end'}`}>
                  <div className={cn(
                    'max-w-[65%] rounded-2xl text-sm leading-snug overflow-hidden',
                    m.origem === 'cliente'
                      ? 'bg-white border border-gray-100 rounded-bl-sm text-gray-800 shadow-sm'
                      : m.origem === 'bot'
                      ? 'bg-fonti-primary text-white rounded-br-sm'
                      : 'bg-fonti-accent text-fonti-primary rounded-br-sm font-medium'
                  )}>
                    {m.origem === 'cliente' && conversaSelecionada.contato_grupo_id && m.metadata?.sender_nome && (
                      <p className="text-[10px] font-semibold text-purple-600 px-3 pt-2">
                        {m.metadata.sender_nome}
                      </p>
                    )}
                    {m.origem === 'humano' && (
                      <p className="text-[10px] opacity-70 px-3 pt-2">
                        {m.metadata?.atendente ?? 'Atendente'}
                      </p>
                    )}

                    {/* Imagem */}
                    {tipoMidia === 'image' && fileUrl && (
                      <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                        <img src={fileUrl} alt={m.metadata?.nome_arquivo ?? 'Imagem'} className="max-w-full max-h-60 object-cover" />
                      </a>
                    )}
                    {tipoMidia === 'image' && !fileUrl && (
                      <div className="px-3 py-2 flex items-center gap-2 opacity-70">
                        <ImageIcon className="w-4 h-4" /> <span className="text-xs">{m.metadata?.nome_arquivo ?? 'Imagem'}</span>
                      </div>
                    )}

                    {/* Vídeo */}
                    {tipoMidia === 'video' && fileUrl && (
                      <video src={fileUrl} controls className="max-w-full max-h-60" />
                    )}
                    {tipoMidia === 'video' && !fileUrl && (
                      <div className="px-3 py-2 flex items-center gap-2 opacity-70">
                        <ImageIcon className="w-4 h-4" /> <span className="text-xs">{m.metadata?.nome_arquivo ?? 'Vídeo'}</span>
                      </div>
                    )}

                    {/* Áudio / PTT */}
                    {(tipoMidia === 'audio' || tipoMidia === 'ptt') && fileUrl && (
                      <div className="px-3 py-2 space-y-1.5">
                        <AudioPlayer src={fileUrl} />
                        {m.metadata?.transcricao ? (
                          <p className="text-[11px] italic opacity-80 border-t border-white/20 pt-1.5 leading-relaxed">
                            "{m.metadata.transcricao}"
                          </p>
                        ) : (
                          <button
                            className="text-[10px] opacity-60 hover:opacity-90 underline"
                            disabled={transcrevendo.has(m.id)}
                            onClick={() => transcreverAudio(m.id, fileUrl)}
                          >
                            {transcrevendo.has(m.id) ? 'Transcrevendo...' : 'Transcrever áudio'}
                          </button>
                        )}
                      </div>
                    )}
                    {(tipoMidia === 'audio' || tipoMidia === 'ptt') && !fileUrl && (
                      <div className="px-3 py-2 flex items-center gap-2 opacity-70">
                        <Volume2 className="w-4 h-4" /> <span className="text-xs">{m.metadata?.nome_arquivo ?? 'Áudio'}</span>
                      </div>
                    )}

                    {/* Documento */}
                    {tipoMidia === 'document' && (
                      <div className="px-3 py-2 flex items-center gap-2">
                        <FileText className="w-4 h-4 opacity-70 shrink-0" />
                        {fileUrl
                          ? <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline truncate">{m.metadata?.nome_arquivo ?? 'Documento'}</a>
                          : <span className="text-xs opacity-70">{m.metadata?.nome_arquivo ?? 'Documento'}</span>
                        }
                      </div>
                    )}

                    {/* Texto (inclui captions de mídia; oculta placeholders [xxx]) */}
                    {m.conteudo && !m.conteudo.match(/^\[.+\]$/) && (
                      <p className="px-3 py-2 whitespace-pre-wrap">{m.conteudo}</p>
                    )}

                    <p className="text-[10px] opacity-60 text-right px-3 pb-1.5">
                      {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              )
            })}
            {mensagens.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">Nenhuma mensagem ainda.</p>
            )}
            <div ref={mensagensEndRef} />
          </div>

          {/* Aviso bot ativo */}
          {conversaSelecionada.bot_ativo && (
            <div className="px-4 py-1.5 bg-amber-50 border-t border-amber-100 flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-amber-500 shrink-0" />
              <p className="text-[11px] text-amber-700">Bot ativo — clique em "Assumir" para responder manualmente.</p>
            </div>
          )}

          {/* Painel de composição */}
          <PainelComposicao
            conversaId={conversaSelecionada.id}
            telefone={conversaSelecionada.contato_telefone ?? ''}
            disabled={conversaSelecionada.status === 'encerrado'}
            onEnviado={() => qc.invalidateQueries({ queryKey: ['mensagens', conversaSelecionada.id] })}
          />
        </div>

        {/* Painel de notas internas (colapsável) */}
        {painelNotasAberto && (
          <div className="w-72 shrink-0 border-l border-gray-200 bg-white flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquareDashed className="w-4 h-4 text-fonti-primary" />
                <span className="text-sm font-semibold text-fonti-primary">Notas internas</span>
              </div>
              <button onClick={() => setPainelNotasAberto(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[10px] text-gray-400 px-4 py-1.5 bg-gray-50 border-b border-gray-100">
              Visível apenas para a equipe. Não enviado ao cliente.
            </p>

            {/* Lista de notas */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
              {notas.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">Nenhuma nota ainda.</p>
              ) : (
                notas.map((n) => (
                  <div key={n.id} className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold text-amber-800">
                        {n.autor?.[0]?.nome ?? 'Equipe'}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(n.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{n.conteudo}</p>
                  </div>
                ))
              )}
              <div ref={notasEndRef} />
            </div>

            {/* Solicitações operacionais */}
            <div className="border-t border-gray-100 px-3 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <ClipboardList className="w-3.5 h-3.5 text-fonti-primary" />
                <span className="text-xs font-semibold text-fonti-primary">Solicitações</span>
              </div>
              <AbaSolicitacoes
                conversaId={conversaSelecionada.id}
                leadId={conversaSelecionada.lead_id ?? undefined}
                compacto
                contexto={{
                  nomeCliente: conversaSelecionada.contato_nome ?? undefined,
                  telefone: conversaSelecionada.contato_telefone ?? undefined,
                }}
              />
            </div>

            {/* Input de nova nota */}
            <div className="px-3 py-3 border-t border-gray-100">
              <div className="flex gap-2">
                <textarea
                  className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-fonti-primary placeholder:text-gray-400"
                  rows={2}
                  placeholder="Escreva uma nota..."
                  value={textoNota}
                  onChange={(e) => setTextoNota(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (textoNota.trim()) adicionarNota.mutate(textoNota.trim())
                    }
                  }}
                />
                <Button size="icon" className="h-8 w-8 bg-fonti-primary hover:bg-fonti-primary-hover shrink-0 self-end"
                  disabled={!textoNota.trim() || adicionarNota.isPending}
                  onClick={() => { if (textoNota.trim()) adicionarNota.mutate(textoNota.trim()) }}>
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Drawer nova solicitação contextual */}
        {conversaSelecionada && (
          <NovaSolicitacaoDrawer
            aberto={novaSolicitacaoAberta}
            onFechar={() => setNovaSolicitacaoAberta(false)}
            conversaId={conversaSelecionada.id}
            leadId={conversaSelecionada.lead_id ?? undefined}
            contexto={{
              nomeCliente: conversaSelecionada.contato_nome ?? undefined,
              telefone: conversaSelecionada.contato_telefone ?? undefined,
            } satisfies ContextoSolicitacao}
          />
        )}

        {/* Modal de vínculo com lead — Opções */}
        <Dialog
          open={modoVincular !== null}
          onOpenChange={(o) => { if (!o) { setModoVincular(null); setBuscaLead(''); setLeadSelecionado(null) } }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Vincular a um lead</DialogTitle>
            </DialogHeader>

            {/* Tela 1: escolha */}
            {modoVincular === 'opcoes' && (
              <div className="py-2 space-y-3">
                <button
                  onClick={() => setModoVincular('buscar')}
                  className="w-full flex items-start gap-4 px-4 py-4 rounded-xl border border-gray-200 hover:border-fonti-primary/40 hover:bg-fonti-primary/5 transition-all text-left group"
                >
                  <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 group-hover:bg-blue-200 transition-colors">
                    <Search className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Buscar lead existente</p>
                    <p className="text-xs text-gray-400 mt-0.5">Pesquise por nome ou telefone e vincule a conversa</p>
                  </div>
                </button>

                <button
                  onClick={() => { setModoVincular(null); setDrawerCriarLead(true) }}
                  className="w-full flex items-start gap-4 px-4 py-4 rounded-xl border border-gray-200 hover:border-fonti-primary/40 hover:bg-fonti-primary/5 transition-all text-left group"
                >
                  <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center shrink-0 group-hover:bg-green-200 transition-colors">
                    <UserPlus className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Criar novo lead</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Abre o formulário pré-preenchido com nome e telefone desta conversa
                    </p>
                  </div>
                </button>
              </div>
            )}

            {/* Tela 2: busca */}
            {modoVincular === 'buscar' && (
              <>
                <div className="py-2 space-y-3">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Buscar lead por nome ou telefone..."
                      value={buscaLead}
                      onChange={(e) => { setBuscaLead(e.target.value); setLeadSelecionado(null) }}
                      className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-fonti-primary"
                      autoFocus
                    />
                  </div>

                  {buscaLead.trim().length >= 2 && (
                    <div className="border border-gray-100 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                      {leadsEncontrados.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">Nenhum lead encontrado.</p>
                      ) : (
                        leadsEncontrados.map((l) => (
                          <button
                            key={l.id}
                            onClick={() => setLeadSelecionado(l)}
                            className={cn(
                              'w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0',
                              leadSelecionado?.id === l.id && 'bg-fonti-accent-hover/30'
                            )}
                          >
                            <div>
                              <p className="text-sm font-medium text-gray-800">{l.nome}</p>
                              <p className="text-xs text-gray-400 font-mono">{l.telefone}</p>
                            </div>
                            {l.fase && (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0"
                                style={{ background: l.fase.cor + '22', color: l.fase.cor }}
                              >
                                {l.fase.nome}
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  {leadSelecionado && conversaSelecionada?.contato_telefone && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={salvarTelefone}
                        onChange={(e) => setSalvarTelefone(e.target.checked)}
                        className="w-3.5 h-3.5 accent-fonti-primary"
                      />
                      <span className="text-xs text-gray-600">
                        Salvar <span className="font-mono font-medium">{conversaSelecionada.contato_telefone}</span> como contato deste lead
                      </span>
                    </label>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setModoVincular('opcoes')}>Voltar</Button>
                  <Button
                    className="bg-fonti-primary hover:bg-fonti-primary-hover text-white"
                    disabled={!leadSelecionado || vincularLead.isPending}
                    onClick={() => vincularLead.mutate({ lead_id: leadSelecionado!.id, salvar: salvarTelefone })}
                  >
                    {vincularLead.isPending ? 'Vinculando...' : 'Vincular'}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Drawer: Criar novo lead pré-preenchido */}
        {conversaSelecionada && (
          <LeadFormDrawer
            aberto={drawerCriarLead}
            onFechar={() => setDrawerCriarLead(false)}
            initialValues={{
              nome:     conversaSelecionada.contato_nome     ?? '',
              telefone: conversaSelecionada.contato_telefone ?? '',
              origem:   'whatsapp',
            }}
            onCriado={(lead: Lead) => {
              redirectAposVincularRef.current = `/leads?open=${lead.id}`
              vincularLead.mutate({ lead_id: lead.id, salvar: false })
            }}
          />
        )}

        {/* Modal de transferência */}
        <Dialog open={modalTransferencia} onOpenChange={(o) => { setModalTransferencia(o); if (!o) setNovoAtendente('') }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Transferir conversa</DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-3">
              <p className="text-sm text-gray-600">
                Contato: <span className="font-medium text-fonti-primary">
                  {conversaSelecionada.contato_nome ?? conversaSelecionada.contato_telefone}
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
                      .filter((a) => a.id !== conversaSelecionada.atendente_id)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setModalTransferencia(false)}>Cancelar</Button>
              <Button
                className="bg-fonti-primary hover:bg-fonti-primary-hover text-white"
                disabled={!novoAtendente || transferir.isPending}
                onClick={() => transferir.mutate(novoAtendente)}
              >
                {transferir.isPending ? 'Transferindo...' : 'Confirmar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center text-gray-400">
            <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Selecione uma conversa para visualizar</p>
          </div>
        </div>
      )}
    </div>
  )
}
