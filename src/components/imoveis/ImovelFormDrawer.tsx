'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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

interface FormState {
  origem: string
  categoria: string
  tipo: string
  condicao: string
  matricula: string
  cadastro_imobiliario: string
  registro_imoveis_id: string
  area_construida: string
  area_terreno: string
  zona: string
  rua: string
  numero: string
  quadra: string
  lote: string
  bloco: string
  apto_unidade: string
  bairro: string
  cidade: string
  uf: string
  garagem: boolean
  observacoes: string
}

const VAZIO: FormState = {
  origem: 'individual',
  categoria: 'residencial',
  tipo: '',
  condicao: '',
  matricula: '',
  cadastro_imobiliario: '',
  registro_imoveis_id: '',
  area_construida: '',
  area_terreno: '',
  zona: '',
  rua: '',
  numero: '',
  quadra: '',
  lote: '',
  bloco: '',
  apto_unidade: '',
  bairro: '',
  cidade: '',
  uf: '',
  garagem: false,
  observacoes: '',
}

function imovelToForm(imovel: Imovel): FormState {
  return {
    origem: imovel.origem ?? 'individual',
    categoria: imovel.categoria ?? 'residencial',
    tipo: imovel.tipo ?? '',
    condicao: imovel.condicao ?? '',
    matricula: imovel.matricula ?? '',
    cadastro_imobiliario: imovel.cadastro_imobiliario ?? '',
    registro_imoveis_id: imovel.registro_imoveis_id ?? '',
    area_construida: imovel.area_construida != null ? String(imovel.area_construida) : '',
    area_terreno: imovel.area_terreno != null ? String(imovel.area_terreno) : '',
    zona: imovel.zona ?? '',
    rua: imovel.rua ?? '',
    numero: imovel.numero ?? '',
    quadra: imovel.quadra ?? '',
    lote: imovel.lote ?? '',
    bloco: imovel.bloco ?? '',
    apto_unidade: imovel.apto_unidade ?? '',
    bairro: imovel.bairro ?? '',
    cidade: imovel.cidade ?? '',
    uf: imovel.uf ?? '',
    garagem: imovel.garagem ?? false,
    observacoes: imovel.observacoes ?? '',
  }
}

function parseNum(s: string): number | null {
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) ? null : n
}

function strOrNull(s: string): string | null {
  return s.trim() ? s.trim() : null
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

  const [form, setForm] = useState<FormState>(imovel ? imovelToForm(imovel) : VAZIO)

  useEffect(() => {
    if (aberto) {
      setForm(imovel ? imovelToForm(imovel) : VAZIO)
    }
  }, [aberto, imovel])

  function set(field: keyof FormState, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const dados = {
      origem: form.origem as Imovel['origem'],
      categoria: form.categoria as Imovel['categoria'],
      tipo: form.tipo ? form.tipo as Imovel['tipo'] : null,
      condicao: form.condicao ? form.condicao as Imovel['condicao'] : null,
      matricula: strOrNull(form.matricula),
      cadastro_imobiliario: strOrNull(form.cadastro_imobiliario),
      registro_imoveis_id: strOrNull(form.registro_imoveis_id),
      area_construida: parseNum(form.area_construida),
      area_terreno: parseNum(form.area_terreno),
      zona: strOrNull(form.zona),
      rua: strOrNull(form.rua),
      numero: strOrNull(form.numero),
      quadra: strOrNull(form.quadra),
      lote: strOrNull(form.lote),
      bloco: strOrNull(form.bloco),
      apto_unidade: strOrNull(form.apto_unidade),
      bairro: strOrNull(form.bairro),
      cidade: strOrNull(form.cidade),
      uf: strOrNull(form.uf),
      garagem: form.garagem,
      observacoes: strOrNull(form.observacoes),
    }

    if (!form.matricula.trim() || !form.cidade.trim()) return

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

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[92svh] w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{imovel ? 'Editar Imóvel' : 'Novo Imóvel'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-2">

          {/* Identificação */}
          <section className="space-y-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Identificação</h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Origem</Label>
                <Select value={form.origem} onValueChange={(v) => set('origem', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="empreendimento">Empreendimento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={form.categoria} onValueChange={(v) => set('categoria', v)}>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.tipo || '__'} onValueChange={(v) => set('tipo', v === '__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__">— Não informado</SelectItem>
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
                <Select value={form.condicao || '__'} onValueChange={(v) => set('condicao', v === '__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__">— Não informado</SelectItem>
                    <SelectItem value="novo">Novo</SelectItem>
                    <SelectItem value="usado">Usado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Matrícula <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="Ex: 12345"
                  value={form.matricula}
                  onChange={(e) => set('matricula', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cadastro Imobiliário</Label>
                <Input
                  placeholder="Ex: 001.234.567-0"
                  value={form.cadastro_imobiliario}
                  onChange={(e) => set('cadastro_imobiliario', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Registro de Imóveis</Label>
              <Select value={form.registro_imoveis_id || '__'} onValueChange={(v) => set('registro_imoveis_id', v === '__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o cartório..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__">— Não informado</SelectItem>
                  {registros.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nome}{r.cidade ? ` — ${r.cidade}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="garagem"
                checked={form.garagem}
                onCheckedChange={(v) => set('garagem', v)}
              />
              <Label htmlFor="garagem" className="cursor-pointer">Garagem</Label>
            </div>
          </section>

          <Separator />

          {/* Localização */}
          <section className="space-y-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Localização</h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Rua / Logradouro</Label>
                <Input
                  placeholder="Ex: Av. Dr. Gastão Vidigal"
                  value={form.rua}
                  onChange={(e) => set('rua', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Número</Label>
                <Input
                  placeholder="Ex: 938"
                  value={form.numero}
                  onChange={(e) => set('numero', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Quadra</Label>
                <Input value={form.quadra} onChange={(e) => set('quadra', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Lote</Label>
                <Input value={form.lote} onChange={(e) => set('lote', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Bloco</Label>
                <Input value={form.bloco} onChange={(e) => set('bloco', e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Apto / Unidade</Label>
                <Input
                  placeholder="Ex: 42"
                  value={form.apto_unidade}
                  onChange={(e) => set('apto_unidade', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Zona</Label>
                <Input
                  placeholder="Ex: Zona 08"
                  value={form.zona}
                  onChange={(e) => set('zona', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Bairro</Label>
                <Input
                  placeholder="Ex: Zona 07"
                  value={form.bairro}
                  onChange={(e) => set('bairro', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>UF</Label>
                <Select value={form.uf || '__'} onValueChange={(v) => set('uf', v === '__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__">—</SelectItem>
                    {UFS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Cidade <span className="text-red-500">*</span></Label>
              <Input
                placeholder="Ex: Maringá"
                value={form.cidade}
                onChange={(e) => set('cidade', e.target.value)}
                required
              />
            </div>
          </section>

          <Separator />

          {/* Características */}
          <section className="space-y-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Características</h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Área construída (m²)</Label>
                <Input
                  type="number"
                  placeholder="Ex: 85"
                  value={form.area_construida}
                  onChange={(e) => set('area_construida', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Área terreno (m²)</Label>
                <Input
                  type="number"
                  placeholder="Ex: 200"
                  value={form.area_terreno}
                  onChange={(e) => set('area_terreno', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                placeholder="Informações adicionais..."
                rows={3}
                className="resize-none"
                value={form.observacoes}
                onChange={(e) => set('observacoes', e.target.value)}
              />
            </div>
          </section>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onFechar} disabled={isPending}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!form.matricula.trim() || !form.cidade.trim() || isPending}
              className="bg-fonti-primary hover:bg-fonti-primary-hover text-white"
            >
              {isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
