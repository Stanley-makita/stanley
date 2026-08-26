'use client'

import { useState, useEffect } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  useConfigConsorcio,
  useSalvarConfigConsorcio,
  useExcluirConfigConsorcio,
} from '@/hooks/configuracoes/useConfigConsorcio'
import { type FinConfigConsorcio } from '@/types/financeiro'
import { TIPOS_BEM, LABEL_TIPO_PARCELA, type TipoParcela } from '@/types/consorcio'

const CONFIG_VAZIO: FinConfigConsorcio[] = []

type LocalRow = {
  tempId: string
  id: string | null // null = nova linha não salva
  geral: boolean     // linha "Padrão/Geral" (administradora_nome IS NULL)
  administradora_nome: string
  tipo_bem: string        // '' = qualquer tipo de bem
  tipo_parcela: string    // '' = ambos ('linear' | 'reduzida')
  data_vigencia_inicio: string // '' = sem limite inferior
  data_vigencia_fim: string    // '' = ainda vigente
  comissao_total_percentual: string
  comissao_comercial_percentual: string
  numero_parcelas_padrao: string
  dirty: boolean
}

function fromDB(c: FinConfigConsorcio): LocalRow {
  return {
    tempId: c.id,
    id: c.id,
    geral: c.administradora_nome === null,
    administradora_nome: c.administradora_nome ?? '',
    tipo_bem: c.tipo_bem ?? '',
    tipo_parcela: c.tipo_parcela ?? '',
    data_vigencia_inicio: c.data_vigencia_inicio ?? '',
    data_vigencia_fim: c.data_vigencia_fim ?? '',
    comissao_total_percentual: String(c.comissao_total_percentual),
    comissao_comercial_percentual: String(c.comissao_comercial_percentual),
    numero_parcelas_padrao: String(c.numero_parcelas_padrao),
    dirty: false,
  }
}

function novaLinha(): LocalRow {
  return {
    tempId: `new-${Date.now()}-${Math.random()}`,
    id: null,
    geral: false,
    administradora_nome: '',
    tipo_bem: '',
    tipo_parcela: '',
    data_vigencia_inicio: '',
    data_vigencia_fim: '',
    comissao_total_percentual: '4',
    comissao_comercial_percentual: '25',
    numero_parcelas_padrao: '13',
    dirty: true,
  }
}

function parseNum(s: string): number {
  return parseFloat(s.replace(',', '.')) || 0
}

export function AbaConfigConsorcio() {
  const { data: config = CONFIG_VAZIO } = useConfigConsorcio()
  const { mutate: salvar, isPending: salvando } = useSalvarConfigConsorcio()
  const { mutate: excluir, isPending: excluindo } = useExcluirConfigConsorcio()

  const [linhas, setLinhas] = useState<LocalRow[]>([])

  useEffect(() => {
    setLinhas((prev) => {
      const novas = prev.filter((r) => r.id === null && !r.geral)
      const existentes = config.map(fromDB)
      return existentes.map((e) => {
        const emEdicao = prev.find((p) => p.id === e.id && p.dirty)
        return emEdicao ?? e
      }).concat(novas)
    })
  }, [config])

  const linhaGeral = linhas.find((r) => r.geral)
  const linhasAdministradoras = linhas.filter((r) => !r.geral)

  function update(tempId: string, campo: keyof LocalRow, valor: string) {
    setLinhas((prev) =>
      prev.map((r) => r.tempId === tempId ? { ...r, [campo]: valor, dirty: true } : r)
    )
  }

  function adicionarLinha() {
    setLinhas((prev) => [...prev, novaLinha()])
  }

  function removerLinha(tempId: string, id: string | null) {
    if (id === null) {
      setLinhas((prev) => prev.filter((r) => r.tempId !== tempId))
      return
    }
    if (!confirm('Remover esta configuração de comissão de Consórcio?')) return
    excluir(id, {
      onSuccess: () => setLinhas((prev) => prev.filter((r) => r.tempId !== tempId)),
    })
  }

  function salvarLinha(row: LocalRow) {
    if (!row.geral && !row.administradora_nome.trim()) return
    salvar({
      id: row.id,
      administradora_nome: row.geral ? null : row.administradora_nome.trim(),
      tipo_bem: row.geral ? null : (row.tipo_bem || null),
      tipo_parcela: row.geral ? null : ((row.tipo_parcela || null) as 'linear' | 'reduzida' | null),
      data_vigencia_inicio: row.geral ? null : (row.data_vigencia_inicio || null),
      data_vigencia_fim: row.geral ? null : (row.data_vigencia_fim || null),
      comissao_total_percentual: parseNum(row.comissao_total_percentual),
      comissao_comercial_percentual: parseNum(row.comissao_comercial_percentual),
      numero_parcelas_padrao: Math.round(parseNum(row.numero_parcelas_padrao)) || 13,
    }, {
      onSuccess: () => setLinhas((prev) => prev.map((r) => r.tempId === row.tempId ? { ...r, dirty: false } : r)),
    })
  }

  function adicionarGeral() {
    setLinhas((prev) => [
      { ...novaLinha(), geral: true },
      ...prev,
    ])
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Percentual de comissão que a empresa recebe sobre o valor da carta de consórcio, fatia repassada ao comercial e nº de parcelas do fluxo de comissão gerado ao concluir o processo.
        Use a linha "Padrão/Geral" como regra de fallback para administradoras sem configuração própria.
      </p>

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5 border-b border-gray-200">
          <span className="text-sm font-semibold text-fonti-primary">Configuração por Administradora</span>
          <div className="flex gap-2">
            {!linhaGeral && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={adicionarGeral}>
                <Plus className="h-3 w-3" /> Padrão/Geral
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={adicionarLinha}>
              <Plus className="h-3 w-3" /> Administradora
            </Button>
          </div>
        </div>

        {linhas.length === 0 ? (
          <p className="text-xs text-gray-400 px-4 py-3">
            Sem configuração — enquanto nenhuma linha existir, a geração de fluxo usa os padrões 4% / 25% / 13 parcelas.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-white">
                  <th className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">Administradora</th>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">Tipo de bem</th>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">Tipo de parcela</th>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">Vigência (início/fim)</th>
                  <th className="px-3 py-2 text-right text-gray-500 font-medium whitespace-nowrap">% Comissão Empresa</th>
                  <th className="px-3 py-2 text-right text-gray-500 font-medium whitespace-nowrap">% Fatia Comercial</th>
                  <th className="px-3 py-2 text-right text-gray-500 font-medium whitespace-nowrap">Nº Parcelas</th>
                  <th className="px-3 py-2 w-16" />
                </tr>
              </thead>
              <tbody>
                {[...(linhaGeral ? [linhaGeral] : []), ...linhasAdministradoras].map((row) => (
                  <tr key={row.tempId} className={`border-b border-gray-50 last:border-0 ${row.dirty ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                    <td className="px-2 py-1.5">
                      {row.geral ? (
                        <span className="inline-flex items-center rounded-full bg-fonti-primary/10 text-fonti-primary px-2 py-0.5 text-xs font-medium">
                          Padrão/Geral
                        </span>
                      ) : (
                        <Input
                          value={row.administradora_nome}
                          onChange={(e) => update(row.tempId, 'administradora_nome', e.target.value)}
                          className="h-7 text-xs w-40"
                          placeholder="Ex: Porto, Embracon..."
                        />
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {row.geral ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <Select value={row.tipo_bem || 'qualquer'} onValueChange={(v) => update(row.tempId, 'tipo_bem', v === 'qualquer' ? '' : v)}>
                          <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="qualquer">Qualquer</SelectItem>
                            {TIPOS_BEM.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {row.geral ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <Select value={row.tipo_parcela || 'ambos'} onValueChange={(v) => update(row.tempId, 'tipo_parcela', v === 'ambos' ? '' : v)}>
                          <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ambos">Ambos</SelectItem>
                            {(Object.keys(LABEL_TIPO_PARCELA) as TipoParcela[]).map((t) => (
                              <SelectItem key={t} value={t}>{LABEL_TIPO_PARCELA[t]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {row.geral ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Input
                            type="date"
                            value={row.data_vigencia_inicio}
                            onChange={(e) => update(row.tempId, 'data_vigencia_inicio', e.target.value)}
                            className="h-7 text-xs w-32"
                          />
                          <span className="text-gray-400">–</span>
                          <Input
                            type="date"
                            value={row.data_vigencia_fim}
                            onChange={(e) => update(row.tempId, 'data_vigencia_fim', e.target.value)}
                            className="h-7 text-xs w-32"
                          />
                        </div>
                      )}
                    </td>
                    {(['comissao_total_percentual', 'comissao_comercial_percentual'] as const).map((campo) => (
                      <td key={campo} className="px-2 py-1.5">
                        <div className="flex items-center justify-end gap-0.5">
                          <Input
                            type="number" min={0} max={100} step={0.1}
                            value={row[campo]}
                            onChange={(e) => update(row.tempId, campo, e.target.value)}
                            className="h-7 text-right text-xs w-16"
                          />
                          <span className="text-gray-400 shrink-0">%</span>
                        </div>
                      </td>
                    ))}
                    <td className="px-2 py-1.5">
                      <Input
                        type="number" min={1} step={1}
                        value={row.numero_parcelas_padrao}
                        onChange={(e) => update(row.tempId, 'numero_parcelas_padrao', e.target.value)}
                        className="h-7 text-right text-xs w-16"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          size="icon" variant={row.dirty ? 'default' : 'ghost'}
                          className={`h-6 w-6 ${row.dirty ? 'bg-fonti-primary hover:bg-fonti-primary/90' : ''}`}
                          disabled={salvando || !row.dirty}
                          onClick={() => salvarLinha(row)}
                          title="Salvar"
                        >
                          <Save className="w-3 h-3" />
                        </Button>
                        <Button
                          size="icon" variant="ghost"
                          className="h-6 w-6 text-red-400 hover:text-red-600"
                          disabled={excluindo}
                          onClick={() => removerLinha(row.tempId, row.id)}
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
    </div>
  )
}
