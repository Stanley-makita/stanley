'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Search, Pencil, X, Check, Building2, Info } from 'lucide-react'
import { BuscarImovelModal } from './BuscarImovelModal'
import { ImovelFormDrawer } from './ImovelFormDrawer'
import { useRegistrosImoveis } from '@/hooks/configuracoes/useRegistrosImoveis'
import type { Processo } from '@/types/processos'
import type { Imovel } from '@/types/imoveis'
import { TIPO_IMOVEL_LABELS, CATEGORIA_IMOVEL_LABELS } from '@/types/imoveis'

const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

interface Props {
  processo: Processo
  onUpdate: (campos: Partial<Omit<Processo, 'id' | 'empresa_id'>>) => void
  isPending?: boolean
}

export function BlocoImovel({ processo, onUpdate, isPending }: Props) {
  const [buscarAberto, setBuscarAberto] = useState(false)
  const [cadastrarAberto, setCadastrarAberto] = useState(false)
  const [editando, setEditando] = useState(false)

  const { data: registros = [] } = useRegistrosImoveis()

  const temImovel = !!(processo.imovel_id || processo.imovel_rua || processo.nome_imovel)

  // Estado local de edição
  const [form, setForm] = useState({
    imovel_matricula: processo.imovel_matricula ?? '',
    imovel_tipo: processo.imovel_tipo ?? '',
    imovel_categoria: processo.imovel_categoria ?? '',
    imovel_area_construida: processo.imovel_area_construida ?? '',
    imovel_area_terreno: processo.imovel_area_terreno ?? '',
    imovel_rua: processo.imovel_rua ?? '',
    imovel_numero: processo.imovel_numero ?? '',
    imovel_complemento: processo.imovel_complemento ?? '',
    imovel_bairro: processo.imovel_bairro ?? '',
    imovel_cidade: processo.imovel_cidade ?? '',
    imovel_uf: processo.imovel_uf ?? '',
    imovel_registro_id: processo.imovel_registro_id ?? '',
    nome_imovel: processo.nome_imovel ?? '',
  })

  function iniciarEdicao() {
    setForm({
      imovel_matricula: processo.imovel_matricula ?? '',
      imovel_tipo: processo.imovel_tipo ?? '',
      imovel_categoria: processo.imovel_categoria ?? '',
      imovel_area_construida: processo.imovel_area_construida != null ? String(processo.imovel_area_construida) : '',
      imovel_area_terreno: processo.imovel_area_terreno != null ? String(processo.imovel_area_terreno) : '',
      imovel_rua: processo.imovel_rua ?? '',
      imovel_numero: processo.imovel_numero ?? '',
      imovel_complemento: processo.imovel_complemento ?? '',
      imovel_bairro: processo.imovel_bairro ?? '',
      imovel_cidade: processo.imovel_cidade ?? '',
      imovel_uf: processo.imovel_uf ?? '',
      imovel_registro_id: processo.imovel_registro_id ?? '',
      nome_imovel: processo.nome_imovel ?? '',
    })
    setEditando(true)
  }

  function salvarEdicao() {
    onUpdate({
      imovel_matricula: form.imovel_matricula || null,
      imovel_tipo: form.imovel_tipo || null,
      imovel_categoria: form.imovel_categoria || null,
      imovel_area_construida: form.imovel_area_construida ? parseFloat(String(form.imovel_area_construida)) : null,
      imovel_area_terreno: form.imovel_area_terreno ? parseFloat(String(form.imovel_area_terreno)) : null,
      imovel_rua: form.imovel_rua || null,
      imovel_numero: form.imovel_numero || null,
      imovel_complemento: form.imovel_complemento || null,
      imovel_bairro: form.imovel_bairro || null,
      imovel_cidade: form.imovel_cidade || null,
      imovel_uf: form.imovel_uf || null,
      imovel_registro_id: form.imovel_registro_id || null,
      nome_imovel: form.nome_imovel || processo.nome_imovel,
    })
    setEditando(false)
  }

  function handleSelecionar(imovel: Imovel) {
    onUpdate({
      imovel_id: imovel.id,
      imovel_matricula: imovel.matricula,
      imovel_tipo: imovel.tipo,
      imovel_categoria: imovel.categoria,
      imovel_area_construida: imovel.area_construida,
      imovel_area_terreno: imovel.area_terreno,
      imovel_rua: imovel.rua,
      imovel_numero: imovel.numero,
      imovel_complemento: imovel.apto_unidade,
      imovel_bairro: imovel.bairro,
      imovel_cidade: imovel.cidade,
      imovel_uf: imovel.uf,
      imovel_registro_id: imovel.registro_imoveis_id,
      nome_imovel: [imovel.rua, imovel.numero, imovel.bairro, imovel.cidade].filter(Boolean).join(', ') || processo.nome_imovel,
    })
  }

  function desvincular() {
    onUpdate({ imovel_id: null })
  }

  const registroNome = registros.find((r) => r.id === processo.imovel_registro_id)?.nome

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-[#253B29]" />
          <span className="text-sm font-semibold text-[#253B29]">Imóvel</span>
          {processo.imovel_id && (
            <Badge variant="outline" className="text-[10px] border-[#253B29]/20 text-[#253B29]/70">
              Vinculado
            </Badge>
          )}
        </div>
        {!editando && (
          <div className="flex gap-1">
            {temImovel && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-[#253B29]" onClick={iniciarEdicao}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setBuscarAberto(true)}
            >
              <Search className="h-3 w-3" /> Buscar imóvel
            </Button>
          </div>
        )}
        {editando && (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400" onClick={() => setEditando(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs gap-1 bg-[#253B29] hover:bg-[#1a2b1e] text-white"
              onClick={salvarEdicao}
              disabled={isPending}
            >
              <Check className="h-3 w-3" /> Salvar
            </Button>
          </div>
        )}
      </div>

      {!temImovel && !editando && (
        <div className="text-center py-4 text-gray-400">
          <Building2 className="h-6 w-6 mx-auto mb-1.5 text-gray-300" />
          <p className="text-xs">Nenhum imóvel vinculado</p>
          <p className="text-xs text-gray-300 mt-0.5">Clique em "Buscar imóvel" para vincular</p>
        </div>
      )}

      {temImovel && !editando && (
        <div className="space-y-2">
          {processo.nome_imovel && (
            <p className="text-sm text-gray-700 font-medium">{processo.nome_imovel}</p>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
            {processo.imovel_matricula && <span>Matrícula: <strong>{processo.imovel_matricula}</strong></span>}
            {processo.imovel_tipo && (
              <span>Tipo: <strong>{TIPO_IMOVEL_LABELS[processo.imovel_tipo as keyof typeof TIPO_IMOVEL_LABELS] ?? processo.imovel_tipo}</strong></span>
            )}
            {processo.imovel_area_construida && <span>Área: <strong>{processo.imovel_area_construida} m²</strong></span>}
            {processo.imovel_cidade && <span>Cidade: <strong>{processo.imovel_cidade}{processo.imovel_uf ? `/${processo.imovel_uf}` : ''}</strong></span>}
            {registroNome && <span className="col-span-2">Registro: <strong>{registroNome}</strong></span>}
          </div>
          {processo.imovel_id && (
            <button
              onClick={desvincular}
              className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
              disabled={isPending}
            >
              Desvincular imóvel
            </button>
          )}
        </div>
      )}

      {editando && (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            <Info className="h-3 w-3 shrink-0" />
            Edições aqui afetam apenas este processo, não o cadastro original do imóvel.
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome / Referência</Label>
              <Input className="h-8 text-xs" value={form.nome_imovel} onChange={(e) => setForm((f) => ({ ...f, nome_imovel: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Matrícula</Label>
              <Input className="h-8 text-xs" value={form.imovel_matricula} onChange={(e) => setForm((f) => ({ ...f, imovel_matricula: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Rua</Label>
              <Input className="h-8 text-xs" value={form.imovel_rua} onChange={(e) => setForm((f) => ({ ...f, imovel_rua: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Número</Label>
              <Input className="h-8 text-xs" value={form.imovel_numero} onChange={(e) => setForm((f) => ({ ...f, imovel_numero: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Cidade</Label>
              <Input className="h-8 text-xs" value={form.imovel_cidade} onChange={(e) => setForm((f) => ({ ...f, imovel_cidade: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">UF</Label>
              <Select value={form.imovel_uf} onValueChange={(v) => setForm((f) => ({ ...f, imovel_uf: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">—</SelectItem>
                  {UFS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Área construída (m²)</Label>
              <Input className="h-8 text-xs" type="number" value={form.imovel_area_construida} onChange={(e) => setForm((f) => ({ ...f, imovel_area_construida: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Área terreno (m²)</Label>
              <Input className="h-8 text-xs" type="number" value={form.imovel_area_terreno} onChange={(e) => setForm((f) => ({ ...f, imovel_area_terreno: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Registro de Imóveis</Label>
            <Select value={form.imovel_registro_id} onValueChange={(v) => setForm((f) => ({ ...f, imovel_registro_id: v }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— Não informado</SelectItem>
                {registros.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.nome}{r.cidade ? ` — ${r.cidade}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <BuscarImovelModal
        aberto={buscarAberto}
        onFechar={() => setBuscarAberto(false)}
        onSelecionar={handleSelecionar}
        onCadastrarNovo={() => { setBuscarAberto(false); setCadastrarAberto(true) }}
      />

      <ImovelFormDrawer
        aberto={cadastrarAberto}
        onFechar={() => setCadastrarAberto(false)}
      />
    </div>
  )
}
