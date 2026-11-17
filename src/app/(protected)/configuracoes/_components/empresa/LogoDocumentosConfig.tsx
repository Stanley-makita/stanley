'use client'

import { useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { Button } from '@/components/ui/button'
import { RotateCcw, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { LOGO_RECIBO } from '@/lib/financeiro/logoRecibo'

// Logo impressa nos documentos (recibo). Separada da logo do sistema (Logo & Marca), que é a
// marca Fonti do sidebar/login. Sem logo própria, vale a oficial embutida (LOGO_RECIBO).

const BUCKET = 'empresa-assets'

interface LogoDoc { url: string | null; path: string | null }

export function LogoDocumentosConfig() {
  const supabase = createClient()
  const qc = useQueryClient()
  const { data: usuario } = useUsuarioAtual()
  const empresaId = usuario?.empresa_id
  const input = useRef<HTMLInputElement>(null)
  const chave = ['empresa-logo-documentos', empresaId]

  const { data: atual } = useQuery({
    queryKey: chave,
    enabled: !!empresaId,
    queryFn: async (): Promise<LogoDoc> => {
      const { data, error } = await supabase
        .from('empresas').select('logo_documentos_url, logo_documentos_path').eq('id', empresaId!).single()
      if (error) throw error
      return { url: data.logo_documentos_url, path: data.logo_documentos_path }
    },
  })

  // UPDATE barrado pela RLS (só admin) não dá erro — confere a linha afetada.
  async function gravar(url: string | null, path: string | null) {
    const { data, error } = await supabase
      .from('empresas').update({ logo_documentos_url: url, logo_documentos_path: path }).eq('id', empresaId!).select('id')
    if (error) throw error
    if (!data?.length) throw new Error('Só o administrador pode alterar a logo dos documentos.')
  }

  const trocar = useMutation({
    mutationFn: async (arquivo: File) => {
      if (!empresaId) throw new Error('Empresa não identificada')
      if (!/^image\/(png|jpeg)$/.test(arquivo.type)) throw new Error('Use uma imagem PNG ou JPG.')
      const ext = arquivo.type === 'image/png' ? 'png' : 'jpg'
      // Mesma pasta da logo do sistema (logos/<empresa>/), que a policy do bucket já aceita.
      const path = `logos/${empresaId}/documentos-${Date.now()}.${ext}`
      const { error: up } = await supabase.storage.from(BUCKET).upload(path, arquivo, { upsert: false, contentType: arquivo.type })
      if (up) throw up
      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)
      await gravar(publicUrl, path)
      if (atual?.path) await supabase.storage.from(BUCKET).remove([atual.path])
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: chave }); toast.success('Logo dos documentos atualizada.') },
    onError: (err: Error) => toast.error(err.message ?? 'Erro ao enviar a logo.'),
  })

  const restaurar = useMutation({
    mutationFn: async () => {
      await gravar(null, null)
      if (atual?.path) await supabase.storage.from(BUCKET).remove([atual.path])
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: chave }); toast.success('Voltou para a logo oficial.') },
    onError: (err: Error) => toast.error(err.message ?? 'Erro ao restaurar a logo.'),
  })

  const propria = !!atual?.url
  const ocupado = trocar.isPending || restaurar.isPending

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-fonti-primary">Logo nos documentos</h3>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-24 w-full max-w-xs items-center justify-center rounded-lg border bg-white p-2">
          <img src={atual?.url ?? LOGO_RECIBO} alt="Logo dos documentos" className="max-h-full max-w-full object-contain" />
        </div>
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            {propria ? 'Logo enviada por você.' : 'Logo oficial da Fontinhas Assessoria.'} Aparece no cabeçalho do recibo.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) trocar.mutate(f); e.target.value = '' }}
            />
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => input.current?.click()} disabled={ocupado}>
              <Upload className="h-4 w-4" />
              {trocar.isPending ? 'Enviando…' : 'Trocar logo'}
            </Button>
            {propria && (
              <Button size="sm" variant="ghost" className="gap-1.5 text-gray-500" onClick={() => restaurar.mutate()} disabled={ocupado}>
                <RotateCcw className="h-4 w-4" />
                Voltar para a oficial
              </Button>
            )}
          </div>
          <p className="text-xs text-gray-400">PNG ou JPG, horizontal (~3:1). Evite logo com letras brancas sem fundo — some no papel.</p>
        </div>
      </div>
    </section>
  )
}
