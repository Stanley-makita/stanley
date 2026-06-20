'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useBancos } from '@/hooks/useBancos'
import { useAtualizarDadosProcesso } from '@/hooks/processos/useProcessos'
import { useComissoesPadrao } from '@/hooks/configuracoes/useComissoesPadrao'
import type { Processo } from '@/types/processos'

const MODALIDADES = [
  'SFI', 'SBPE', 'PMCMV', 'Pro_Cotista', 'CGI', 'Contrato', 'Consorcio',
] as const

const numField = z.number().or(z.nan()).nullable()

const SISTEMAS_AMORTIZACAO = [
  { value: 'SAC',   label: 'SAC — Sistema de Amortização Constante' },
  { value: 'PRICE', label: 'PRICE — Tabela Price' },
] as const

const INDEXADORES = [
  { value: 'TR',   label: 'TR — Taxa Referencial' },
  { value: 'IPCA', label: 'IPCA — Índice de Preços' },
] as const

const schema = z.object({
  banco_id: z.string().nullable(),
  modalidade: z.string().min(1),
  tem_assessoria: z.boolean(),
  valor_assessoria: numField,
  valor_financiado: numField,
  valor_entrada: numField,
  valor_imovel: numField,
  valor_recursos_proprios: numField,
  valor_fgts: numField,
  prazo_amortizacao_meses: z.number().int().positive().nullable().or(z.nan().transform(() => null)),
  dia_vencimento_parcela: z.number().int().min(1).max(28).nullable().or(z.nan().transform(() => null)),
  sistema_amortizacao: z.enum(['SAC', 'PRICE']).nullable(),
  indexador: z.enum(['TR', 'IPCA']).nullable(),
  financiar_despesas_cartorariais: z.boolean(),
})

type FormData = z.infer<typeof schema>

function normNum(v: number | null | undefined): number | null {
  if (v == null || isNaN(v)) return null
  return v
}

interface Props {
  aberto: boolean
  onFechar: () => void
  processo: Processo
}

export function EditarProcessoDrawer({ aberto, onFechar, processo }: Props) {
  const { data: bancos = [] } = useBancos()
  const { data: comissoesPadrao = [] } = useComissoesPadrao()
  const { mutateAsync, isPending } = useAtualizarDadosProcesso()
  const p = processo as any
  const [comissaoComercial, setComissaoComercial] = useState<number | null>((p.comissao_comercial as number | null) ?? null)
  const [comissaoEmpresa, setComissaoEmpresa] = useState<number | null>((p.comissao_empresa as number | null) ?? null)

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      banco_id: processo.banco_id,
      modalidade: processo.modalidade,
      tem_assessoria: processo.tem_assessoria,
      valor_assessoria: processo.valor_assessoria ?? null,
      valor_financiado: processo.valor_financiado ?? null,
      valor_entrada: processo.valor_entrada ?? null,
      valor_imovel: processo.valor_imovel ?? null,
      valor_recursos_proprios: p.valor_recursos_proprios ?? null,
      valor_fgts: p.valor_fgts ?? null,
      prazo_amortizacao_meses: p.prazo_amortizacao_meses ?? null,
      dia_vencimento_parcela: p.dia_vencimento_parcela ?? null,
      sistema_amortizacao: p.sistema_amortizacao ?? null,
      indexador: p.indexador ?? null,
      financiar_despesas_cartorariais: p.financiar_despesas_cartorariais ?? false,
    },
  })

  const temAssessoria = form.watch('tem_assessoria')

  useEffect(() => {
    if (aberto) {
      setComissaoComercial((p.comissao_comercial as number | null) ?? null)
      setComissaoEmpresa((p.comissao_empresa as number | null) ?? null)
      form.reset({
        banco_id: processo.banco_id,
        modalidade: processo.modalidade,
        tem_assessoria: processo.tem_assessoria,
        valor_assessoria: processo.valor_assessoria ?? null,
        valor_financiado: processo.valor_financiado ?? null,
        valor_entrada: processo.valor_entrada ?? null,
        valor_imovel: processo.valor_imovel ?? null,
        valor_recursos_proprios: p.valor_recursos_proprios ?? null,
        valor_fgts: p.valor_fgts ?? null,
        prazo_amortizacao_meses: p.prazo_amortizacao_meses ?? null,
        dia_vencimento_parcela: p.dia_vencimento_parcela ?? null,
        sistema_amortizacao: p.sistema_amortizacao ?? null,
        indexador: p.indexador ?? null,
        financiar_despesas_cartorariais: p.financiar_despesas_cartorariais ?? false,
      })
    }
  }, [aberto, processo, form])

  async function onSubmit(dados: FormData) {
    await mutateAsync({
      processoId: processo.id,
      banco_id: dados.banco_id || null,
      modalidade: dados.modalidade,
      tem_assessoria: dados.tem_assessoria,
      valor_assessoria: dados.tem_assessoria ? normNum(dados.valor_assessoria) : null,
      valor_financiado: normNum(dados.valor_financiado),
      valor_entrada: normNum(dados.valor_entrada),
      valor_imovel: normNum(dados.valor_imovel),
      comissao_comercial: comissaoComercial,
      comissao_empresa: comissaoEmpresa,
      valor_recursos_proprios: normNum(dados.valor_recursos_proprios),
      valor_fgts: normNum(dados.valor_fgts),
      prazo_amortizacao_meses: dados.prazo_amortizacao_meses ?? null,
      dia_vencimento_parcela: dados.dia_vencimento_parcela ?? null,
      sistema_amortizacao: dados.sistema_amortizacao ?? null,
      indexador: dados.indexador ?? null,
      financiar_despesas_cartorariais: dados.financiar_despesas_cartorariais,
    } as any)
    onFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(open) => { if (!open) onFechar() }}>
      <DialogContent className="max-h-[92svh] w-[calc(100vw-1rem)] max-w-md overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle className="text-fonti-primary">Dados do Negócio</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-5">
          {/* Banco */}
          <div className="space-y-1.5">
            <Label>Banco</Label>
            <Select
              value={form.watch('banco_id') ?? '__nenhum__'}
              onValueChange={(v) => {
                const bancoSelecionado = v === '__nenhum__' ? null : v
                form.setValue('banco_id', bancoSelecionado)
                if (bancoSelecionado) {
                  const cp = comissoesPadrao.find(c => c.banco_id === bancoSelecionado)
                  setComissaoComercial(cp?.comissao_comercial ?? null)
                  setComissaoEmpresa(cp?.comissao_empresa ?? null)
                } else {
                  setComissaoComercial(null)
                  setComissaoEmpresa(null)
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar banco" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__nenhum__">Nenhum</SelectItem>
                {bancos.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Modalidade */}
          <div className="space-y-1.5">
            <Label>Modalidade / Produto</Label>
            <Select
              value={form.watch('modalidade')}
              onValueChange={(v) => form.setValue('modalidade', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODALIDADES.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Valores */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Valor do Imóvel (R$)</Label>
              <Input type="number" placeholder="0" {...form.register('valor_imovel', { valueAsNumber: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor Financiado (R$)</Label>
              <Input type="number" placeholder="0" {...form.register('valor_financiado', { valueAsNumber: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>Entrada / Recursos Próprios (R$)</Label>
              <Input type="number" placeholder="0" {...form.register('valor_entrada', { valueAsNumber: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor FGTS (R$)</Label>
              <Input type="number" placeholder="0" {...form.register('valor_fgts', { valueAsNumber: true })} />
            </div>
          </div>

          {/* Condições de financiamento */}
          <div className="rounded-lg border border-gray-200 p-4 space-y-4">
            <p className="text-sm font-medium text-fonti-primary">Condições do Financiamento</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Prazo (meses)</Label>
                <Input
                  type="number"
                  placeholder="360"
                  min={1}
                  {...form.register('prazo_amortizacao_meses', { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Dia vencimento (1-28)</Label>
                <Input
                  type="number"
                  placeholder="5"
                  min={1}
                  max={28}
                  {...form.register('dia_vencimento_parcela', { valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Sistema de Amortização</Label>
              <Select
                value={form.watch('sistema_amortizacao') ?? '__nenhum__'}
                onValueChange={(v) => form.setValue('sistema_amortizacao', v === '__nenhum__' ? null : v as 'SAC' | 'PRICE')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__nenhum__">Não definido</SelectItem>
                  {SISTEMAS_AMORTIZACAO.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Indexador</Label>
              <Select
                value={form.watch('indexador') ?? '__nenhum__'}
                onValueChange={(v) => form.setValue('indexador', v === '__nenhum__' ? null : v as 'TR' | 'IPCA')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__nenhum__">Não definido</SelectItem>
                  {INDEXADORES.map((idx) => (
                    <SelectItem key={idx.value} value={idx.value}>{idx.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Label>Financiar despesas cartorárias</Label>
              <Switch
                checked={form.watch('financiar_despesas_cartorariais')}
                onCheckedChange={(v) => form.setValue('financiar_despesas_cartorariais', v)}
              />
            </div>
          </div>

          {/* Assessoria */}
          <div className="space-y-3 rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <Label>Com Assessoria</Label>
              <Switch
                checked={temAssessoria}
                onCheckedChange={(v) => form.setValue('tem_assessoria', v)}
              />
            </div>
            {temAssessoria && (
              <div className="space-y-1.5">
                <Label>Valor da Assessoria (R$)</Label>
                <Input
                  type="number"
                  placeholder="Deixe vazio se inclusa"
                  {...form.register('valor_assessoria', { valueAsNumber: true })}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
            <Button type="button" variant="outline" className="flex-1" onClick={onFechar}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-fonti-primary hover:bg-fonti-primary-hover text-white"
            >
              {isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
