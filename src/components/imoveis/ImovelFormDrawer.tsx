'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { useRegistrosImoveis } from '@/hooks/configuracoes/useRegistrosImoveis'
import { useCriarImovel, useAtualizarImovel } from '@/hooks/imoveis/useImoveis'
import type { Imovel } from '@/types/imoveis'
import { toast } from 'sonner'

const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

const schema = z.object({
  origem: z.enum(['individual', 'empreendimento']),
  categoria: z.enum(['residencial', 'comercial', 'industrial', 'rural']),
  tipo: z.enum(['apartamento', 'casa', 'sobrado', 'terreno', 'barracao']).nullable(),
  condicao: z.enum(['novo', 'usado']).nullable(),
  matricula: z.string().nullable(),
  cadastro_imobiliario: z.string().nullable(),
  registro_imoveis_id: z.string().nullable(),
  area_construida: z.number().nullable(),
  area_terreno: z.number().nullable(),
  zona: z.string().nullable(),
  rua: z.string().nullable(),
  numero: z.string().nullable(),
  quadra: z.string().nullable(),
  lote: z.string().nullable(),
  bloco: z.string().nullable(),
  apto_unidade: z.string().nullable(),
  bairro: z.string().nullable(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  garagem: z.boolean(),
  observacoes: z.string().nullable(),
})

type FormData = z.infer<typeof schema>

const VAZIO: FormData = {
  origem: 'individual', categoria: 'residencial', tipo: null, condicao: null,
  matricula: null, cadastro_imobiliario: null, registro_imoveis_id: null,
  area_construida: null, area_terreno: null, zona: null,
  rua: null, numero: null, quadra: null, lote: null, bloco: null, apto_unidade: null,
  bairro: null, cidade: null, uf: null, garagem: false, observacoes: null,
}

function numInput(v: number | null): string {
  return v == null ? '' : String(v)
}

function parseNum(s: string): number | null {
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) ? null : n
}

interface Props {
  aberto: boolean
  onFechar: () => void
  imovel?: Imovel
}

export function ImovelFormDrawer({ aberto, onFechar, imovel }: Props) {
  const { data: registros = [] } = useRegistrosImoveis()
  const criar = useCriarImovel()
  const atualizar = useAtualizarImovel()
  const isPending = criar.isPending || atualizar.isPending

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: imovel ? {
      origem: imovel.origem,
      categoria: imovel.categoria,
      tipo: imovel.tipo,
      condicao: imovel.condicao,
      matricula: imovel.matricula,
      cadastro_imobiliario: imovel.cadastro_imobiliario,
      registro_imoveis_id: imovel.registro_imoveis_id,
      area_construida: imovel.area_construida,
      area_terreno: imovel.area_terreno,
      zona: imovel.zona,
      rua: imovel.rua,
      numero: imovel.numero,
      quadra: imovel.quadra,
      lote: imovel.lote,
      bloco: imovel.bloco,
      apto_unidade: imovel.apto_unidade,
      bairro: imovel.bairro,
      cidade: imovel.cidade,
      uf: imovel.uf,
      garagem: imovel.garagem,
      observacoes: imovel.observacoes,
    } : VAZIO,
  })

  useEffect(() => {
    if (aberto) form.reset(imovel ? {
      origem: imovel.origem,
      categoria: imovel.categoria,
      tipo: imovel.tipo,
      condicao: imovel.condicao,
      matricula: imovel.matricula,
      cadastro_imobiliario: imovel.cadastro_imobiliario,
      registro_imoveis_id: imovel.registro_imoveis_id,
      area_construida: imovel.area_construida,
      area_terreno: imovel.area_terreno,
      zona: imovel.zona,
      rua: imovel.rua,
      numero: imovel.numero,
      quadra: imovel.quadra,
      lote: imovel.lote,
      bloco: imovel.bloco,
      apto_unidade: imovel.apto_unidade,
      bairro: imovel.bairro,
      cidade: imovel.cidade,
      uf: imovel.uf,
      garagem: imovel.garagem,
      observacoes: imovel.observacoes,
    } : VAZIO)
  }, [aberto, imovel])

  async function onSubmit(dados: FormData) {
    try {
      if (imovel) {
        await atualizar.mutateAsync({ id: imovel.id, ...dados })
        toast.success('Imóvel atualizado com sucesso.')
      } else {
        await criar.mutateAsync(dados as any)
        toast.success('Imóvel cadastrado com sucesso.')
      }
      onFechar()
    } catch {
      toast.error('Erro ao salvar imóvel. Tente novamente.')
    }
  }

  const { register, handleSubmit, setValue, watch } = form
  const garagem = watch('garagem')

  return (
    <Sheet open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle>{imovel ? 'Editar Imóvel' : 'Novo Imóvel'}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto py-4 space-y-6 pr-1">
          {/* Identificação */}
          <section className="space-y-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Identificação</h4>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Origem</Label>
                <Select value={watch('origem')} onValueChange={(v) => setValue('origem', v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="empreendimento">Empreendimento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={watch('categoria')} onValueChange={(v) => setValue('categoria', v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="residencial">Residencial</SelectItem>
                    <SelectItem value="comercial">Comercial</SelectItem>
                    <SelectItem value="industrial">Industrial</SelectItem>
                    <SelectItem value="rural">Rural</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={watch('tipo') ?? ''} onValueChange={(v) => setValue('tipo', v ? v as any : null)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">— Não informado</SelectItem>
                    <SelectItem value="apartamento">Apartamento</SelectItem>
                    <SelectItem value="casa">Casa</SelectItem>
                    <SelectItem value="sobrado">Sobrado</SelectItem>
                    <SelectItem value="terreno">Terreno</SelectItem>
                    <SelectItem value="barracao">Barracão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Condição</Label>
                <Select value={watch('condicao') ?? ''} onValueChange={(v) => setValue('condicao', v ? v as any : null)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">— Não informado</SelectItem>
                    <SelectItem value="novo">Novo</SelectItem>
                    <SelectItem value="usado">Usado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Matrícula</Label>
                <Input placeholder="Ex: 12345" {...register('matricula')} />
              </div>
              <div className="space-y-1.5">
                <Label>Cadastro Imobiliário</Label>
                <Input placeholder="Ex: 001.234.567-0" {...register('cadastro_imobiliario')} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Registro de Imóveis</Label>
              <Select
                value={watch('registro_imoveis_id') ?? ''}
                onValueChange={(v) => setValue('registro_imoveis_id', v || null)}
              >
                <SelectTrigger><SelectValue placeholder="Selecione o cartório..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Não informado</SelectItem>
                  {registros.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.nome}{r.cidade ? ` — ${r.cidade}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch id="garagem" checked={garagem} onCheckedChange={(v) => setValue('garagem', v)} />
              <Label htmlFor="garagem" className="cursor-pointer">Garagem</Label>
            </div>
          </section>

          <Separator />

          {/* Localização */}
          <section className="space-y-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Localização</h4>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Rua / Logradouro</Label>
                <Input placeholder="Ex: Av. Dr. Gastão Vidigal" {...register('rua')} />
              </div>
              <div className="space-y-1.5">
                <Label>Número</Label>
                <Input placeholder="Ex: 938" {...register('numero')} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Quadra</Label>
                <Input {...register('quadra')} />
              </div>
              <div className="space-y-1.5">
                <Label>Lote</Label>
                <Input {...register('lote')} />
              </div>
              <div className="space-y-1.5">
                <Label>Bloco</Label>
                <Input {...register('bloco')} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Apto / Unidade</Label>
                <Input placeholder="Ex: 42" {...register('apto_unidade')} />
              </div>
              <div className="space-y-1.5">
                <Label>Zona</Label>
                <Input placeholder="Ex: Zona 08" {...register('zona')} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Bairro</Label>
                <Input placeholder="Ex: Zona 07" {...register('bairro')} />
              </div>
              <div className="space-y-1.5">
                <Label>UF</Label>
                <Select value={watch('uf') ?? ''} onValueChange={(v) => setValue('uf', v || null)}>
                  <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">—</SelectItem>
                    {UFS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Cidade</Label>
              <Input placeholder="Ex: Maringá" {...register('cidade')} />
            </div>
          </section>

          <Separator />

          {/* Características */}
          <section className="space-y-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Características</h4>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Área construída (m²)</Label>
                <Input
                  type="number"
                  placeholder="Ex: 85"
                  defaultValue={numInput(imovel?.area_construida ?? null)}
                  onChange={(e) => setValue('area_construida', parseNum(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Área terreno (m²)</Label>
                <Input
                  type="number"
                  placeholder="Ex: 200"
                  defaultValue={numInput(imovel?.area_terreno ?? null)}
                  onChange={(e) => setValue('area_terreno', parseNum(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea placeholder="Informações adicionais..." rows={3} className="resize-none" {...register('observacoes')} />
            </div>
          </section>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onFechar} disabled={isPending}>Cancelar</Button>
            <Button type="submit" disabled={isPending} className="bg-[#253B29] hover:bg-[#1a2b1e] text-white">
              {isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
