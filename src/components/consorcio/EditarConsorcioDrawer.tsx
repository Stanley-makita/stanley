'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useEditarConsorcio } from '@/hooks/consorcio/useEditarConsorcio'
import { type Processo } from '@/types/processos'
import { Loader2 } from 'lucide-react'

const numField = z.number().or(z.nan()).nullable()

const schema = z.object({
  administradora:      z.string().nullable(),
  grupo_consorcio:     z.string().nullable(),
  cota_consorcio:      z.string().nullable(),
  valor_carta:         numField,
  parcela_consorcio:   numField,
  prazo_meses:         numField,
  credito_desejado:    numField,
  carta_sugerida:      numField,
  justificativa_carta: z.string().nullable(),
  bem_referencia_descricao:    z.string().nullable(),
  parcela_reduzida_percentual: numField,
  prazo_grupo_meses:           numField,
})

type FormData = z.infer<typeof schema>

function normNum(v: number | null | undefined): number | null {
  if (v == null || isNaN(v as number)) return null
  return v as number
}

interface Props {
  aberto: boolean
  onFechar: () => void
  processo: Processo
}

export function EditarConsorcioDrawer({ aberto, onFechar, processo }: Props) {
  const editar = useEditarConsorcio()

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      administradora:      processo.administradora ?? null,
      grupo_consorcio:     processo.grupo_consorcio ?? null,
      cota_consorcio:      processo.cota_consorcio ?? null,
      valor_carta:         processo.valor_carta ?? null,
      parcela_consorcio:   processo.parcela_consorcio ?? null,
      prazo_meses:         processo.prazo_meses ?? null,
      credito_desejado:    processo.credito_desejado ?? null,
      carta_sugerida:      processo.carta_sugerida ?? null,
      justificativa_carta: processo.justificativa_carta ?? null,
      bem_referencia_descricao:    processo.bem_referencia_descricao ?? null,
      parcela_reduzida_percentual: processo.parcela_reduzida_percentual ?? null,
      prazo_grupo_meses:           processo.prazo_grupo_meses ?? null,
    },
  })

  useEffect(() => {
    if (aberto) {
      reset({
        administradora:      processo.administradora ?? null,
        grupo_consorcio:     processo.grupo_consorcio ?? null,
        cota_consorcio:      processo.cota_consorcio ?? null,
        valor_carta:         processo.valor_carta ?? null,
        parcela_consorcio:   processo.parcela_consorcio ?? null,
        prazo_meses:         processo.prazo_meses ?? null,
        credito_desejado:    processo.credito_desejado ?? null,
        carta_sugerida:      processo.carta_sugerida ?? null,
        justificativa_carta: processo.justificativa_carta ?? null,
        bem_referencia_descricao:    processo.bem_referencia_descricao ?? null,
        parcela_reduzida_percentual: processo.parcela_reduzida_percentual ?? null,
        prazo_grupo_meses:           processo.prazo_grupo_meses ?? null,
      })
    }
  }, [aberto, processo, reset])

  async function onSubmit(data: FormData) {
    await editar.mutateAsync({
      processoId: processo.id,
      dados: {
        administradora:      data.administradora || null,
        grupo_consorcio:     data.grupo_consorcio || null,
        cota_consorcio:      data.cota_consorcio || null,
        valor_carta:         normNum(data.valor_carta),
        parcela_consorcio:   normNum(data.parcela_consorcio),
        prazo_meses:         normNum(data.prazo_meses),
        credito_desejado:    normNum(data.credito_desejado),
        carta_sugerida:      normNum(data.carta_sugerida),
        justificativa_carta: data.justificativa_carta || null,
        bem_referencia_descricao:    data.bem_referencia_descricao || null,
        parcela_reduzida_percentual: normNum(data.parcela_reduzida_percentual),
        prazo_grupo_meses:           normNum(data.prazo_grupo_meses),
      },
    })
    onFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar() }}>
      <DialogContent className="max-h-[90svh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-fonti-primary">Dados da Carta</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4">
            {/* Operação */}
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Operação</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Administradora</Label>
                <Input {...register('administradora')} placeholder="Ex: Porto Seguro" />
              </div>
              <div className="space-y-1.5">
                <Label>Grupo</Label>
                <Input {...register('grupo_consorcio')} placeholder="Ex: 0042" />
              </div>
              <div className="space-y-1.5">
                <Label>Cota</Label>
                <Input {...register('cota_consorcio')} placeholder="Ex: 015" />
              </div>
              <div className="space-y-1.5">
                <Label>Prazo (meses)</Label>
                <Input
                  type="number"
                  {...register('prazo_meses', { valueAsNumber: true })}
                  placeholder="Ex: 180"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Valor da carta</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...register('valor_carta', { valueAsNumber: true })}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Parcela mensal</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...register('parcela_consorcio', { valueAsNumber: true })}
                  placeholder="0,00"
                />
              </div>
            </div>

            {/* Bem de Referência — descrição curta usada nos cards de resumo,
                não é o cadastro cadastral completo de imóvel (BlocoImovel).
                Prazo/parcela aqui são valores de REFERÊNCIA geral do Negócio;
                cada cota na Lista de Cotas pode ter os seus próprios. */}
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-2">Bem de Referência</p>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input
                {...register('bem_referencia_descricao')}
                placeholder="Ex: Imóvel · R$ 432 mil"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Parcela reduzida (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...register('parcela_reduzida_percentual', { valueAsNumber: true })}
                  placeholder="Ex: 50"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Prazo do grupo (meses)</Label>
                <Input
                  type="number"
                  {...register('prazo_grupo_meses', { valueAsNumber: true })}
                  placeholder="Ex: 240"
                />
              </div>
            </div>

            {/* Objetivo */}
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-2">Objetivo do cliente</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Crédito desejado</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...register('credito_desejado', { valueAsNumber: true })}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Carta sugerida</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...register('carta_sugerida', { valueAsNumber: true })}
                  placeholder="0,00"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Justificativa da carta</Label>
              <Textarea
                {...register('justificativa_carta')}
                placeholder="Por que esta carta foi sugerida?"
                rows={3}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter className="mt-4 flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-fonti-primary hover:bg-fonti-primary-hover text-white"
              disabled={isSubmitting || editar.isPending}
            >
              {(isSubmitting || editar.isPending) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
