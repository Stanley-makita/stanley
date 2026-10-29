'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { LogoDocumentosConfig } from './LogoDocumentosConfig'

// Dados cadastrais da empresa — usados no recibo do Financeiro (e em qualquer documento
// futuro que precise de razão social/CNPJ/endereço). A logo dos documentos fica aqui; a do
// sistema (sidebar/login) continua em Logo & Marca.

const CAMPOS = [
  'nome', 'razao_social', 'cnpj', 'telefone', 'email', 'site',
  'endereco_rua', 'endereco_numero', 'endereco_complemento', 'endereco_bairro',
  'endereco_cidade', 'endereco_uf', 'endereco_cep',
] as const

type Campo = typeof CAMPOS[number]
type Form = Record<Campo, string>

const VAZIO = Object.fromEntries(CAMPOS.map((c) => [c, ''])) as Form

function useDadosEmpresa(empresaId: string | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['empresa-dados', empresaId],
    enabled: !!empresaId,
    queryFn: async (): Promise<Form> => {
      const { data, error } = await supabase
        .from('empresas')
        .select(CAMPOS.join(', '))
        .eq('id', empresaId!)
        .single()
      if (error) throw error
      const row = data as unknown as Record<Campo, string | null>
      return Object.fromEntries(CAMPOS.map((c) => [c, row[c] ?? ''])) as Form
    },
  })
}

export function DadosEmpresaConfig() {
  const supabase = createClient()
  const qc = useQueryClient()
  const { data: usuario } = useUsuarioAtual()
  const empresaId = usuario?.empresa_id
  const { data: salvo, isLoading } = useDadosEmpresa(empresaId)
  const [form, setForm] = useState<Form>(VAZIO)

  // Reseta só quando a empresa carrega/troca — refetch em segundo plano não apaga edição.
  useEffect(() => {
    if (salvo) setForm(salvo)
  }, [empresaId, !!salvo])

  const salvar = useMutation({
    mutationFn: async () => {
      if (!empresaId) throw new Error('Empresa não identificada')
      if (!form.nome.trim()) throw new Error('Informe o nome fantasia')
      const update = Object.fromEntries(CAMPOS.map((c) => [c, form[c].trim() || null]))
      update.nome = form.nome.trim()
      update.endereco_uf = form.endereco_uf.trim().toUpperCase() || null
      // UPDATE barrado pela RLS (só admin) não dá erro — confere a linha afetada.
      const { data, error } = await supabase.from('empresas').update(update).eq('id', empresaId).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('Só o administrador pode alterar os dados da empresa.')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa-dados', empresaId] })
      qc.invalidateQueries({ queryKey: ['empresa-personalizacao'] })
      toast.success('Dados da empresa salvos.')
    },
    onError: (err: Error) => toast.error(err.message ?? 'Erro ao salvar.'),
  })

  const mudou = !!salvo && CAMPOS.some((c) => form[c] !== salvo[c])
  const set = (c: Campo) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [c]: e.target.value }))

  const campo = (c: Campo, label: string, placeholder = '', className = '') => (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      <Input value={form[c]} onChange={set(c)} placeholder={placeholder} disabled={isLoading} />
    </div>
  )

  return (
    <div className="max-w-3xl space-y-6">
      <LogoDocumentosConfig />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-fonti-primary">Identificação</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {campo('nome', 'Nome fantasia *', 'Fontinhas Assessoria')}
          {campo('razao_social', 'Razão social', 'Nome registrado no CNPJ')}
          {campo('cnpj', 'CNPJ', '00.000.000/0000-00')}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-fonti-primary">Contato</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {campo('telefone', 'Telefone', '(44) 0000-0000')}
          {campo('email', 'E-mail', 'contato@empresa.com.br')}
          {campo('site', 'Site', 'www.empresa.com.br')}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-fonti-primary">Endereço</h3>
        <div className="grid gap-3 sm:grid-cols-6">
          {campo('endereco_rua', 'Rua', '', 'sm:col-span-4')}
          {campo('endereco_numero', 'Número', '', 'sm:col-span-2')}
          {campo('endereco_complemento', 'Complemento', 'Sala, andar...', 'sm:col-span-3')}
          {campo('endereco_bairro', 'Bairro', '', 'sm:col-span-3')}
          {campo('endereco_cidade', 'Cidade', '', 'sm:col-span-3')}
          {campo('endereco_uf', 'UF', 'PR', 'sm:col-span-1')}
          {campo('endereco_cep', 'CEP', '00000-000', 'sm:col-span-2')}
        </div>
      </section>

      <p className="text-xs text-gray-400">Esses dados aparecem no cabeçalho e na assinatura dos recibos do Financeiro.</p>

      <Button
        className="gap-1.5 bg-fonti-primary text-white hover:bg-fonti-primary-hover"
        onClick={() => salvar.mutate()}
        disabled={!mudou || salvar.isPending}
      >
        <Save className="h-4 w-4" />
        {salvar.isPending ? 'Salvando...' : 'Salvar'}
      </Button>
    </div>
  )
}
