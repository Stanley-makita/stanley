'use client'

import { useState } from 'react'
import { CalendarClock, Pencil } from 'lucide-react'
import { format, differenceInDays, parseISO, addDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSalvarEngenharia } from '@/hooks/processos/useSalvarEngenharia'

function formatarMoeda(v: number | null | undefined) {
  if (!v) return null
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

function badgeDias(dias: number) {
  if (dias < 0)   return { texto: `Vencida há ${Math.abs(dias)}d`, cor: 'bg-red-100 text-red-700' }
  if (dias === 0) return { texto: 'Vence hoje!',                   cor: 'bg-red-100 text-red-700' }
  if (dias <= 5)  return { texto: `${dias}d restantes`,            cor: 'bg-red-100 text-red-700' }
  if (dias <= 10) return { texto: `${dias}d restantes`,            cor: 'bg-amber-100 text-amber-700' }
  return             { texto: `${dias}d restantes`,                cor: 'bg-green-100 text-green-700' }
}

interface Props {
  processoId: string
  validadeEngenharia: string | null | undefined
  valorEngenharia: number | null | undefined
}

export function EngenhariaCard({ processoId, validadeEngenharia, valorEngenharia }: Props) {
  const [aberto, setAberto]         = useState(false)
  const [novaData, setNovaData]     = useState('')
  const [novoValor, setNovoValor]   = useState('')
  const salvar = useSalvarEngenharia()

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const diasRestantes = validadeEngenharia ? differenceInDays(parseISO(validadeEngenharia), hoje) : null
  const badge = diasRestantes !== null ? badgeDias(diasRestantes) : null

  function abrirEditor() {
    setNovaData(validadeEngenharia ?? '')
    setNovoValor(valorEngenharia ? String(valorEngenharia) : '')
    setAberto(true)
  }

  async function handleSalvar() {
    const valor = parseFloat(novoValor.replace(/\./g, '').replace(',', '.'))
    if (!novaData || isNaN(valor) || valor <= 0) return
    await salvar.mutateAsync({ processoId, validadeEngenharia: novaData, valorEngenharia: valor })
    setAberto(false)
  }

  const temDados = validadeEngenharia || valorEngenharia

  return (
    <>
      <button
        onClick={abrirEditor}
        className="group rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-3 hover:border-[#253B29]/30 hover:bg-gray-50 transition-colors text-left w-full"
      >
        <div className="w-9 h-9 bg-gray-50 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-white transition-colors">
          <CalendarClock className="h-4 w-4 text-[#253B29]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 flex items-center gap-1">
            Validade Engenharia
            <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-40 transition-opacity" />
          </p>
          {validadeEngenharia ? (
            <p className="text-sm font-bold text-[#253B29]">
              {format(parseISO(validadeEngenharia), 'dd/MM/yyyy', { locale: ptBR })}
            </p>
          ) : (
            <p className="text-sm text-gray-400 italic">Não informado</p>
          )}
          {valorEngenharia ? (
            <p className="text-xs text-gray-500 mt-0.5">{formatarMoeda(valorEngenharia)}</p>
          ) : null}
          {badge && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 inline-block ${badge.cor}`}>
              {badge.texto}
            </span>
          )}
        </div>
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-[#253B29]">📐 Engenharia</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Data de vencimento <span className="text-red-500">*</span></label>
              <button
                type="button"
                onClick={() => setNovaData(format(addDays(new Date(), 180), 'yyyy-MM-dd'))}
                className="text-xs bg-[#E7E0C4]/60 hover:bg-[#E7E0C4] text-[#253B29] font-medium px-3 py-1.5 rounded-lg transition-colors block"
              >
                + 180 dias (prazo padrão)
              </button>
              <Input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} className="text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Valor avaliado pelo banco (R$) <span className="text-red-500">*</span></label>
              <Input
                type="number"
                min="0"
                step="1000"
                placeholder="Ex: 350000"
                value={novoValor}
                onChange={(e) => setNovoValor(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button
              size="sm"
              className="bg-[#253B29] hover:bg-[#1a2b1e] text-white"
              disabled={salvar.isPending || !novaData || !novoValor}
              onClick={handleSalvar}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
