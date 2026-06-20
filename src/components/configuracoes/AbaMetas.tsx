'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMetas } from '@/hooks/configuracoes/useMetas'
import { useSalvarMeta } from '@/hooks/configuracoes/useSalvarMeta'
import { useToast } from '@/components/ui/use-toast'
import { MetaEquipe } from '@/types/configuracoes-avancadas'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export function AbaMetas() {
  const [ano, setAno] = useState(new Date().getFullYear())
  const { data: metas = [] } = useMetas(ano)
  const { mutate: salvar, isPending } = useSalvarMeta()
  const { toast } = useToast()

  // Estado local para edição (inicializado dos dados do banco)
  const [edicao, setEdicao] = useState<Record<number, Partial<MetaEquipe>>>({})

  function getMeta(mes: number): MetaEquipe {
    const salva = metas.find((m) => m.mes === mes)
    const local = edicao[mes] ?? {}
    return {
      id: salva?.id ?? '',
      empresa_id: salva?.empresa_id ?? '',
      ano,
      mes,
      meta_valor:     local.meta_valor     ?? salva?.meta_valor     ?? 0,
      meta_corte:     local.meta_corte     ?? salva?.meta_corte     ?? 0,
      meta_plus:      local.meta_plus      ?? salva?.meta_plus      ?? 0,
      meta_contratos: local.meta_contratos ?? salva?.meta_contratos ?? 0,
    }
  }

  function handleChange(mes: number, campo: keyof MetaEquipe, valor: string) {
    const num = parseFloat(valor.replace(',', '.')) || 0
    setEdicao((prev) => ({ ...prev, [mes]: { ...prev[mes], [campo]: num } }))
  }

  function handleSalvar(mes: number) {
    const meta = getMeta(mes)
    salvar(meta, {
      onSuccess: () => {
        setEdicao((prev) => { const n = { ...prev }; delete n[mes]; return n })
        toast({ description: `Meta de ${MESES[mes - 1]} salva.` })
      },
    })
  }

  return (
    <div className="space-y-4">
      {/* Navegação de ano */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAno(ano - 1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-semibold text-fonti-primary w-10 text-center">{ano}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAno(ano + 1)}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Grade de meses */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-fonti-primary text-white">
              <th className="px-4 py-2 text-left w-16">Mês</th>
              <th className="px-4 py-2 text-right">Meta Corte (R$)</th>
              <th className="px-4 py-2 text-right">Meta Plus (R$)</th>
              <th className="px-4 py-2 text-right">Meta Valor (R$)</th>
              <th className="px-4 py-2 text-right">Contratos</th>
              <th className="px-4 py-2 w-12" />
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((mes) => {
              const meta = getMeta(mes)
              const alterado = !!edicao[mes]
              return (
                <tr key={mes} className={`border-t ${alterado ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                  <td className="px-4 py-2 font-medium text-fonti-primary">{MESES[mes - 1]}</td>
                  {(['meta_corte', 'meta_plus', 'meta_valor'] as const).map((campo) => (
                    <td key={campo} className="px-2 py-1.5">
                      <Input
                        type="number"
                        min={0}
                        step={1000}
                        value={meta[campo] || ''}
                        onChange={(e) => handleChange(mes, campo, e.target.value)}
                        className="h-7 text-right text-sm w-full"
                        placeholder="0"
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={meta.meta_contratos || ''}
                      onChange={(e) => handleChange(mes, 'meta_contratos', e.target.value)}
                      className="h-7 text-right text-sm w-full"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <Button
                      size="icon"
                      variant={alterado ? 'default' : 'ghost'}
                      className={`h-7 w-7 ${alterado ? 'bg-fonti-primary hover:bg-fonti-primary/90' : ''}`}
                      onClick={() => handleSalvar(mes)}
                      disabled={isPending || !alterado}
                    >
                      <Save className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}