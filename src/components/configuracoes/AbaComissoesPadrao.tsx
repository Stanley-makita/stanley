'use client'

import { useState, useEffect } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useBancos } from '@/hooks/useBancos'
import { useComissoesPadrao } from '@/hooks/configuracoes/useComissoesPadrao'
import { useSalvarComissaoPadrao, useExcluirComissaoPadrao } from '@/hooks/configuracoes/useSalvarComissaoPadrao'
import { useToast } from '@/components/ui/use-toast'
import { type ComissaoPadrao } from '@/types/configuracoes-avancadas'

const MODALIDADES = [
  { value: '', label: 'Todas' },
  { value: 'SBPE', label: 'SBPE' },
  { value: 'SFI', label: 'SFI' },
  { value: 'PMCMV', label: 'PMCMV' },
  { value: 'Pro_Cotista', label: 'Pro Cotista' },
  { value: 'CGI', label: 'CGI' },
  { value: 'Consorcio', label: 'Consórcio' },
  { value: 'Contrato', label: 'Contrato' },
  { value: 'Registro', label: 'Registro' },
]

type LocalRow = {
  tempId: string
  id: string | null           // null = nova linha não salva
  banco_id: string
  modalidade: string
  comissao_empresa: string
  comissao_comercial: string
  comissao_operacional: string
  comissao_parceiro: string
  piso_valor: string
  teto_valor: string
  dirty: boolean
}

function fromDB(c: ComissaoPadrao): LocalRow {
  return {
    tempId: c.id,
    id: c.id,
    banco_id: c.banco_id,
    modalidade: c.modalidade,
    comissao_empresa: String(c.comissao_empresa ?? ''),
    comissao_comercial: String(c.comissao_comercial ?? ''),
    comissao_operacional: String(c.comissao_operacional ?? ''),
    comissao_parceiro: String(c.comissao_parceiro ?? ''),
    piso_valor: String(c.piso_valor ?? ''),
    teto_valor: String(c.teto_valor ?? ''),
    dirty: false,
  }
}

function novaLinha(banco_id: string): LocalRow {
  return {
    tempId: `new-${Date.now()}-${Math.random()}`,
    id: null,
    banco_id,
    modalidade: '',
    comissao_empresa: '',
    comissao_comercial: '',
    comissao_operacional: '',
    comissao_parceiro: '',
    piso_valor: '',
    teto_valor: '',
    dirty: true,
  }
}

function parseNum(s: string): number {
  return parseFloat(s.replace(',', '.')) || 0
}

export function AbaComissoesPadrao() {
  const { data: bancos = [] } = useBancos()
  const { data: comissoes = [] } = useComissoesPadrao()
  const { mutate: salvar, isPending: salvando } = useSalvarComissaoPadrao()
  const { mutate: excluir, isPending: excluindo } = useExcluirComissaoPadrao()
  const { toast } = useToast()

  const [linhas, setLinhas] = useState<LocalRow[]>([])

  // Sincroniza quando dados do banco chegam
  useEffect(() => {
    setLinhas((prev) => {
      const novas = prev.filter((r) => r.id === null) // preserva novas não salvas
      const existentes = comissoes.map(fromDB)
      // merge: se a linha já estava em edição, mantém os valores editados
      return existentes.map((e) => {
        const emEdicao = prev.find((p) => p.id === e.id && p.dirty)
        return emEdicao ?? e
      }).concat(novas)
    })
  }, [comissoes])

  function update(tempId: string, campo: keyof LocalRow, valor: string) {
    setLinhas((prev) =>
      prev.map((r) => r.tempId === tempId ? { ...r, [campo]: valor, dirty: true } : r)
    )
  }

  function adicionarLinha(banco_id: string) {
    setLinhas((prev) => [...prev, novaLinha(banco_id)])
  }

  function removerLinha(tempId: string, id: string | null, bancoNome: string) {
    if (id === null) {
      setLinhas((prev) => prev.filter((r) => r.tempId !== tempId))
      return
    }
    if (!confirm(`Remover regra de comissão de ${bancoNome}?`)) return
    excluir(id, {
      onSuccess: () => {
        setLinhas((prev) => prev.filter((r) => r.tempId !== tempId))
        toast({ description: 'Regra removida.' })
      },
    })
  }

  function salvarLinha(row: LocalRow, bancoNome: string) {
    salvar({
      bancoId: row.banco_id,
      modalidade: row.modalidade,
      comissaoEmpresa: parseNum(row.comissao_empresa),
      comissaoComercial: parseNum(row.comissao_comercial),
      comissaoOperacional: parseNum(row.comissao_operacional),
      comissaoParceiro: parseNum(row.comissao_parceiro),
      pisoValor: parseNum(row.piso_valor),
      tetoValor: parseNum(row.teto_valor),
    }, {
      onSuccess: () => {
        toast({ description: `Comissão de ${bancoNome} salva.` })
      },
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Defina a comissão que a empresa recebe de cada banco, por modalidade.
        Use "Todas" para uma regra geral e adicione linhas por modalidade para regras específicas (ex: SBPE com teto diferente de MCMV).
      </p>

      {bancos.map((banco) => {
        const linhasDoBanco = linhas.filter((r) => r.banco_id === banco.id)
        return (
          <div key={banco.id} className="border border-gray-200 rounded-xl overflow-hidden">
            {/* Header do banco */}
            <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5 border-b border-gray-200">
              <div className="flex items-center gap-2">
                {banco.cor && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: banco.cor }} />}
                <span className="text-sm font-semibold text-[#253B29]">{banco.nome}</span>
                <span className="text-xs text-gray-400">({linhasDoBanco.length} {linhasDoBanco.length === 1 ? 'regra' : 'regras'})</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => adicionarLinha(banco.id)}
              >
                <Plus className="h-3 w-3" /> Linha
              </Button>
            </div>

            {linhasDoBanco.length === 0 ? (
              <p className="text-xs text-gray-400 px-4 py-3">Sem regras — clique em "+ Linha" para adicionar.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-white">
                      <th className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">Modalidade</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-medium whitespace-nowrap">% Empresa</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-medium whitespace-nowrap">% Comercial</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-medium whitespace-nowrap">% Operacional</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-medium whitespace-nowrap">% Parceiro</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-medium whitespace-nowrap">Piso R$</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-medium whitespace-nowrap">Teto R$</th>
                      <th className="px-3 py-2 w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {linhasDoBanco.map((row) => (
                      <tr key={row.tempId} className={`border-b border-gray-50 last:border-0 ${row.dirty ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                        <td className="px-2 py-1.5">
                          <select
                            value={row.modalidade}
                            onChange={(e) => update(row.tempId, 'modalidade', e.target.value)}
                            className="h-7 text-xs border border-gray-200 rounded px-1.5 bg-white w-28"
                          >
                            {MODALIDADES.map((m) => (
                              <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                          </select>
                        </td>
                        {(['comissao_empresa', 'comissao_comercial', 'comissao_operacional', 'comissao_parceiro'] as const).map((campo) => (
                          <td key={campo} className="px-2 py-1.5">
                            <div className="flex items-center justify-end gap-0.5">
                              <Input
                                type="number" min={0} max={100} step={0.1}
                                value={row[campo]}
                                onChange={(e) => update(row.tempId, campo, e.target.value)}
                                className="h-7 text-right text-xs w-16"
                                placeholder="0"
                              />
                              <span className="text-gray-400 shrink-0">%</span>
                            </div>
                          </td>
                        ))}
                        {(['piso_valor', 'teto_valor'] as const).map((campo) => (
                          <td key={campo} className="px-2 py-1.5">
                            <Input
                              type="number" min={0} step={100}
                              value={row[campo]}
                              onChange={(e) => update(row.tempId, campo, e.target.value)}
                              className="h-7 text-right text-xs w-24"
                              placeholder="0"
                            />
                          </td>
                        ))}
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1 justify-end">
                            <Button
                              size="icon" variant={row.dirty ? 'default' : 'ghost'}
                              className={`h-6 w-6 ${row.dirty ? 'bg-[#253B29] hover:bg-[#253B29]/90' : ''}`}
                              disabled={salvando || !row.dirty}
                              onClick={() => salvarLinha(row, banco.nome)}
                              title="Salvar"
                            >
                              <Save className="w-3 h-3" />
                            </Button>
                            <Button
                              size="icon" variant="ghost"
                              className="h-6 w-6 text-red-400 hover:text-red-600"
                              disabled={excluindo}
                              onClick={() => removerLinha(row.tempId, row.id, banco.nome)}
                              title="Remover"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
