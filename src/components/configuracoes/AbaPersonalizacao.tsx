'use client'

import { useState, useEffect, useRef } from 'react'
import { usePersonalizacao } from '@/hooks/configuracoes/usePersonalizacao'
import { useSalvarPersonalizacao } from '@/hooks/configuracoes/useSalvarPersonalizacao'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Upload, Loader2 } from 'lucide-react'

export function AbaPersonalizacao() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const { data: empresa, isLoading } = usePersonalizacao()
  const { mutate: salvar, isPending } = useSalvarPersonalizacao()
  const { toast } = useToast()
  const inputLogoRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({ nome: '', email_contato: '', telefone: '', site: '' })
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [uploadandoLogo, setUploadandoLogo] = useState(false)
  const [logoPath, setLogoPath] = useState<string | null>(null)

  useEffect(() => {
    if (empresa) {
      setForm({
        nome:          empresa.nome ?? '',
        email_contato: empresa.email_contato ?? '',
        telefone:      empresa.telefone ?? '',
        site:          empresa.site ?? '',
      })
      setLogoPath(empresa.logo_path ?? null)
      if (empresa.logo_path) {
        const url = supabase.storage.from('logos').getPublicUrl(empresa.logo_path).data.publicUrl
        setLogoPreview(url)
      }
    }
  }, [empresa])

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    if (arquivo.size > 2 * 1024 * 1024) {
      toast({ description: 'Logo deve ter no máximo 2 MB.', variant: 'destructive' })
      return
    }

    setUploadandoLogo(true)
    try {
      const ext = arquivo.name.split('.').pop()
      const path = `${usuario!.empresa_id}/logo.${ext}`
      const { error } = await supabase.storage.from('logos').upload(path, arquivo, { upsert: true })
      if (error) throw error
      const url = supabase.storage.from('logos').getPublicUrl(path).data.publicUrl
      setLogoPreview(url)
      setLogoPath(path)
    } catch {
      toast({ description: 'Erro ao enviar logo.', variant: 'destructive' })
    } finally {
      setUploadandoLogo(false)
      e.target.value = ''
    }
  }

  function handleSalvar() {
    salvar(
      { ...form, logo_path: logoPath ?? undefined },
      {
        onSuccess: () => {
          toast({ description: 'Configurações salvas.' })
        },
      }
    )
  }

  if (isLoading) return <div className="py-8 text-center text-gray-400 text-sm">Carregando...</div>

  return (
    <div className="space-y-6 max-w-lg">
      {/* Logo */}
      <div className="space-y-2">
        <Label>Logo da empresa</Label>
        <div className="flex items-center gap-4">
          <div
            className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center bg-gray-50 overflow-hidden cursor-pointer hover:border-[#253B29] transition-colors"
            onClick={() => inputLogoRef.current?.click()}
          >
            {logoPreview
              ? <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-1" />
              : uploadandoLogo
              ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              : <Upload className="w-5 h-5 text-gray-300" />
            }
          </div>
          <div>
            <Button size="sm" variant="outline" onClick={() => inputLogoRef.current?.click()} disabled={uploadandoLogo}>
              {uploadandoLogo ? 'Enviando...' : 'Trocar logo'}
            </Button>
            <p className="text-xs text-gray-400 mt-1">PNG ou SVG · máx 2 MB</p>
          </div>
        </div>
        <input ref={inputLogoRef} type="file" accept=".png,.jpg,.jpeg,.svg,.webp" className="hidden" onChange={handleLogoChange} />
      </div>

      {/* Dados da empresa */}
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="nome">Nome da empresa</Label>
          <Input id="nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="email">E-mail de contato</Label>
          <Input id="email" type="email" value={form.email_contato} onChange={(e) => setForm({ ...form, email_contato: e.target.value })} placeholder="contato@empresa.com" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="telefone">Telefone</Label>
          <Input id="telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(44) 99999-9999" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="site">Site</Label>
          <Input id="site" value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} placeholder="https://fontinhas.com.br" />
        </div>
      </div>

      <Button onClick={handleSalvar} disabled={isPending} className="bg-[#253B29] hover:bg-[#253B29]/90 text-white">
        {isPending ? 'Salvando...' : 'Salvar configurações'}
      </Button>
    </div>
  )
}