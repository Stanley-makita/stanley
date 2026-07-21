'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { ArrowLeft, Upload, X, Plus } from 'lucide-react'
import Link from 'next/link'

type Categoria = { id: string; nome: string; cor: string }

export default function NovoDocumentoPage() {
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
  const fileRef = useRef<HTMLInputElement>(null)

  const isGestor = usuario?.perfil === 'admin' || usuario?.perfil === 'gerente' || usuario?.perfil === 'gestor'

  const { data: categorias = [] } = useQuery<Categoria[]>({
    queryKey: ['biblioteca-categorias', usuario?.empresa_id],
    enabled: !!usuario?.empresa_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('base_conhecimento_categorias')
        .select('id, nome, cor')
        .eq('empresa_id', usuario!.empresa_id)
        .order('ordem', { ascending: true })
      return data ?? []
    },
  })

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

  const criar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('base_conhecimento_docs')
        .insert({
          empresa_id: usuario!.empresa_id,
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
          tipo,
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
        .select('id')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['biblioteca-docs'] })
      router.push(`/base-conhecimento/${data.id}`)
    },
  })

  if (!isGestor) {
    return (
      <div className="p-6 text-center text-gray-400 pt-20">
        <p className="text-sm">Sem permissão para criar documentos.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <Link href="/base-conhecimento" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Biblioteca
      </Link>

      <h1 className="text-xl font-semibold text-gray-900">Novo documento</h1>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Título *</label>
          <input
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fonti-primary/20"
            placeholder="Ex: Manual de Processo de Financiamento"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Descrição</label>
          <input
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fonti-primary/20"
            placeholder="Resumo breve do conteúdo"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tipo *</label>
            <select
              value={tipo}
              onChange={e => setTipo(e.target.value as 'arquivo' | 'link' | 'texto')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fonti-primary/20 bg-white"
            >
              <option value="texto">Texto</option>
              <option value="arquivo">Arquivo</option>
              <option value="link">Link externo</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Categoria</label>
            <select
              value={categoriaId}
              onChange={e => setCategoriaId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fonti-primary/20 bg-white"
            >
              <option value="">Sem categoria</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
        </div>

        {tipo === 'texto' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Conteúdo</label>
            <textarea
              value={conteudo}
              onChange={e => setConteudo(e.target.value)}
              rows={10}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-fonti-primary/20 resize-y"
              placeholder="Escreva o conteúdo aqui..."
            />
          </div>
        )}

        {tipo === 'link' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">URL *</label>
            <input
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              type="url"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fonti-primary/20"
              placeholder="https://..."
            />
          </div>
        )}

        {tipo === 'arquivo' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Arquivo *</label>
            {arquivoNome ? (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                <span className="flex-1 truncate">{arquivoNome}</span>
                <button onClick={() => { setArquivoNome(''); setArquivoUrl('') }}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full flex flex-col items-center gap-2 p-6 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-fonti-primary/30 hover:text-fonti-primary transition-colors"
              >
                <Upload className="h-5 w-5" />
                {uploading ? 'Enviando...' : 'Clique para selecionar o arquivo'}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Tags</label>
          <div className="flex gap-2">
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fonti-primary/20"
              placeholder="Digite e pressione Enter"
            />
            <button
              onClick={addTag}
              className="flex items-center gap-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
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

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={publicado}
            onChange={e => setPublicado(e.target.checked)}
            className="w-4 h-4 rounded accent-fonti-primary"
          />
          <span className="text-sm text-gray-700">Publicar imediatamente</span>
        </label>
      </div>

      <div className="flex justify-end gap-3">
        <Link
          href="/base-conhecimento"
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </Link>
        <button
          onClick={() => criar.mutate()}
          disabled={criar.isPending || !titulo || uploading}
          className="px-5 py-2 bg-fonti-primary text-white rounded-lg text-sm font-medium hover:bg-fonti-primary-hover disabled:opacity-50 transition-colors"
        >
          {criar.isPending ? 'Salvando...' : 'Salvar documento'}
        </button>
      </div>

      {criar.isError && (
        <p className="text-sm text-red-500 text-center">Erro ao salvar. Verifique os campos e tente novamente.</p>
      )}
    </div>
  )
}
