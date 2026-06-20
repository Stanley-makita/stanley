'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronLeft, ChevronRight, Plus, Loader2 } from 'lucide-react'

import { useFechamento, useAbrirFechamento } from '@/hooks/financeiro/useFechamento'

// Componentes legado (mantidos)
import { VisaoComissoes } from '@/components/financeiro/visoes/VisaoComissoes'
import { VisaoFluxoCaixa } from '@/components/financeiro/visoes/VisaoFluxoCaixa'
import { VisaoRelatorioEquipe } from '@/components/financeiro/visoes/VisaoRelatorioEquipe'

// Novos componentes
import { PainelFinanceiro } from '@/components/financeiro/PainelFinanceiro'
import { VisaoFechamento } from '@/components/financeiro/VisaoFechamento'
import { VisaoEmissoes } from '@/components/financeiro/VisaoEmissoes'
import { VisaoAReceber } from '@/components/financeiro/VisaoAReceber'
import { VisaoComissoesAPagar } from '@/components/financeiro/VisaoComissoesAPagar'
import { VisaoFolha } from '@/components/financeiro/VisaoFolha'
import { VisaoDespesas } from '@/components/financeiro/VisaoDespesas'
import { VisaoConferencias } from '@/components/financeiro/VisaoConferencias'

type Aba =
  | 'painel'
  | 'fechamento'
  | 'emissoes'
  | 'a_receber'
  | 'comissoes_pagar'
  | 'folha'
  | 'despesas'
  | 'fluxo'
  | 'conferencias'
  | 'equipe'
  | 'historico'

const ABAS: { key: Aba; label: string; novo?: boolean }[] = [
  { key: 'painel',          label: 'Painel' },
  { key: 'fechamento',      label: 'Fechamento',        novo: true },
  { key: 'emissoes',        label: 'Emissões',          novo: true },
  { key: 'a_receber',       label: 'A Receber',         novo: true },
  { key: 'comissoes_pagar', label: 'Comissões a Pagar', novo: true },
  { key: 'folha',           label: 'Folha',             novo: true },
  { key: 'despesas',        label: 'Despesas',          novo: true },
  { key: 'fluxo',           label: 'Fluxo de Caixa' },
  { key: 'conferencias',    label: 'Conferências',      novo: true },
  { key: 'equipe',          label: 'Equipe' },
  { key: 'historico',       label: 'Comissões (legado)' },
]

export default function FinanceiroPage() {
  const [data, setData] = useState(new Date())
  const [aba, setAba] = useState<Aba>('painel')
  const [modalAbrir, setModalAbrir] = useState(false)
  const [formMes, setFormMes] = useState(String(new Date().getMonth() + 1))
  const [formAno, setFormAno] = useState(String(new Date().getFullYear()))

  const mes = data.getMonth() + 1
  const ano = data.getFullYear()
  const nomeMes = data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const { data: fechamento, isLoading: fechamentoLoading } = useFechamento(mes, ano)
  const abrirFechamento = useAbrirFechamento()

  function navegar(dir: -1 | 1) {
    setData(d => {
      const nova = new Date(d)
      nova.setMonth(nova.getMonth() + dir)
      return nova
    })
  }

  const travado = fechamento?.status === 'travado'

  // Abas que precisam de fechamento para funcionar
  const precisaFechamento: Aba[] = ['fechamento', 'emissoes', 'a_receber', 'comissoes_pagar', 'folha', 'despesas', 'conferencias']

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-fonti-primary">Financeiro</h1>
          <p className="text-sm text-gray-500">Fechamento, comissões, folha e despesas</p>
        </div>
        <div className="flex items-center gap-2">
          {!fechamento && (
            <Button
              size="sm"
              className="bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-1"
              onClick={() => {
                setFormMes(String(mes))
                setFormAno(String(ano))
                setModalAbrir(true)
              }}
            >
              <Plus className="h-4 w-4" />
              Abrir Fechamento
            </Button>
          )}
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navegar(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-fonti-primary min-w-[160px] text-center capitalize">
            {nomeMes}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navegar(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Abas */}
      <div className="flex items-center border-b border-gray-200 overflow-x-auto gap-0 pb-0 scrollbar-none">
        {ABAS.map(({ key, label, novo }) => (
          <button
            key={key}
            onClick={() => setAba(key)}
            className={`relative flex-shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              aba === key
                ? 'border-fonti-primary text-fonti-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {label}
            {novo && (
              <span className="ml-1.5 inline-flex h-1.5 w-1.5 rounded-full bg-fonti-accent" />
            )}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div className="pt-1">
        {/* Painel */}
        {aba === 'painel' && (
          <PainelFinanceiro
            onAbrirFechamento={() => {
              setFormMes(String(mes))
              setFormAno(String(ano))
              setModalAbrir(true)
            }}
            onIrParaFechamento={(m, a) => {
              setData(new Date(a, m - 1, 1))
              setAba('fechamento')
            }}
          />
        )}

        {/* Abas que precisam de fechamento */}
        {precisaFechamento.includes(aba) && !fechamento && !fechamentoLoading && (
          <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
            <p className="text-gray-500 mb-2 font-medium">
              Nenhum fechamento aberto para {String(mes).padStart(2, '0')}/{ano}
            </p>
            <p className="text-sm text-gray-400 mb-4">
              Abra um fechamento para acessar esta aba.
            </p>
            <Button
              className="bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-1"
              onClick={() => {
                setFormMes(String(mes))
                setFormAno(String(ano))
                setModalAbrir(true)
              }}
            >
              <Plus className="h-4 w-4" />
              Abrir Fechamento
            </Button>
          </div>
        )}

        {fechamentoLoading && precisaFechamento.includes(aba) && (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}

        {fechamento && (
          <>
            {aba === 'fechamento'      && <VisaoFechamento fechamento={fechamento} />}
            {aba === 'emissoes'        && <VisaoEmissoes fechamento_id={fechamento.id} travado={travado ?? false} />}
            {aba === 'a_receber'       && <VisaoAReceber fechamento_id={fechamento.id} travado={travado ?? false} />}
            {aba === 'comissoes_pagar' && <VisaoComissoesAPagar fechamento_id={fechamento.id} travado={travado ?? false} />}
            {aba === 'folha'           && <VisaoFolha fechamento_id={fechamento.id} travado={travado ?? false} />}
            {aba === 'despesas'        && <VisaoDespesas fechamento_id={fechamento.id} travado={travado ?? false} />}
            {aba === 'conferencias'    && <VisaoConferencias fechamento_id={fechamento.id} travado={travado ?? false} />}
          </>
        )}

        {/* Abas legado / independentes */}
        {aba === 'fluxo'     && <VisaoFluxoCaixa mes={mes} ano={ano} />}
        {aba === 'equipe'    && <VisaoRelatorioEquipe mes={mes} ano={ano} />}
        {aba === 'historico' && <VisaoComissoes mes={mes} ano={ano} />}
      </div>

      {/* Modal Abrir Fechamento */}
      <Dialog open={modalAbrir} onOpenChange={setModalAbrir}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir Novo Fechamento</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1">
              <Label>Mês</Label>
              <Input
                type="number"
                min={1}
                max={12}
                value={formMes}
                onChange={e => setFormMes(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Ano</Label>
              <Input
                type="number"
                min={2020}
                max={2100}
                value={formAno}
                onChange={e => setFormAno(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 px-1">
            O fechamento irá importar automaticamente as despesas recorrentes ativas.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAbrir(false)}>Cancelar</Button>
            <Button
              className="bg-fonti-primary hover:bg-fonti-primary-hover text-white"
              disabled={abrirFechamento.isPending}
              onClick={() => {
                abrirFechamento.mutate(
                  { mes: parseInt(formMes), ano: parseInt(formAno) },
                  {
                    onSuccess: () => {
                      setModalAbrir(false)
                      setData(new Date(parseInt(formAno), parseInt(formMes) - 1, 1))
                      setAba('fechamento')
                    },
                  }
                )
              }}
            >
              {abrirFechamento.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Abrir Fechamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
