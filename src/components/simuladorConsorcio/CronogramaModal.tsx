'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Table2 } from 'lucide-react'
import type { LinhaMensalConsorcio } from '@/lib/simuladorConsorcio/tipos'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

interface Props {
  linhas: LinhaMensalConsorcio[]
}

// 13 colunas — todas as colunas da planilha original que alimentam algum
// cálculo (Ano e as colunas "[OFF]" ficam de fora, não são usadas em nada).
const COLUNAS: Array<{ label: string; get: (l: LinhaMensalConsorcio) => string }> = [
  { label: 'Mês',              get: (l) => String(l.mes) },
  { label: 'Parcela',          get: (l) => l.parcela != null ? BRL.format(l.parcela) : '—' },
  { label: 'Parcela Ano',      get: (l) => l.parcelaAno != null ? BRL.format(l.parcelaAno) : '—' },
  { label: 'Valor da carta',   get: (l) => l.carta != null ? BRL.format(l.carta) : '—' },
  { label: 'Saldo Devedor Ano', get: (l) => l.saldoDevedor != null ? BRL.format(l.saldoDevedor) : '—' },
  { label: 'Lance',            get: (l) => l.lance > 0 ? BRL.format(l.lance) : '—' },
  { label: 'Correção',         get: (l) => l.correcao != null ? BRL.format(l.correcao) : '—' },
  { label: 'Aluguel Saída',    get: (l) => l.aluguelSaida > 0 ? BRL.format(l.aluguelSaida) : '—' },
  { label: 'Aluguel Entrada',  get: (l) => l.aluguelEntrada > 0 ? BRL.format(l.aluguelEntrada) : '—' },
  { label: 'Rendimento',       get: (l) => BRL.format(l.rendimento) },
  { label: 'Saldo',            get: (l) => BRL.format(l.saldoAplicacao) },
  { label: 'Imóvel Consórcio', get: (l) => BRL.format(l.imovelConsorcio) },
  { label: 'Imóvel à vista',   get: (l) => BRL.format(l.imovelAVista) },
]

export function CronogramaModal({ linhas }: Props) {
  const [aberto, setAberto] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 text-xs gap-1.5 border-fonti-primary text-fonti-primary hover:bg-fonti-primary/5"
        onClick={() => setAberto(true)}
        disabled={linhas.length === 0}
      >
        <Table2 className="h-3.5 w-3.5" />
        Ver cronograma mensal ({linhas.length} meses)
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent
          className="p-0 flex flex-col overflow-hidden w-[calc(100vw-1rem)] h-[95svh] rounded-xl sm:rounded-lg"
          style={{ maxWidth: 'min(98vw, 1600px)', maxHeight: 'calc(100vh - 16px)' }}
        >
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Table2 className="h-4 w-4 text-fonti-primary" />
              Cronograma mensal ({linhas.length} meses)
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="border-b border-gray-200">
                  {COLUNAS.map((c) => (
                    <th key={c.label} className="text-right font-semibold text-gray-500 px-3 py-2 first:text-left whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.mes} className={l.lance > 0 ? 'bg-fonti-accent-hover' : 'odd:bg-gray-50/60'}>
                    {COLUNAS.map((c) => (
                      <td key={c.label} className="px-3 py-1.5 text-right text-gray-700 first:text-left first:text-gray-500 whitespace-nowrap">
                        {c.get(l)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
