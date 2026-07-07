'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useNotificacoes } from '@/hooks/useNotificacoes'
import { useMarcarTodasLidas, useMarcarNotificacoesLidas } from '@/hooks/useMarcarNotificacoesLidas'
import { NotificacaoItem } from './NotificacaoItem'
import { NOTIFICACAO_META, type TipoNotificacao } from '@/types/notificacoes'
import { resolverRotaNotificacao } from '@/lib/notificacoes/navegarNotificacao'
import { cn } from '@/lib/utils'

const POR_PAGINA = 20

const TIPOS_ORDENADOS = (Object.keys(NOTIFICACAO_META) as TipoNotificacao[]).sort((a, b) =>
  NOTIFICACAO_META[a].label.localeCompare(NOTIFICACAO_META[b].label)
)

interface CentralNotificacoesConteudoProps {
  /** 'drawer' = dentro do Sheet do sino; 'pagina' = /notificacoes em tela cheia. */
  variante?: 'drawer' | 'pagina'
  /** Fecha o Sheet (só faz sentido na variante 'drawer'). */
  onFechar?: () => void
}

/**
 * Conteúdo compartilhado da Central de Notificações — busca, filtros
 * (lida/não lida, tipo, intervalo de data) e lista com ações (marcar lida,
 * marcar todas, excluir). Usado tanto pelo Drawer do sino
 * (`SinoNotificacoes.tsx`) quanto pela página `/notificacoes`, para nunca
 * duplicar lógica de filtro/navegação entre os dois lugares.
 */
export function CentralNotificacoesConteudo({ variante = 'pagina', onFechar }: CentralNotificacoesConteudoProps) {
  const router = useRouter()
  const { data: todas = [], isLoading } = useNotificacoes(200)
  const { mutate: marcarTodas } = useMarcarTodasLidas()
  const { mutate: marcarLidas } = useMarcarNotificacoesLidas()

  const [busca, setBusca] = useState('')
  const [filtroLida, setFiltroLida] = useState<'todas' | 'nao_lidas' | 'lidas'>('todas')
  const [filtroTipo, setFiltroTipo] = useState<TipoNotificacao | 'todos'>('todos')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [pagina, setPagina] = useState(1)

  const naoLidasCount = todas.filter((n) => !n.lida).length

  // Paginação/filtro em memória — pragmático para o volume atual (até 200
  // registros). Ver docs/central-notificacoes.md para a nota de débito
  // técnico sobre virtualização/paginação real caso o volume cresça.
  const filtradas = useMemo(() => {
    const buscaLower = busca.trim().toLowerCase()
    return todas.filter((n) => {
      const passaLida =
        filtroLida === 'todas' ||
        (filtroLida === 'nao_lidas' && !n.lida) ||
        (filtroLida === 'lidas' && n.lida)
      const passaTipo = filtroTipo === 'todos' || n.tipo === filtroTipo
      const passaBusca =
        !buscaLower ||
        n.titulo.toLowerCase().includes(buscaLower) ||
        (n.mensagem?.toLowerCase().includes(buscaLower) ?? false)
      const dataNotif = n.criado_em.slice(0, 10)
      const passaDataInicio = !dataInicio || dataNotif >= dataInicio
      const passaDataFim = !dataFim || dataNotif <= dataFim
      return passaLida && passaTipo && passaBusca && passaDataInicio && passaDataFim
    })
  }, [todas, filtroLida, filtroTipo, busca, dataInicio, dataFim])

  const paginadas = filtradas.slice(0, pagina * POR_PAGINA)
  const temMais = filtradas.length > paginadas.length

  function handleClickItem(id: string, entidade: string | null, entidadeId: string | null) {
    marcarLidas([id])
    const rota = resolverRotaNotificacao(entidade, entidadeId)
    if (rota) {
      router.push(rota)
      onFechar?.()
    }
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', variante === 'drawer' && 'h-full')}>
      {/* Cabeçalho */}
      <div className={cn('shrink-0 space-y-3 border-b border-gray-100 px-4 py-3', variante === 'pagina' && 'px-0')}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fonti-primary">
            Notificações {naoLidasCount > 0 && <span className="text-gray-400 font-normal">({naoLidasCount} não lidas)</span>}
          </h2>
          {naoLidasCount > 0 && (
            <button
              onClick={() => marcarTodas()}
              className="text-xs text-fonti-primary hover:text-fonti-accent-hover transition-colors font-medium"
            >
              Marcar todas como lidas
            </button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <Input
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setPagina(1) }}
            placeholder="Buscar por título ou mensagem..."
            className="h-8 pl-8 text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={filtroLida} onValueChange={(v) => { setFiltroLida(v as typeof filtroLida); setPagina(1) }}>
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="nao_lidas">Não lidas</SelectItem>
              <SelectItem value="lidas">Lidas</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filtroTipo} onValueChange={(v) => { setFiltroTipo(v as typeof filtroTipo); setPagina(1) }}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              {TIPOS_ORDENADOS.map((tipo) => (
                <SelectItem key={tipo} value={tipo}>{NOTIFICACAO_META[tipo].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="date"
            value={dataInicio}
            onChange={(e) => { setDataInicio(e.target.value); setPagina(1) }}
            className="h-8 w-[130px] text-xs"
            aria-label="Data inicial"
          />
          <Input
            type="date"
            value={dataFim}
            onChange={(e) => { setDataFim(e.target.value); setPagina(1) }}
            className="h-8 w-[130px] text-xs"
            aria-label="Data final"
          />
        </div>
      </div>

      {/* Lista */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
        ) : paginadas.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            <Bell className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            Nenhuma notificação encontrada.
          </div>
        ) : (
          <>
            {paginadas.map((n) => (
              <NotificacaoItem
                key={n.id}
                notificacao={n}
                onClick={() => handleClickItem(n.id, n.entidade, n.entidade_id)}
              />
            ))}
            {temMais && (
              <div className="border-t bg-gray-50 py-3 text-center">
                <Button variant="ghost" size="sm" className="text-xs text-fonti-primary" onClick={() => setPagina((p) => p + 1)}>
                  Carregar mais
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Rodapé — só na variante drawer, atalho para a página cheia */}
      {variante === 'drawer' && (
        <div className="shrink-0 border-t bg-gray-50 px-4 py-2">
          <button
            onClick={() => { router.push('/notificacoes'); onFechar?.() }}
            className="w-full text-center text-xs font-medium text-fonti-primary transition-colors hover:text-fonti-accent"
          >
            Ver todas em tela cheia →
          </button>
        </div>
      )}
    </div>
  )
}
