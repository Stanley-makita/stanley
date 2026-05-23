'use client'

import { useState } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useMembrosAtivos } from '@/hooks/dashboard/useDashboard'
import { useAtualizarResponsaveis } from '@/hooks/processos/useProcessos'
import type { Processo, ModalidadeProcesso } from '@/types/processos'

interface PapelConfig {
  field: 'comercial_id' | 'operacional_id' | 'juridico_id'
  joinKey: 'comercial' | 'operacional' | 'juridico'
  label: string
  obrigatorio: boolean
}

function getPapeis(modalidade: ModalidadeProcesso): PapelConfig[] {
  if (modalidade === 'Contrato') return [
    { field: 'comercial_id',  joinKey: 'comercial',  label: 'Comercial', obrigatorio: true },
    { field: 'juridico_id',   joinKey: 'juridico',   label: 'Jurídico',  obrigatorio: true },
  ]
  if (modalidade === 'Consorcio') return [
    { field: 'comercial_id',  joinKey: 'comercial',  label: 'Comercial',  obrigatorio: true },
    { field: 'operacional_id', joinKey: 'operacional', label: 'Operacional', obrigatorio: false },
  ]
  // Financiamento (SFI, SBPE, PMCMV, Pro_Cotista) e CGI
  return [
    { field: 'comercial_id',   joinKey: 'comercial',   label: 'Comercial',   obrigatorio: true },
    { field: 'operacional_id', joinKey: 'operacional', label: 'Operacional', obrigatorio: true },
    { field: 'juridico_id',    joinKey: 'juridico',    label: 'Jurídico',    obrigatorio: false },
  ]
}

interface Props {
  processo: Processo
}

export function BlocoResponsaveis({ processo }: Props) {
  const { data: membros = [] } = useMembrosAtivos()
  const atualizar = useAtualizarResponsaveis()

  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState({
    comercial_id:   processo.comercial_id   ?? '',
    operacional_id: processo.operacional_id ?? '',
    juridico_id:    processo.juridico_id    ?? '',
  })

  const papeis = getPapeis(processo.modalidade)

  function iniciarEdicao() {
    setForm({
      comercial_id:   processo.comercial_id   ?? '',
      operacional_id: processo.operacional_id ?? '',
      juridico_id:    processo.juridico_id    ?? '',
    })
    setEditando(true)
  }

  async function salvar() {
    for (const papel of papeis) {
      if (papel.obrigatorio && !form[papel.field]) {
        toast.error(`${papel.label} é obrigatório para este tipo de processo`)
        return
      }
    }
    try {
      await atualizar.mutateAsync({
        processoId:    processo.id,
        comercial_id:   form.comercial_id   || null,
        operacional_id: form.operacional_id || null,
        juridico_id:    form.juridico_id    || null,
      })
      toast.success('Responsáveis atualizados')
      setEditando(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Responsáveis</h4>
        {!editando && (
          <button
            onClick={iniciarEdicao}
            className="p-1 rounded text-gray-300 hover:text-[#253B29] hover:bg-gray-100 transition-colors"
            title="Editar responsáveis"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {editando ? (
        <div className="space-y-3">
          {papeis.map((papel) => (
            <div key={papel.field}>
              <p className="text-xs text-gray-400 mb-1">
                {papel.label}
                {papel.obrigatorio
                  ? <span className="text-red-400 ml-0.5">*</span>
                  : <span className="text-gray-300 ml-1 text-[11px]">(opcional)</span>
                }
              </p>
              <Select
                value={form[papel.field] || '__nenhum'}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, [papel.field]: v === '__nenhum' ? '' : v }))
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {!papel.obrigatorio && (
                    <SelectItem value="__nenhum">— Nenhum —</SelectItem>
                  )}
                  {membros.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}

          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="h-7 bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1"
              onClick={salvar}
              disabled={atualizar.isPending}
            >
              <Check className="h-3.5 w-3.5" />
              {atualizar.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1"
              onClick={() => setEditando(false)}
            >
              <X className="h-3.5 w-3.5" />
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {papeis.map((papel) => {
            const membro = processo[papel.joinKey]
            return (
              <div key={papel.field}>
                <p className="text-xs text-gray-400">{papel.label}</p>
                {membro ? (
                  <>
                    <p className="text-sm font-medium text-[#253B29]">{membro.nome}</p>
                    <p className="text-xs text-gray-400">{membro.email}</p>
                  </>
                ) : (
                  <p className="text-sm text-gray-300 italic">Não definido</p>
                )}
              </div>
            )
          })}

          {processo.corretor_nome && (
            <div>
              <p className="text-xs text-gray-400">Corretor</p>
              <p className="text-sm font-medium text-[#253B29]">{processo.corretor_nome}</p>
              {processo.corretor_creci && (
                <p className="text-xs text-gray-400">CRECI: {processo.corretor_creci}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
