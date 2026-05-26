'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useBancos } from '@/hooks/useBancos'
import { useAtualizarDadosProcesso } from '@/hooks/processos/useProcessos'
import type { Processo } from '@/types/processos'

const MODALIDADES = [
  'SFI', 'SBPE', 'PMCMV', 'Pro_Cotista', 'CGI', 'Contrato', 'Consorcio',
] as const

const schema = z.object({
  banco_id: z.string().nullable(),
  modalidade: z.string().min(1),
  tem_assessoria: z.boolean(),
  valor_assessoria: z.coerce.number().nullable(),
  valor_financiado: z.coerce.number().nullable(),
  valor_entrada: z.coerce.number().nullable(),
  valor_imovel: z.coerce.number().nullable(),
})

type FormData = z.infer<typeof schema>

function parseMoeda(v: number | null): string {
  if (v == null) return ''
  return String(v)
}

interface Props {
  aberto: boolean
  onFechar: () => void
  processo: Processo
}

export function EditarProcessoDrawer({ aberto, onFechar, processo }: Props) {
  const { data: bancos = [] } = useBancos()
  const { mutateAsync, isPending } = useAtualizarDadosProcesso()

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
    },
  })

  const temAssessoria = form.watch('tem_assessoria')

  useEffect(() => {
    if (aberto) {
      form.reset({
        banco_id: processo.banco_id,
        modalidade: processo.modalidade,
        tem_assessoria: processo.tem_assessoria,
        valor_assessoria: processo.valor_assessoria ?? null,
        valor_financiado: processo.valor_financiado ?? null,
        valor_entrada: processo.valor_entrada ?? null,
        valor_imovel: processo.valor_imovel ?? null,
      })
    }
  }, [aberto, processo, form])

  async function onSubmit(dados: FormData) {
    await mutateAsync({
      processoId: processo.id,
      banco_id: dados.banco_id || null,
      modalidade: dados.modalidade,
      tem_assessoria: dados.tem_assessoria,
      valor_assessoria: dados.tem_assessoria ? (dados.valor_assessoria ?? null) : null,
      valor_financiado: dados.valor_financiado ?? null,
      valor_entrada: dados.valor_entrada ?? null,
      valor_imovel: dados.valor_imovel ?? null,
    })
    onFechar()
  }

  return (
    <Sheet open={aberto} onOpenChange={(open) => { if (!open) onFechar() }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-[#253B29]">Editar Processo</SheetTitle>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-5">
          {/* Banco */}
          <div className="space-y-1.5">
            <Label>Banco</Label>
            <Select
              value={form.watch('banco_id') ?? '__nenhum__'}
              onValueChange={(v) => form.setValue('banco_id', v === '__nenhum__' ? null : v)}
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor do Imóvel (R$)</Label>
              <Input
                type="number"
                placeholder="0"
                {...form.register('valor_imovel')}
                defaultValue={parseMoeda(processo.valor_imovel)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor Financiado (R$)</Label>
              <Input
                type="number"
                placeholder="0"
                {...form.register('valor_financiado')}
                defaultValue={parseMoeda(processo.valor_financiado)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Entrada (R$)</Label>
              <Input
                type="number"
                placeholder="0"
                {...form.register('valor_entrada')}
                defaultValue={parseMoeda(processo.valor_entrada)}
              />
            </div>
          </div>

          {/* Assessoria */}
          <div className="space-y-3 rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
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
                  {...form.register('valor_assessoria')}
                />
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onFechar}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-[#253B29] hover:bg-[#1a2b1e] text-white"
            >
              {isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
