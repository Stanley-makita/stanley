'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Search, Phone, ChevronRight, Users, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
import { FilterChip } from '@/components/ui/filter-chip'
import { EmptyState } from '@/components/ui/empty-state'
import { EntityListItem } from '@/components/ui/entity-list-item'
import { cn } from '@/lib/utils'
import { NovaPessoaModal } from '@/components/pessoas/NovaPessoaModal'

interface PessoaTelefone {
  id: string
  telefone: string
  principal: boolean
  whatsapp: boolean
  ativo: boolean
}

interface Pessoa {
  id: string
  nome: string
  cpf: string | null
  email: string | null
  tipo: string | null
  created_at: string
  pessoa_telefones: PessoaTelefone[]
}

const TIPO_LABEL: Record<string, string> = {
  cliente:    'Cliente',
  corretor:   'Corretor',
  parceiro:   'Parceiro',
  fornecedor: 'Fornecedor',
  outro:      'Outro',
}

export default function PessoasPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)
  const [tipoFiltro, setTipoFiltro] = useState('')
  const [modalNova, setModalNova] = useState(false)
  const PAGE_SIZE = 30

  // Busca valores distintos de tipo presentes na empresa (dinâmico)
  const { data: tiposDisponiveis = [] } = useQuery({
    queryKey: ['pessoas-tipos', usuario?.empresa_id],
    enabled: !!usuario?.empresa_id,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('pessoas')
        .select('tipo')
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .not('tipo', 'is', null)

      if (error) return []
      const unicos = Array.from(new Set((data ?? []).map((r) => r.tipo as string)))
      return unicos.sort((a, b) => (TIPO_LABEL[a] ?? a).localeCompare(TIPO_LABEL[b] ?? b))
    },
  })

  const { data, isLoading } = useQuery({
    queryKey: ['pessoas', usuario?.empresa_id, busca, tipoFiltro, pagina],
    enabled: !!usuario?.empresa_id,
    queryFn: async () => {
      let q = supabase
        .from('pessoas')
        .select('id, nome, cpf, email, tipo, created_at, pessoa_telefones(id, telefone, principal, whatsapp, ativo)', { count: 'exact' })
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE - 1)

      if (busca.trim()) q = q.ilike('nome', `%${busca.trim()}%`)
      if (tipoFiltro)   q = q.eq('tipo', tipoFiltro)

      const { data, count, error } = await q
      if (error) throw error
      return { pessoas: (data ?? []) as Pessoa[], total: count ?? 0 }
    },
  })

  const pessoas = data?.pessoas ?? []
  const total = data?.total ?? 0
  const totalPaginas = Math.ceil(total / PAGE_SIZE)

  function telefonePrincipal(p: Pessoa) {
    const ativos = p.pessoa_telefones.filter((t) => t.ativo)
    return ativos.find((t) => t.principal) ?? ativos[0] ?? null
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b bg-white">
        <PageHeader
          title="Pessoas"
          description={total > 0 ? `${total} contato${total !== 1 ? 's' : ''} cadastrado${total !== 1 ? 's' : ''}` : 'Contatos únicos do CRM'}
          actions={(
            <>
            <div className="relative min-w-[200px] flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por nome..."
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setPagina(1) }}
                className="w-full pl-9 sm:w-64"
              />
            </div>
            <Button
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={() => setModalNova(true)}
            >
              <Plus className="h-4 w-4" />
              Nova Pessoa
            </Button>
            </>
          )}
        />
      </div>

      {/* Filtros de tipo */}
      {tiposDisponiveis.length > 0 && (
        <div className="px-6 py-2.5 border-b bg-white flex items-center gap-2 overflow-x-auto scrollbar-none">
          <FilterChip
            active={tipoFiltro === ''}
            onClick={() => { setTipoFiltro(''); setPagina(1) }}
          >
            Todos
          </FilterChip>
          {tiposDisponiveis.map((tipo) => (
            <FilterChip
              key={tipo}
              active={tipoFiltro === tipo}
              onClick={() => { setTipoFiltro(tipo); setPagina(1) }}
            >
              {TIPO_LABEL[tipo] ?? tipo}
            </FilterChip>
          ))}
        </div>
      )}

      {/* Lista */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : pessoas.length === 0 ? (
          <EmptyState
            icon={Users}
            title={busca || tipoFiltro ? 'Nenhuma pessoa encontrada' : 'Nenhum contato cadastrado ainda'}
            description={busca || tipoFiltro ? 'Tente ajustar os filtros' : 'Pessoas são criadas automaticamente ao receber mensagens'}
            className="h-64"
          />
        ) : (
          <div className="p-4 space-y-2">
            {pessoas.map((pessoa) => {
              const tel = telefonePrincipal(pessoa)
              const nTelefones = pessoa.pessoa_telefones.filter((t) => t.ativo).length

              return (
                <EntityListItem
                  key={pessoa.id}
                  onClick={() => router.push(`/pessoas/${pessoa.id}`)}
                  avatar={(
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#253B29]/10">
                      <span className="text-sm font-bold uppercase text-[#253B29]">
                        {pessoa.nome.charAt(0)}
                      </span>
                    </div>
                  )}
                  heading={pessoa.nome}
                  meta={(
                    <>
                      {pessoa.tipo && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#253B29]/8 text-[#253B29] shrink-0">
                          {TIPO_LABEL[pessoa.tipo] ?? pessoa.tipo}
                        </span>
                      )}
                      {pessoa.cpf && (
                        <span className="text-[10px] text-gray-400 shrink-0">CPF: {pessoa.cpf}</span>
                      )}
                    </>
                  )}
                  details={(
                    <>
                      {tel ? (
                        <span className="flex items-center gap-1 text-sm text-gray-500">
                          <Phone className="h-3 w-3" />
                          {tel.telefone}
                          {nTelefones > 1 && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1">
                              +{nTelefones - 1}
                            </Badge>
                          )}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">Sem telefone</span>
                      )}
                      {pessoa.email && (
                        <span className="text-sm text-gray-400 truncate">{pessoa.email}</span>
                      )}
                    </>
                  )}
                  trailing={(
                    <div className="flex items-center gap-3">
                      <p className={cn('text-xs text-gray-400 transition-colors group-hover:text-gray-600')}>
                        {formatDistanceToNow(new Date(pessoa.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                      <ChevronRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-gray-500" />
                    </div>
                  )}
                />
              )
            })}
          </div>
        )}
      </div>

      <NovaPessoaModal aberto={modalNova} onFechar={() => setModalNova(false)} />

      {/* Paginação */}
      {totalPaginas > 1 && (
        <div className="px-6 py-3 border-t bg-white flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Página {pagina} de {totalPaginas}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={pagina === 1}
              className="px-3 py-1.5 text-sm rounded-md border disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              Anterior
            </button>
            <button
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={pagina === totalPaginas}
              className="px-3 py-1.5 text-sm rounded-md border disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
