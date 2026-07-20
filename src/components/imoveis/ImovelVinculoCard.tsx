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
import type { Imovel, RegistroImoveis } from '@/types/imoveis'
import { TIPO_IMOVEL_LABELS } from '@/types/imoveis'
import type { ImovelSelecionado } from '@/components/leads/SeletorImovelProcesso'

const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

interface Props {
  snapshot: ImovelSelecionado
  onVincular: (imovel: Imovel) => void
  onEditarSnapshot: (patch: Partial<ImovelSelecionado>) => void
  onDesvincular: () => void
  isPending?: boolean
  registros: RegistroImoveis[]
  contextoLabel: string
  slotExtra?: React.ReactNode
}

/** Núcleo de UI compartilhado entre o Imóvel do Processo e do Lead — busca,
 * cadastro, edição do snapshot denormalizado e desvínculo. Persistência e
 * fetch de dados extras (avaliações, registros) ficam nos wrappers
 * (BlocoImovel.tsx / BlocoImovelLead.tsx), não aqui. */
export function ImovelVinculoCard({
  snapshot, onVincular, onEditarSnapshot, onDesvincular, isPending, registros, contextoLabel, slotExtra,
}: Props) {
  const [buscarAberto, setBuscarAberto] = useState(false)
  const [cadastrarAberto, setCadastrarAberto] = useState(false)
  const [editando, setEditando] = useState(false)

  const temImovel = !!(snapshot.imovel_id || snapshot.imovel_rua || snapshot.nome_imovel)

  const [form, setForm] = useState(() => snapshotParaForm(snapshot))

  function iniciarEdicao() {
    setForm(snapshotParaForm(snapshot))
    setEditando(true)
  }

  function salvarEdicao() {
    onEditarSnapshot({
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
      nome_imovel: form.nome_imovel || snapshot.nome_imovel,
    })
    setEditando(false)
  }

  function handleSelecionar(imovel: Imovel) {
    onVincular(imovel)
    setBuscarAberto(false)
  }

  const registroNome = registros.find((r) => r.id === snapshot.imovel_registro_id)?.nome

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-[var(--shadow-card)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-fonti-primary" />
          <span className="text-sm font-semibold text-fonti-primary">Imóvel</span>
          {snapshot.imovel_id && (
            <Badge variant="outline" className="text-[10px] border-fonti-primary/20 text-fonti-primary/70">
              Vinculado
            </Badge>
          )}
        </div>
        {!editando && (
          <div className="flex gap-1">
            {temImovel && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-fonti-primary" onClick={iniciarEdicao}>
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
              className="h-7 text-xs gap-1 bg-fonti-primary hover:bg-fonti-primary-hover text-white"
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
          {snapshot.nome_imovel && (
            <p className="text-sm text-gray-700 font-medium">{snapshot.nome_imovel}</p>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
            {snapshot.imovel_matricula && <span>Matrícula: <strong>{snapshot.imovel_matricula}</strong></span>}
            {snapshot.imovel_tipo && (
              <span>Tipo: <strong>{TIPO_IMOVEL_LABELS[snapshot.imovel_tipo as keyof typeof TIPO_IMOVEL_LABELS] ?? snapshot.imovel_tipo}</strong></span>
            )}
            {snapshot.imovel_area_construida && <span>Área: <strong>{snapshot.imovel_area_construida} m²</strong></span>}
            {snapshot.imovel_cidade && <span>Cidade: <strong>{snapshot.imovel_cidade}{snapshot.imovel_uf ? `/${snapshot.imovel_uf}` : ''}</strong></span>}
            {registroNome && <span className="sm:col-span-2">Registro: <strong>{registroNome}</strong></span>}
          </div>
          {snapshot.imovel_id && (
            <button
              onClick={onDesvincular}
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
            Edições aqui afetam apenas {contextoLabel}, não o cadastro original do imóvel.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome / Referência</Label>
              <Input className="h-8 text-xs" value={form.nome_imovel} onChange={(e) => setForm((f) => ({ ...f, nome_imovel: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Matrícula</Label>
              <Input className="h-8 text-xs" value={form.imovel_matricula} onChange={(e) => setForm((f) => ({ ...f, imovel_matricula: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs">Rua</Label>
              <Input className="h-8 text-xs" value={form.imovel_rua} onChange={(e) => setForm((f) => ({ ...f, imovel_rua: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Número</Label>
              <Input className="h-8 text-xs" value={form.imovel_numero} onChange={(e) => setForm((f) => ({ ...f, imovel_numero: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs">Cidade</Label>
              <Input className="h-8 text-xs" value={form.imovel_cidade} onChange={(e) => setForm((f) => ({ ...f, imovel_cidade: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">UF</Label>
              <Select value={form.imovel_uf || '__'} onValueChange={(v) => setForm((f) => ({ ...f, imovel_uf: v === '__' ? '' : v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__">—</SelectItem>
                  {UFS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
            <Select
              value={form.imovel_registro_id || '__'}
              onValueChange={(v) => setForm((f) => ({ ...f, imovel_registro_id: v === '__' ? '' : v }))}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__">— Não informado</SelectItem>
                {registros.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.nome}{r.cidade ? ` — ${r.cidade}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {slotExtra}

      <BuscarImovelModal
        aberto={buscarAberto}
        onFechar={() => setBuscarAberto(false)}
        onSelecionar={handleSelecionar}
        onCadastrarNovo={() => { setBuscarAberto(false); setCadastrarAberto(true) }}
      />

      <ImovelFormDrawer
        aberto={cadastrarAberto}
        onFechar={() => setCadastrarAberto(false)}
        onSucesso={handleSelecionar}
      />
    </div>
  )
}

function snapshotParaForm(snapshot: ImovelSelecionado) {
  return {
    imovel_matricula: snapshot.imovel_matricula ?? '',
    imovel_tipo: snapshot.imovel_tipo ?? '',
    imovel_categoria: snapshot.imovel_categoria ?? '',
    imovel_area_construida: snapshot.imovel_area_construida != null ? String(snapshot.imovel_area_construida) : '',
    imovel_area_terreno: snapshot.imovel_area_terreno != null ? String(snapshot.imovel_area_terreno) : '',
    imovel_rua: snapshot.imovel_rua ?? '',
    imovel_numero: snapshot.imovel_numero ?? '',
    imovel_complemento: snapshot.imovel_complemento ?? '',
    imovel_bairro: snapshot.imovel_bairro ?? '',
    imovel_cidade: snapshot.imovel_cidade ?? '',
    imovel_uf: snapshot.imovel_uf ?? '',
    imovel_registro_id: snapshot.imovel_registro_id ?? '',
    nome_imovel: snapshot.nome_imovel ?? '',
  }
}
