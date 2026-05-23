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
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Pessoas</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {total > 0 ? `${total} contato${total !== 1 ? 's' : ''} cadastrado${total !== 1 ? 's' : ''}` : 'Contatos únicos do CRM'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por nome..."
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setPagina(1) }}
                className="pl-9"
              />
            </div>
            <Button
              size="sm"
              className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5 shrink-0"
              onClick={() => setModalNova(true)}
            >
              <Plus className="h-4 w-4" />
              Nova Pessoa
            </Button>
          </div>
        </div>
      </div>

      {/* Filtros de tipo */}
      {tiposDisponiveis.length > 0 && (
        <div className="px-6 py-2.5 border-b bg-white flex items-center gap-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => { setTipoFiltro(''); setPagina(1) }}
            className={cn(
              'text-xs px-3 py-1.5 rounded-full border shrink-0 transition-all',
              tipoFiltro === ''
                ? 'border-[#253B29] bg-[#253B29] text-white font-medium'
                : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            )}
          >
            Todos
          </button>
          {tiposDisponiveis.map((tipo) => (
            <button
              key={tipo}
              onClick={() => { setTipoFiltro(tipo); setPagina(1) }}
              className={cn(
                'text-xs px-3 py-1.5 rounded-full border shrink-0 transition-all',
                tipoFiltro === tipo
                  ? 'border-[#253B29] bg-[#253B29] text-white font-medium'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              )}
            >
              {TIPO_LABEL[tipo] ?? tipo}
            </button>
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
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Users className="h-12 w-12 mb-3 opacity-30" />
            <p className="font-medium">
              {busca || tipoFiltro ? 'Nenhuma pessoa encontrada' : 'Nenhum contato cadastrado ainda'}
            </p>
            <p className="text-sm mt-1">
              {busca || tipoFiltro ? 'Tente ajustar os filtros' : 'Pessoas são criadas automaticamente ao receber mensagens'}
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {pessoas.map((pessoa) => {
              const tel = telefonePrincipal(pessoa)
              const nTelefones = pessoa.pessoa_telefones.filter((t) => t.ativo).length

              return (
                <button
                  key={pessoa.id}
                  onClick={() => router.push(`/pessoas/${pessoa.id}`)}
                  className="w-full flex items-center gap-4 bg-white rounded-lg px-4 py-3.5 border border-gray-100 hover:border-[#253B29]/30 hover:shadow-sm transition-all text-left group"
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-[#253B29]/10 flex items-center justify-center shrink-0">
                    <span className="text-[#253B29] font-bold text-sm uppercase">
                      {pessoa.nome.charAt(0)}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">{pessoa.nome}</span>
                      {pessoa.tipo && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#253B29]/8 text-[#253B29] shrink-0">
                          {TIPO_LABEL[pessoa.tipo] ?? pessoa.tipo}
                        </span>
                      )}
                      {pessoa.cpf && (
                        <span className="text-[10px] text-gray-400 shrink-0">CPF: {pessoa.cpf}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
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
                    </div>
                  </div>

                  {/* Data */}
                  <div className="text-right shrink-0">
                    <p className={cn(
                      'text-xs text-gray-400 group-hover:text-gray-600 transition-colors'
                    )}>
                      {formatDistanceToNow(new Date(pessoa.created_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>

                  <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors" />
                </button>
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
