'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { ArrowLeft, Upload, X, Plus } from 'lucide-react'
import Link from 'next/link'

type Categoria = { id: string; nome: string }
type Doc = {
  id: string; titulo: string; descricao: string | null; tipo: 'arquivo' | 'link' | 'texto'
  conteudo: string | null; arquivo_url: string | null; arquivo_nome: string | null
  arquivo_tamanho_kb: number | null; link_url: string | null; tags: string[]
  publicado: boolean; categoria: { id: string } | null
}

export default function EditarDocumentoPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { usuario } = useAuth()
  const qc = useQueryClient()

  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [tipo, setTipo] = useState<'arquivo' | 'link' | 'texto'>('texto')
  const [categoriaId, setCategoriaId] = useState('')
  const [conteudo, setConteudo] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [publicado, setPublicado] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [arquivoNome, setArquivoNome] = useState('')
  const [arquivoUrl, setArquivoUrl] = useState('')
  const [arquivoTamanhoKb, setArquivoTamanhoKb] = useState(0)
  const [initialized, setInitialized] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const isGestor = usuario?.perfil === 'admin' || usuario?.perfil === 'gerente'

  const { data: categorias = [] } = useQuery<Categoria[]>({
    queryKey: ['biblioteca-categorias', usuario?.empresa_id],
    enabled: !!usuario?.empresa_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('base_conhecimento_categorias')
        .select('id, nome')
        .eq('empresa_id', usuario!.empresa_id)
        .order('ordem', { ascending: true })
      return data ?? []
    },
  })

  const { data: doc } = useQuery<Doc>({
    queryKey: ['biblioteca-doc', id],
    enabled: !!usuario?.empresa_id && !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('base_conhecimento_docs')
        .select(`
          id, titulo, descricao, tipo, conteudo, arquivo_url, arquivo_nome,
          arquivo_tamanho_kb, link_url, tags, publicado,
          categoria:base_conhecimento_categorias(id)
        `)
        .eq('id', id)
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .single()
      if (error) throw error
      return data as unknown as Doc
    },
  })

  useEffect(() => {
    if (doc && !initialized) {
      setTitulo(doc.titulo)
      setDescricao(doc.descricao ?? '')
      setTipo(doc.tipo)
      setCategoriaId(doc.categoria?.id ?? '')
      setConteudo(doc.conteudo ?? '')
      setLinkUrl(doc.link_url ?? '')
      setTags(doc.tags ?? [])
      setPublicado(doc.publicado)
      setArquivoNome(doc.arquivo_nome ?? '')
      setArquivoUrl(doc.arquivo_url ?? '')
      setArquivoTamanhoKb(doc.arquivo_tamanho_kb ?? 0)
      setInitialized(true)
    }
  }, [doc, initialized])

  async function handleUpload(file: File) {
    if (!usuario) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${usuario.empresa_id}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('base-conhecimento').upload(path, file)
    setUploading(false)
    if (error) { alert('Erro ao enviar arquivo: ' + error.message); return }
    setArquivoUrl(path)
    setArquivoNome(file.name)
    setArquivoTamanhoKb(Math.round(file.size / 1024))
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase()
    if (t && !tags.includes(t)) setTags(prev => [...prev, t])
    setTagInput('')
  }

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('base_conhecimento_docs')
        .update({
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
          categoria_id: categoriaId || null,
          conteudo: tipo === 'texto' ? conteudo : null,
          arquivo_url: tipo === 'arquivo' ? arquivoUrl : null,
          arquivo_nome: tipo === 'arquivo' ? arquivoNome : null,
          arquivo_tamanho_kb: tipo === 'arquivo' ? arquivoTamanhoKb : null,
          link_url: tipo === 'link' ? linkUrl : null,
          tags,
          publicado,
          publicado_por: publicado ? usuario!.id : null,
        })
        .eq('id', id)
        .eq('empresa_id', usuario!.empresa_id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biblioteca-doc', id] })
      qc.invalidateQueries({ queryKey: ['biblioteca-docs'] })
      router.push(`/base-conhecimento/${id}`)
    },
  })

  if (!isGestor) {
    return <div className="p-6 text-center text-gray-400 pt-20 text-sm">Sem permissão.</div>
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <Link href={`/base-conhecimento/${id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <h1 className="text-xl font-semibold text-gray-900">Editar documento</h1>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Título *</label>
          <input value={titulo} onChange={e => setTitulo(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#253B29]/20" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Descrição</label>
          <input value={descricao} onChange={e => setDescricao(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#253B29]/20" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Categoria</label>
            <select value={categoriaId} onChange={e => setCategoriaId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#253B29]/20 bg-white">
              <option value="">Sem categoria</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={publicado} onChange={e => setPublicado(e.target.checked)}
                className="w-4 h-4 rounded accent-[#253B29]" />
              <span className="text-sm text-gray-700">Publicado</span>
            </label>
          </div>
        </div>

        {tipo === 'texto' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Conteúdo</label>
            <textarea value={conteudo} onChange={e => setConteudo(e.target.value)} rows={12}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#253B29]/20 resize-y" />
          </div>
        )}

        {tipo === 'link' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">URL</label>
            <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} type="url"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#253B29]/20" />
          </div>
        )}

        {tipo === 'arquivo' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Arquivo</label>
            {arquivoNome ? (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                <span className="flex-1 truncate">{arquivoNome}</span>
                <button onClick={() => fileRef.current?.click()} className="text-xs underline">Substituir</button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="w-full flex flex-col items-center gap-2 p-6 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-[#253B29]/30 transition-colors">
                <Upload className="h-5 w-5" />
                {uploading ? 'Enviando...' : 'Clique para selecionar'}
              </button>
            )}
            <input ref={fileRef} type="file" className="hidden"
              onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Tags</label>
          <div className="flex gap-2">
            <input value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#253B29]/20"
              placeholder="Pressione Enter para adicionar" />
            <button onClick={addTag}
              className="flex items-center gap-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {tags.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-2">
              {tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                  {tag}
                  <button onClick={() => setTags(prev => prev.filter(t => t !== tag))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Link href={`/base-conhecimento/${id}`}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          Cancelar
        </Link>
        <button onClick={() => salvar.mutate()} disabled={salvar.isPending || !titulo || uploading}
          className="px-5 py-2 bg-[#253B29] text-white rounded-lg text-sm font-medium hover:bg-[#1e3023] disabled:opacity-50 transition-colors">
          {salvar.isPending ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>

      {salvar.isError && <p className="text-sm text-red-500 text-center">Erro ao salvar. Tente novamente.</p>}
    </div>
  )
}
