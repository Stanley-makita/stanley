'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import {
  ArrowLeft, FileText, Link2, AlignLeft, Download,
  ExternalLink, Eye, EyeOff, Pencil, Trash2, Tag, Calendar,
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type Doc = {
  id: string
  titulo: string
  descricao: string | null
  tipo: 'arquivo' | 'link' | 'texto'
  conteudo: string | null
  arquivo_url: string | null
  arquivo_nome: string | null
  arquivo_tamanho_kb: number | null
  link_url: string | null
  tags: string[]
  publicado: boolean
  publicado_por: string | null
  created_at: string
  updated_at: string
  categoria: { id: string; nome: string; icone: string; cor: string } | null
  publicado_por_usuario: { nome: string } | null
}

export default function BibliotecaDocPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { usuario } = useAuth()
  const qc = useQueryClient()

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)

  const isGestor = usuario?.perfil === 'admin' || usuario?.perfil === 'gerente' || usuario?.perfil === 'gestor'

  const { data: doc, isLoading, error } = useQuery<Doc>({
    queryKey: ['biblioteca-doc', id],
    enabled: !!usuario?.empresa_id && !!id,
    queryFn: async () => {
      const q = supabase
        .from('base_conhecimento_docs')
        .select(`
          id, titulo, descricao, tipo, conteudo,
          arquivo_url, arquivo_nome, arquivo_tamanho_kb,
          link_url, tags, publicado, publicado_por, created_at, updated_at,
          categoria:base_conhecimento_categorias(id, nome, icone, cor),
          publicado_por_usuario:usuarios!publicado_por(nome)
        `)
        .eq('id', id)
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .single()

      const { data, error } = await q
      if (error) throw error
      if (!isGestor && !data.publicado) throw new Error('Não encontrado')

      // Gera URL assinada se for arquivo
      if (data.tipo === 'arquivo' && data.arquivo_url) {
        const { data: signed } = await supabase.storage
          .from('base-conhecimento')
          .createSignedUrl(data.arquivo_url, 3600)
        setSignedUrl(signed?.signedUrl ?? null)
      }

      return data as unknown as Doc
    },
  })

  const togglePublicado = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('base_conhecimento_docs')
        .update({
          publicado: !doc?.publicado,
          publicado_por: !doc?.publicado ? usuario?.id : null,
        })
        .eq('id', id)
        .eq('empresa_id', usuario!.empresa_id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['biblioteca-doc', id] }),
  })

  const excluir = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('base_conhecimento_docs')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('empresa_id', usuario!.empresa_id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biblioteca-docs'] })
      router.push('/base-conhecimento')
    },
  })

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-gray-100 animate-pulse rounded" />
        <div className="h-64 bg-gray-100 animate-pulse rounded-xl" />
      </div>
    )
  }

  if (error || !doc) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center text-gray-400 pt-20">
        <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Documento não encontrado</p>
        <Link href="/base-conhecimento" className="text-sm text-fonti-primary mt-2 inline-block">
          Voltar à Biblioteca
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Back */}
      <Link href="/base-conhecimento" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Biblioteca
      </Link>

      {/* Header card */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            {doc.categoria && (
              <span
                className="inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-1"
                style={{ backgroundColor: `${doc.categoria.cor}22`, color: doc.categoria.cor }}
              >
                {doc.categoria.nome}
              </span>
            )}
            <h1 className="text-xl font-semibold text-gray-900">{doc.titulo}</h1>
            {doc.descricao && <p className="text-sm text-gray-500">{doc.descricao}</p>}
          </div>

          {isGestor && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => togglePublicado.mutate()}
                disabled={togglePublicado.isPending}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  doc.publicado
                    ? 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100'
                    : 'border-gray-200 text-gray-500 bg-white hover:bg-gray-50'
                }`}
              >
                {doc.publicado ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {doc.publicado ? 'Publicado' : 'Rascunho'}
              </button>
              <Link
                href={`/base-conhecimento/${id}/editar`}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </Link>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-red-600">Confirmar?</span>
                  <button
                    onClick={() => excluir.mutate()}
                    disabled={excluir.isPending}
                    className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Sim
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
                  >
                    Não
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            Atualizado em {format(new Date(doc.updated_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </span>
          {doc.publicado_por_usuario && (
            <span>Publicado por {doc.publicado_por_usuario.nome}</span>
          )}
          <span className="flex items-center gap-1">
            {doc.tipo === 'arquivo' ? (
              <><FileText className="h-3.5 w-3.5" /> Arquivo{doc.arquivo_tamanho_kb ? ` · ${doc.arquivo_tamanho_kb < 1024 ? `${doc.arquivo_tamanho_kb} KB` : `${(doc.arquivo_tamanho_kb / 1024).toFixed(1)} MB`}` : ''}</>
            ) : doc.tipo === 'link' ? (
              <><Link2 className="h-3.5 w-3.5" /> Link externo</>
            ) : (
              <><AlignLeft className="h-3.5 w-3.5" /> Texto</>
            )}
          </span>
        </div>

        {/* Tags */}
        {doc.tags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {doc.tags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">
                <Tag className="h-2.5 w-2.5" />
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      {doc.tipo === 'texto' && doc.conteudo && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 leading-relaxed">{doc.conteudo}</pre>
        </div>
      )}

      {doc.tipo === 'arquivo' && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          {signedUrl ? (
            <>
              {doc.arquivo_nome?.match(/\.(pdf)$/i) && (
                <iframe
                  src={signedUrl}
                  className="w-full h-[600px] rounded-lg border border-gray-200"
                  title={doc.arquivo_nome ?? 'Arquivo'}
                />
              )}
              <a
                href={signedUrl}
                download={doc.arquivo_nome ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-fonti-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-fonti-primary-hover transition-colors"
              >
                <Download className="h-4 w-4" />
                {doc.arquivo_nome ? `Baixar ${doc.arquivo_nome}` : 'Baixar arquivo'}
              </a>
            </>
          ) : (
            <p className="text-sm text-gray-400">Arquivo indisponível.</p>
          )}
        </div>
      )}

      {doc.tipo === 'link' && doc.link_url && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col items-center gap-4 text-center">
          <ExternalLink className="h-8 w-8 text-gray-300" />
          <div>
            <p className="text-sm text-gray-600 mb-1">Este documento é um link externo.</p>
            <p className="text-xs text-gray-400 break-all">{doc.link_url}</p>
          </div>
          <a
            href={doc.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-fonti-primary text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-fonti-primary-hover transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Abrir link
          </a>
        </div>
      )}
    </div>
  )
}
