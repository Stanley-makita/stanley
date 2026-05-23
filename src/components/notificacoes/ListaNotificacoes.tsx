'use client'

import { useState } from 'react'
import { useNotificacoes } from '@/hooks/useNotificacoes'
import { useMarcarTodasLidas, useMarcarNotificacoesLidas } from '@/hooks/useMarcarNotificacoesLidas'
import { NotificacaoItem } from './NotificacaoItem'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TipoNotificacao } from '@/types/notificacoes'
import { useRouter } from 'next/navigation'

const LABELS_TIPO: Record<TipoNotificacao, string> = {
  tarefa_vencida:           'Tarefa Vencida',
  tarefa_atribuida:         'Tarefa Atribuída',
  fase_avancada:            'Fase Avançada',
  lead_atribuido:           'Lead Atribuído',
  processo_emitido:         'Processo Emitido',
  cobranca_vencida:         'Cobrança Vencida',
  comentario_mencionado:    'Menção em Comentário',
  solicitacao_atribuida:    'Solicitação Atribuída',
  solicitacao_concluida:    'Solicitação Concluída',
  solicitacao_sla_vencido:  'SLA Vencido',
  solicitacao_respondida:   'Réplica do Comercial',
  solicitacao_retorno:      'Retorno Operacional',
}

export function ListaNotificacoes() {
  const router = useRouter()
  const { data: todas = [], isLoading } = useNotificacoes(200)
  const { mutate: marcarTodas } = useMarcarTodasLidas()
  const { mutate: marcarLidas } = useMarcarNotificacoesLidas()

  const [filtroLida, setFiltroLida] = useState<'todas' | 'nao_lidas' | 'lidas'>('todas')
  const [filtroTipo, setFiltroTipo] = useState<TipoNotificacao | 'todos'>('todos')
  const [pagina, setPagina] = useState(1)

  const POR_PAGINA = 20

  const filtradas = todas.filter((n) => {
    const passaLida =
      filtroLida === 'todas' ||
      (filtroLida === 'nao_lidas' && !n.lida) ||
      (filtroLida === 'lidas' && n.lida)
    const passaTipo = filtroTipo === 'todos' || n.tipo === filtroTipo
    return passaLida && passaTipo
  })

  const paginadas = filtradas.slice(0, pagina * POR_PAGINA)
  const temMais = filtradas.length > paginadas.length
  const naoLidasCount = todas.filter((n) => !n.lida).length

  function handleClick(notificacaoId: string, entidade: string | null, entidadeId: string | null) {
    marcarLidas([notificacaoId])
    if (entidade === 'processo' && entidadeId) {
      router.push(`/processos/${entidadeId}`)
    } else if (entidade === 'lead') {
      router.push('/leads')
    }
  }

  if (isLoading) {
    return <div className="py-12 text-center text-gray-400">Carregando...</div>
  }

  return (
    <div className="space-y-4">
      {/* Barra de filtros + ação */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filtroLida} onValueChange={(v) => { setFiltroLida(v as typeof filtroLida); setPagina(1) }}>
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="nao_lidas">Não lidas ({naoLidasCount})</SelectItem>
            <SelectItem value="lidas">Lidas</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filtroTipo} onValueChange={(v) => { setFiltroTipo(v as typeof filtroTipo); setPagina(1) }}>
          <SelectTrigger className="w-52 h-8 text-sm">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {(Object.keys(LABELS_TIPO) as TipoNotificacao[]).map((tipo) => (
              <SelectItem key={tipo} value={tipo}>{LABELS_TIPO[tipo]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {naoLidasCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => marcarTodas()}
            className="ml-auto h-8 text-xs"
          >
            Marcar todas como lidas
          </Button>
        )}
      </div>

      {/* Lista */}
      <div className="border rounded-lg overflow-hidden">
        {paginadas.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            Nenhuma notificação encontrada.
          </div>
        ) : (
          <>
            {paginadas.map((n) => (
              <NotificacaoItem
                key={n.id}
                notificacao={n}
                onClick={() => handleClick(n.id, n.entidade, n.entidade_id)}
              />
            ))}
            {temMais && (
              <div className="py-3 text-center border-t bg-gray-50">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-[#253B29]"
                  onClick={() => setPagina((p) => p + 1)}
                >
                  Carregar mais
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}