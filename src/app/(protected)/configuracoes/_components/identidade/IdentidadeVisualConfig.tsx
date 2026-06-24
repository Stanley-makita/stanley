'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { Upload, ImageIcon, RotateCcw, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePersonalizacao } from '@/hooks/configuracoes/usePersonalizacao'
import { useUploadLogo } from '@/hooks/configuracoes/useUploadLogo'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { toast } from 'sonner'

export function IdentidadeVisualConfig() {
  const { data: empresa } = usePersonalizacao()
  const upload = useUploadLogo()
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: usuario } = useUsuarioAtual()
  const qc = useQueryClient()
  const supabase = createClient()

  // cacheBust força o <Image> a recarregar após upload (mesma URL no Storage)
  const [cacheBust, setCacheBust] = useState<number | null>(null)
  const [sucessoMsg, setSucessoMsg] = useState<string | null>(null)

  const remover = useMutation({
    mutationFn: async () => {
      if (!usuario?.empresa_id) throw new Error('Empresa não identificada')
      if (empresa?.logo_path) {
        await supabase.storage.from('empresa-assets').remove([empresa.logo_path])
      }
      const { error } = await supabase
        .from('empresas')
        .update({ logo_url: null, logo_path: null })
        .eq('id', usuario.empresa_id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa-personalizacao', usuario?.empresa_id] })
      setSucessoMsg('Logo removida — exibindo padrão Fonti.')
      setCacheBust(Date.now())
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao remover logo'),
  })

  function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo 2 MB.')
      return
    }
    setSucessoMsg(null)
    upload.mutate(file, {
      onSuccess: () => {
        setSucessoMsg('Logo atualizada! O sidebar e a tela de login já exibem a nova logo.')
        setCacheBust(Date.now())
      },
    })
    e.target.value = ''
  }

  const logoBase = empresa?.logo_url ?? '/logo-fonti-horizontal.png'
  const logoAtual = cacheBust && empresa?.logo_url
    ? `${empresa.logo_url}?t=${cacheBust}`
    : logoBase
  const temLogoCustom = Boolean(empresa?.logo_url)

  return (
    <div className="space-y-6">
      {/* Preview */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Logo atual</p>
        <div className="inline-flex items-center justify-center rounded-2xl bg-[#031E13] p-4 shadow-md">
          <Image
            key={logoAtual}
            src={logoAtual}
            alt="Logo da empresa"
            width={220}
            height={72}
            className="rounded-xl object-contain"
            unoptimized={Boolean(empresa?.logo_url)}
          />
        </div>
        <p className="mt-2 text-xs text-gray-400">
          {temLogoCustom ? 'Logo personalizada da sua empresa' : 'Logo padrão Fonti (nenhuma logo própria cadastrada)'}
        </p>
      </div>

      {/* Feedback de sucesso */}
      {sucessoMsg && (
        <div className="flex items-start gap-2.5 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
          <p className="text-sm text-green-800">{sucessoMsg}</p>
        </div>
      )}

      {/* Onde aparece */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-1.5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Onde a logo aparece</p>
        {[
          { local: 'Menu lateral (sidebar)', obs: 'Expandido e recolhido' },
          { local: 'Tela de login', obs: 'Card de acesso ao sistema' },
          { local: 'Favicon (lapela do browser)', obs: 'Ícone fixo — não personalizável dinamicamente' },
        ].map(({ local, obs }) => (
          <div key={local} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-fonti-primary shrink-0" />
            <span className="text-gray-700 font-medium">{local}</span>
            <span className="text-gray-400 text-xs mt-0.5">— {obs}</span>
          </div>
        ))}
        <p className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-200">
          Documentos gerados (simulações, PDFs) mantêm a identidade visual própria configurada em cada template.
        </p>
      </div>

      {/* Ações */}
      <div className="flex flex-wrap gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={handleArquivo}
        />
        <Button
          onClick={() => { setSucessoMsg(null); inputRef.current?.click() }}
          disabled={upload.isPending}
          className="gap-2 bg-fonti-primary hover:bg-fonti-primary-hover text-white"
        >
          <Upload className="h-4 w-4" />
          {upload.isPending ? 'Enviando…' : temLogoCustom ? 'Substituir logo' : 'Enviar logo'}
        </Button>

        {temLogoCustom && (
          <Button
            variant="outline"
            disabled={remover.isPending}
            onClick={() => remover.mutate()}
            className="gap-2 text-gray-600"
          >
            <RotateCcw className="h-4 w-4" />
            {remover.isPending ? 'Removendo…' : 'Voltar ao padrão Fonti'}
          </Button>
        )}
      </div>

      <div className="text-xs text-gray-400 space-y-1">
        <div className="flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5" />
          <span>Formatos aceitos: PNG, JPG, WebP, SVG — máximo 2 MB</span>
        </div>
        <p>Recomendado: logo horizontal com fundo claro ou transparente, proporção ~3:1</p>
      </div>
    </div>
  )
}
