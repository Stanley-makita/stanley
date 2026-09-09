'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pencil, Check, X, FileCheck2 } from 'lucide-react'
import { useAtualizarRegistro, type DadosRegistroForm } from '@/hooks/processos/useAtualizarRegistro'
import { STATUS_PROTOCOLO_LABELS, type Processo, type StatusProtocolo } from '@/types/processos'

interface Props {
  processo: Processo
}

function formularioInicial(processo: Processo): DadosRegistroForm {
  return {
    registro_status_protocolo: processo.registro_status_protocolo ?? null,
    registro_numero_protocolo: processo.registro_numero_protocolo ?? null,
    registro_cri: processo.registro_cri ?? null,
    registro_data_protocolado: processo.registro_data_protocolado ?? null,
    registro_data_prevista_entrega: processo.registro_data_prevista_entrega ?? null,
    registro_diligencia: processo.registro_diligencia ?? null,
  }
}

export function AbaRegistro({ processo }: Props) {
  const atualizar = useAtualizarRegistro(processo)
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<DadosRegistroForm>(() => formularioInicial(processo))

  function iniciarEdicao() {
    setForm(formularioInicial(processo))
    setEditando(true)
  }

  async function salvar() {
    await atualizar.mutateAsync(form)
    setEditando(false)
  }

  const statusLabel = processo.registro_status_protocolo
    ? STATUS_PROTOCOLO_LABELS[processo.registro_status_protocolo]
    : '—'

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-fonti-primary" />
            <span className="text-sm font-semibold text-fonti-primary">Protocolo</span>
          </div>
          {!editando ? (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-fonti-primary" onClick={iniciarEdicao}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400" onClick={() => setEditando(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs gap-1 bg-fonti-primary hover:bg-fonti-primary-hover text-white"
                onClick={salvar}
                disabled={atualizar.isPending}
              >
                <Check className="h-3 w-3" /> Salvar
              </Button>
            </div>
          )}
        </div>

        {!editando ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 text-sm">
            <Campo label="Status Protocolo" valor={statusLabel} />
            <Campo label="Nº do Protocolo" valor={processo.registro_numero_protocolo} />
            <Campo label="CRI" valor={processo.registro_cri} />
            <Campo label="Data que foi protocolado" valor={formatarData(processo.registro_data_protocolado)} />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Status Protocolo</Label>
              <Select
                value={form.registro_status_protocolo ?? '__'}
                onValueChange={(v) => setForm((f) => ({ ...f, registro_status_protocolo: v === '__' ? null : v as StatusProtocolo }))}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__">— Não informado</SelectItem>
                  {Object.entries(STATUS_PROTOCOLO_LABELS).map(([valor, label]) => (
                    <SelectItem key={valor} value={valor}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nº do Protocolo</Label>
              <Input
                className="h-9 text-sm"
                value={form.registro_numero_protocolo ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, registro_numero_protocolo: e.target.value || null }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CRI</Label>
              <Input
                className="h-9 text-sm"
                placeholder="Ex: 2º RI Apucarana"
                value={form.registro_cri ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, registro_cri: e.target.value || null }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data que foi protocolado</Label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={form.registro_data_protocolado ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, registro_data_protocolado: e.target.value || null }))}
              />
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <span className="text-sm font-semibold text-fonti-primary">Datas</span>

        {!editando ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 text-sm">
            <Campo label="Data prevista para entrega" valor={formatarData(processo.registro_data_prevista_entrega)} />
            <Campo label="Diligência?" valor={processo.registro_diligencia == null ? '—' : (processo.registro_diligencia ? 'Sim' : 'Não')} />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Data prevista para entrega</Label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={form.registro_data_prevista_entrega ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, registro_data_prevista_entrega: e.target.value || null }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Diligência?</Label>
              <Select
                value={form.registro_diligencia == null ? '__' : (form.registro_diligencia ? 'sim' : 'nao')}
                onValueChange={(v) => setForm((f) => ({ ...f, registro_diligencia: v === '__' ? null : v === 'sim' }))}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__">— Não informado</SelectItem>
                  <SelectItem value="sim">Sim</SelectItem>
                  <SelectItem value="nao">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Campo({ label, valor }: { label: string; valor: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="font-medium text-fonti-primary">{valor || '—'}</p>
    </div>
  )
}

function formatarData(data: string | null | undefined): string | null {
  if (!data) return null
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}/${ano}`
}
