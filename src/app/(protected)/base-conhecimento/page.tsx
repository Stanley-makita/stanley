'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import {
  Search, Plus, BookOpen, FileText, Link2, AlignLeft,
  Tag, Eye, EyeOff, FolderOpen, Filter, Settings2, X, Pencil, Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type Categoria = { id: string; nome: string; icone: string; cor: string; ordem: number }
type Doc = {
  id: string
  titulo: string
  descricao: string | null
  tipo: 'arquivo' | 'link' | 'texto'
  arquivo_nome: string | null
  arquivo_tamanho_kb: number | null
  link_url: string | null
  tags: string[]
  publicado: boolean
  updated_at: string
  categoria: { id: string; nome: string; icone: string; cor: string } | null
  publicado_por_usuario: { nome: string } | null
}

const TIPO_ICON = { arquivo: FileText, link: Link2, texto: AlignLeft }
const TIPO_LABEL = { arquivo: 'Arquivo', link: 'Link', texto: 'Texto' }

function formatBytes(kb: number) {
  return kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`
}

const CORES = ['#6B7280','#253B29','#C2AA6A','#3B82F6','#EF4444','#F59E0B','#8B5CF6','#EC4899','#14B8A6','#F97316']

export default function BibliotecaPage() {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [tipo, setTipo] = useState('')
  const [showCats, setShowCats] = useState(false)
  const [catNome, setCatNome] = useState('')
  const [catCor, setCatCor] = useState('#6B7280')
  const [editandoCat, setEditandoCat] = useState<Categoria | null>(null)

  const isGestor = usuario?.perfil === 'admin' || usuario?.perfil === 'gerente'

  const { data: categorias = [] } = useQuery<Categoria[]>({
    queryKey: ['biblioteca-categorias', usuario?.empresa_id],
    enabled: !!usuario?.empresa_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('base_conhecimento_categorias')
        .select('id, nome, icone, cor, ordem')
        .eq('empresa_id', usuario!.empresa_id)
        .order('ordem', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const { data: docs = [], isLoading } = useQuery<Doc[]>({
    queryKey: ['biblioteca-docs', usuario?.empresa_id, q, categoriaId, tipo],
    enabled: !!usuario?.empresa_id,
    queryFn: async () => {
      let query = supabase
        .from('base_conhecimento_docs')
        .select(`
          id, titulo, descricao, tipo, arquivo_nome, arquivo_tamanho_kb,
          link_url, tags, publicado, updated_at,
          categoria:base_conhecimento_categorias(id, nome, icone, cor),
          publicado_por_usuario:usuarios!publicado_por(nome)
        `)
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })

      if (!isGestor) query = query.eq('publicado', true)
      if (categoriaId) query = query.eq('categoria_id', categoriaId)
      if (tipo) query = query.eq('tipo', tipo)
      if (q.trim()) query = query.ilike('titulo', `%${q.trim()}%`)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as unknown as Doc[]
    },
  })

  const salvarCategoria = useMutation({
    mutationFn: async () => {
      if (editandoCat) {
        const { error } = await supabase
          .from('base_conhecimento_categorias')
          .update({ nome: catNome.trim(), cor: catCor })
          .eq('id', editandoCat.id)
          .eq('empresa_id', usuario!.empresa_id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('base_conhecimento_categorias')
          .insert({ empresa_id: usuario!.empresa_id, nome: catNome.trim(), cor: catCor, icone: 'FolderOpen', ordem: categorias.length })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biblioteca-categorias'] })
      setCatNome('')
      setCatCor('#6B7280')
      setEditandoCat(null)
    },
  })

  const excluirCategoria = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('base_conhecimento_categorias')
        .delete()
        .eq('id', id)
        .eq('empresa_id', usuario!.empresa_id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['biblioteca-categorias'] }),
  })

  function iniciarEdicaoCat(cat: Categoria) {
    setEditandoCat(cat)
    setCatNome(cat.nome)
    setCatCor(cat.cor)
  }

  function cancelarEdicaoCat() {
    setEditandoCat(null)
    setCatNome('')
    setCatCor('#6B7280')
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-[#253B29]" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Biblioteca</h1>
            <p className="text-sm text-gray-500">Normativos, manuais, templates e materiais internos</p>
          </div>
        </div>
        {isGestor && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCats(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm transition-colors ${showCats ? 'border-[#253B29] text-[#253B29] bg-[#253B29]/5' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              <Settings2 className="h-4 w-4" />
              Categorias
            </button>
            <Link
              href="/base-conhecimento/novo"
              className="flex items-center gap-2 bg-[#253B29] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1e3023] transition-colors"
            >
              <Plus className="h-4 w-4" />
              Novo documento
            </Link>
          </div>
        )}
      </div>

      {/* Painel de categorias */}
      {isGestor && showCats && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Gerenciar categorias</h2>

          {/* Lista existente */}
          {categorias.length > 0 && (
            <div className="space-y-2">
              {categorias.map(cat => (
                <div key={cat.id} className="flex items-center gap-3">
                  {editandoCat?.id === cat.id ? (
                    <>
                      <input
                        value={catNome}
                        onChange={e => setCatNome(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#253B29]/20"
                      />
                      <div className="flex gap-1">
                        {CORES.map(c => (
                          <button key={c} onClick={() => setCatCor(c)}
                            className={`w-5 h-5 rounded-full transition-transform ${catCor === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : ''}`}
                            style={{ backgroundColor: c }} />
                        ))}
                      </div>
                      <button onClick={() => salvarCategoria.mutate()} disabled={!catNome.trim() || salvarCategoria.isPending}
                        className="text-xs px-3 py-1.5 bg-[#253B29] text-white rounded-lg hover:bg-[#1e3023] disabled:opacity-50">
                        Salvar
                      </button>
                      <button onClick={cancelarEdicaoCat} className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.cor }} />
                      <span className="flex-1 text-sm text-gray-700">{cat.nome}</span>
                      <button onClick={() => iniciarEdicaoCat(cat)} className="text-gray-400 hover:text-gray-700">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => excluirCategoria.mutate(cat.id)} disabled={excluirCategoria.isPending}
                        className="text-gray-400 hover:text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Formulário nova categoria */}
          {!editandoCat && (
            <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
              <input
                value={catNome}
                onChange={e => setCatNome(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && catNome.trim()) salvarCategoria.mutate() }}
                placeholder="Nova categoria..."
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#253B29]/20"
              />
              <div className="flex gap-1">
                {CORES.map(c => (
                  <button key={c} onClick={() => setCatCor(c)}
                    className={`w-5 h-5 rounded-full transition-transform ${catCor === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : ''}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
              <button
                onClick={() => salvarCategoria.mutate()}
                disabled={!catNome.trim() || salvarCategoria.isPending}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#253B29] text-white rounded-lg hover:bg-[#1e3023] disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar documentos..."
            value={q}
            onChange={e => setQ(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#253B29]/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select value={categoriaId} onChange={e => setCategoriaId(e.target.value)}
            className="border border-gray-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#253B29]/20 bg-white">
            <option value="">Todas as categorias</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select value={tipo} onChange={e => setTipo(e.target.value)}
            className="border border-gray-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#253B29]/20 bg-white">
            <option value="">Todos os tipos</option>
            <option value="arquivo">Arquivo</option>
            <option value="link">Link</option>
            <option value="texto">Texto</option>
          </select>
        </div>
      </div>

      {/* Categories bar */}
      {categorias.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setCategoriaId('')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${!categoriaId ? 'bg-[#253B29] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Todos
          </button>
          {categorias.map(cat => (
            <button key={cat.id} onClick={() => setCategoriaId(cat.id === categoriaId ? '' : cat.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${categoriaId === cat.id ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              style={categoriaId === cat.id ? { backgroundColor: cat.cor } : {}}>
              {cat.nome}
            </button>
          ))}
        </div>
      )}

      {/* Docs grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-40 bg-gray-100 animate-pulse rounded-xl" />)}
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum documento encontrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {docs.map(doc => {
            const TipoIcon = TIPO_ICON[doc.tipo]
            return (
              <Link key={doc.id} href={`/base-conhecimento/${doc.id}`}
                className="group flex flex-col gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-[#253B29]/30 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: doc.categoria?.cor ? `${doc.categoria.cor}22` : '#f3f4f6' }}>
                      <TipoIcon className="h-4 w-4" style={{ color: doc.categoria?.cor ?? '#6B7280' }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate group-hover:text-[#253B29]">{doc.titulo}</p>
                      {doc.categoria && <p className="text-xs text-gray-400 truncate">{doc.categoria.nome}</p>}
                    </div>
                  </div>
                  {isGestor && (
                    <div className="shrink-0">
                      {doc.publicado ? <Eye className="h-3.5 w-3.5 text-green-500" /> : <EyeOff className="h-3.5 w-3.5 text-gray-300" />}
                    </div>
                  )}
                </div>
                {doc.descricao && <p className="text-xs text-gray-500 line-clamp-2">{doc.descricao}</p>}
                {doc.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {doc.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="inline-flex items-center gap-0.5 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        <Tag className="h-2.5 w-2.5" />{tag}
                      </span>
                    ))}
                    {doc.tags.length > 3 && <span className="text-xs text-gray-400">+{doc.tags.length - 3}</span>}
                  </div>
                )}
                <div className="mt-auto flex items-center justify-between text-xs text-gray-400">
                  <span>{TIPO_LABEL[doc.tipo]}{doc.arquivo_tamanho_kb ? ` · ${formatBytes(doc.arquivo_tamanho_kb)}` : ''}</span>
                  <span>{formatDistanceToNow(new Date(doc.updated_at), { addSuffix: true, locale: ptBR })}</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
