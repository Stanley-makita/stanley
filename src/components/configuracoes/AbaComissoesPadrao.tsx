'use client'

import { useState } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useBancos } from '@/hooks/useBancos'
import { useComissoesPadrao } from '@/hooks/configuracoes/useComissoesPadrao'
import { useSalvarComissaoPadrao } from '@/hooks/configuracoes/useSalvarComissaoPadrao'
import { useToast } from '@/components/ui/use-toast'

export function AbaComissoesPadrao() {
  const { data: bancos = [] } = useBancos()
  const { data: comissoes = [] } = useComissoesPadrao()
  const { mutate: salvar, isPending } = useSalvarComissaoPadrao()
  const { toast } = useToast()

  const [edicao, setEdicao] = useState<Record<string, { empresa: string; comercial: string }>>({})

  function getValor(bancoId: string, campo: 'empresa' | 'comercial'): string {
    if (edicao[bancoId]) return edicao[bancoId][campo]
    const existente = comissoes.find((c) => c.banco_id === bancoId)
    return campo === 'empresa'
      ? String(existente?.comissao_empresa ?? '')
      : String(existente?.comissao_comercial ?? '')
  }

  function handleChange(bancoId: string, campo: 'empresa' | 'comercial', valor: string) {
    setEdicao((prev) => ({
      ...prev,
      [bancoId]: { empresa: getValor(bancoId, 'empresa'), comercial: getValor(bancoId, 'comercial'), [campo]: valor },
    }))
  }

  function handleSalvar(bancoId: string, bancoNome: string) {
    const e = parseFloat(getValor(bancoId, 'empresa').replace(',', '.')) || 0
    const c = parseFloat(getValor(bancoId, 'comercial').replace(',', '.')) || 0
    salvar({ bancoId, comissaoEmpresa: e, comissaoComercial: c }, {
      onSuccess: () => {
        setEdicao((prev) => { const n = { ...prev }; delete n[bancoId]; return n })
        toast({ description: `Comissão padrão de ${bancoNome} salva.`, className: 'border-l-[#C2AA6A] bg-[#E7E0C4] text-[#253B29]' })
      },
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Percentuais padrão aplicados automaticamente ao criar novos processos. Podem ser ajustados individualmente por processo.
      </p>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#253B29] text-white">
              <th className="px-4 py-2 text-left">Banco</th>
              <th className="px-4 py-2 text-right">% Comissão Empresa</th>
              <th className="px-4 py-2 text-right">% Comissão Comercial</th>
              <th className="px-4 py-2 w-12" />
            </tr>
          </thead>
          <tbody>
            {bancos.map((banco) => {
              const alterado = !!edicao[banco.id]
              return (
                <tr key={banco.id} className={`border-t ${alterado ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {banco.cor && (
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: banco.cor }} />
                      )}
                      <span className="font-medium">{banco.nome}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={getValor(banco.id, 'empresa')}
                        onChange={(e) => handleChange(banco.id, 'empresa', e.target.value)}
                        className="h-7 text-right text-sm w-24"
                        placeholder="0"
                      />
                      <span className="text-gray-400 text-xs">%</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={getValor(banco.id, 'comercial')}
                        onChange={(e) => handleChange(banco.id, 'comercial', e.target.value)}
                        className="h-7 text-right text-sm w-24"
                        placeholder="0"
                      />
                      <span className="text-gray-400 text-xs">%</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <Button
                      size="icon"
                      variant={alterado ? 'default' : 'ghost'}
                      className={`h-7 w-7 ${alterado ? 'bg-[#253B29] hover:bg-[#253B29]/90' : ''}`}
                      onClick={() => handleSalvar(banco.id, banco.nome)}
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