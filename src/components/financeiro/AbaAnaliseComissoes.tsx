'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Search } from 'lucide-react'
import {
  useAnaliseComissoesMes,
  useAtualizarCgiManual,
  useAnaliseComissoesContratosMes,
} from '@/hooks/financeiro/useAnaliseComissoes'
import {
  type FinAnaliseComissaoLinha,
  type FinAnaliseComissaoContratoLinha,
  type FinResponsavelRegistro,
} from '@/types/financeiro'
import { formatarMoeda } from '@/lib/utils'

interface Props { mes: number; ano: number }

type SubAba = 'financiamento' | 'contratos'

export function AbaAnaliseComissoes({ mes, ano }: Props) {
  const [subAba, setSubAba] = useState<SubAba>('financiamento')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        <button
          onClick={() => setSubAba('financiamento')}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            subAba === 'financiamento' ? 'bg-white text-fonti-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Financiamento
        </button>
        <button
          onClick={() => setSubAba('contratos')}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            subAba === 'contratos' ? 'bg-white text-fonti-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Contratos
        </button>
      </div>

      {subAba === 'financiamento'
        ? <VisaoAnaliseComissoesFinanciamento mes={mes} ano={ano} />
        : <VisaoAnaliseComissoesContratos mes={mes} ano={ano} />}
    </div>
  )
}

const REGISTRO_LABEL: Record<FinResponsavelRegistro, string> = {
  fontinhas: 'Fontinhas',
  cliente: 'Cliente',
  corretor: 'Corretor',
}

function VisaoAnaliseComissoesFinanciamento({ mes, ano }: Props) {
  const { data, isLoading } = useAnaliseComissoesMes(mes, ano)
  const atualizarCgi = useAtualizarCgiManual()
  const linhas = data ?? []

  const [busca, setBusca] = useState('')

  const filtradas = linhas.filter(l =>
    !busca ||
    l.cliente_nome?.toLowerCase().includes(busca.toLowerCase()) ||
    l.cliente_cpf?.includes(busca) ||
    l.banco_nome?.toLowerCase().includes(busca.toLowerCase())
  )

  const totalComissao = filtradas.reduce((s, l) => s + l.comissao, 0)
  const totalFinal = filtradas.reduce((s, l) => s + (l.comissao - (l.cgi_manual ?? 0)), 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Contratos</p>
          <p className="text-lg font-semibold text-fonti-primary">{filtradas.length}</p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Comissão (cheia)</p>
          <p className="text-lg font-semibold text-fonti-primary">{formatarMoeda(totalComissao)}</p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Comissão final</p>
          <p className="text-lg font-semibold text-green-700">{formatarMoeda(totalFinal)}</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Buscar por cliente, CPF ou banco..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
      </div>

      <div className="rounded-lg border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs">Cliente</TableHead>
              <TableHead className="text-xs">CPF</TableHead>
              <TableHead className="text-xs">Banco</TableHead>
              <TableHead className="text-xs">Modalidade</TableHead>
              <TableHead className="text-xs text-right">Valor Financiado</TableHead>
              <TableHead className="text-xs">Comercial</TableHead>
              <TableHead className="text-xs text-right">Assessoria</TableHead>
              <TableHead className="text-xs">Registro</TableHead>
              <TableHead className="text-xs text-right">Comissão</TableHead>
              <TableHead className="text-xs text-right">Checagem</TableHead>
              <TableHead className="text-xs text-right">CGI 1%</TableHead>
              <TableHead className="text-xs text-right">Comissão Final</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={12} className="text-center py-8 text-gray-400 text-sm">Carregando...</TableCell></TableRow>
            ) : filtradas.length === 0 ? (
              <TableRow><TableCell colSpan={12} className="text-center py-8 text-gray-400 text-sm">Nenhum contrato emitido neste mês.</TableCell></TableRow>
            ) : (
              filtradas.map(l => (
                <LinhaAnaliseComissao key={l.id} linha={l} onSalvarCgi={v => atualizarCgi.mutate({ processo_id: l.processo_id, cgi_manual: v })} />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function LinhaAnaliseComissao({ linha, onSalvarCgi }: { linha: FinAnaliseComissaoLinha; onSalvarCgi: (v: number | null) => void }) {
  const [cgiInput, setCgiInput] = useState(linha.cgi_manual != null ? String(linha.cgi_manual) : '')
  const cgiAtual = linha.cgi_manual ?? 0
  const comissaoFinal = linha.comissao - cgiAtual

  return (
    <TableRow className="hover:bg-gray-50">
      <TableCell className="text-sm font-medium">{linha.cliente_nome || '—'}</TableCell>
      <TableCell className="text-sm text-gray-500">{linha.cliente_cpf || '—'}</TableCell>
      <TableCell>
        {linha.banco_nome ? (
          <span className="flex items-center gap-1 text-sm">
            {linha.banco_cor && <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: linha.banco_cor }} />}
            {linha.banco_nome}
          </span>
        ) : <span className="text-gray-400 text-sm">—</span>}
      </TableCell>
      <TableCell className="text-sm text-gray-600">{linha.modalidade ?? '—'}</TableCell>
      <TableCell className="text-right text-sm font-mono">
        {linha.valor_financiado != null ? formatarMoeda(linha.valor_financiado) : '—'}
      </TableCell>
      <TableCell className="text-sm text-gray-600">{linha.comercial_nome ?? '—'}</TableCell>
      <TableCell className="text-right text-sm font-mono">{formatarMoeda(linha.valor_assessoria)}</TableCell>
      <TableCell className="text-sm text-gray-600">
        {linha.responsavel_registro ? REGISTRO_LABEL[linha.responsavel_registro] : '—'}
      </TableCell>
      <TableCell className="text-right text-sm font-mono">{formatarMoeda(linha.comissao)}</TableCell>
      <TableCell className="text-right text-sm text-gray-500">{linha.percentual_comissao.toFixed(2)}%</TableCell>
      <TableCell className="text-right">
        <Input
          type="number"
          step="0.01"
          value={cgiInput}
          onChange={e => setCgiInput(e.target.value)}
          onBlur={() => {
            const v = cgiInput === '' ? null : parseFloat(cgiInput)
            if (v !== (linha.cgi_manual ?? null)) onSalvarCgi(v)
          }}
          className="h-8 w-28 text-right text-sm font-mono ml-auto"
          placeholder="0,00"
        />
      </TableCell>
      <TableCell className="text-right text-sm font-mono font-medium text-fonti-primary">{formatarMoeda(comissaoFinal)}</TableCell>
    </TableRow>
  )
}

const PROSPECTADO_POR_LABEL: Record<'fontinhas' | 'direto', string> = {
  fontinhas: 'Fontinhas',
  direto: 'Direto',
}

function VisaoAnaliseComissoesContratos({ mes, ano }: Props) {
  const { data, isLoading } = useAnaliseComissoesContratosMes(mes, ano)
  const linhas = data ?? []

  const [busca, setBusca] = useState('')

  const filtradas = linhas.filter(l =>
    !busca ||
    l.cliente_nome?.toLowerCase().includes(busca.toLowerCase()) ||
    l.cliente_cpf?.includes(busca)
  )

  const totalValor = filtradas.reduce((s, l) => s + (l.valor_contrato ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Contratos</p>
          <p className="text-lg font-semibold text-fonti-primary">{filtradas.length}</p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Valor total</p>
          <p className="text-lg font-semibold text-fonti-primary">{formatarMoeda(totalValor)}</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Buscar por cliente ou CPF..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
      </div>

      <div className="rounded-lg border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs">Cliente</TableHead>
              <TableHead className="text-xs">CPF</TableHead>
              <TableHead className="text-xs">Comercial</TableHead>
              <TableHead className="text-xs">Corretor</TableHead>
              <TableHead className="text-xs">Imobiliária</TableHead>
              <TableHead className="text-xs">Prospectado por</TableHead>
              <TableHead className="text-xs">Financiou</TableHead>
              <TableHead className="text-xs text-right">Valor</TableHead>
              <TableHead className="text-xs">Data de Recebimento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-gray-400 text-sm">Carregando...</TableCell></TableRow>
            ) : filtradas.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-gray-400 text-sm">Nenhum contrato pago neste mês.</TableCell></TableRow>
            ) : (
              filtradas.map(l => (
                <TableRow key={l.id} className="hover:bg-gray-50">
                  <TableCell className="text-sm font-medium">{l.cliente_nome || '—'}</TableCell>
                  <TableCell className="text-sm text-gray-500">{l.cliente_cpf || '—'}</TableCell>
                  <TableCell className="text-sm text-gray-600">{l.comercial_nome ?? '—'}</TableCell>
                  <TableCell className="text-sm text-gray-600">{l.corretor_nome ?? '—'}</TableCell>
                  <TableCell className="text-sm text-gray-600">{l.imobiliaria_nome ?? '—'}</TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {l.prospectado_por ? PROSPECTADO_POR_LABEL[l.prospectado_por] : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {l.financiou == null ? '—' : l.financiou ? 'Sim' : 'Não'}
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono">
                    {l.valor_contrato != null ? formatarMoeda(l.valor_contrato) : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {l.data_pagamento_contrato ? new Date(l.data_pagamento_contrato).toLocaleDateString('pt-BR') : '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
