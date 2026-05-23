'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useCriarFase, useAtualizarFase, MODULOS_FASES } from '../../_hooks/useFases'
import { toast } from 'sonner'
import type { Fase } from '@/types/configuracoes'

const schema = z.object({
  nome:              z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  descricao:         z.string().optional(),
  cor:               z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Cor inválida — use formato hex #RRGGBB'),
  prazo_dias:        z.number().int().positive().optional().nullable(),
  modulo:            z.string().min(1, 'Selecione o módulo'),
  notificar_cliente: z.boolean(),
  mensagem_cliente:  z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface FaseFormDrawerProps {
  aberto: boolean
  onFechar: () => void
  fase: Fase | null
  moduloInicial?: string
}

export function FaseFormDrawer({ aberto, onFechar, fase, moduloInicial = 'leads' }: FaseFormDrawerProps) {
  const criar    = useCriarFase()
  const atualizar = useAtualizarFase()

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { cor: '#C2AA6A', notificar_cliente: false, modulo: moduloInicial },
  })

  const notificar = watch('notificar_cliente')
  const corAtual  = watch('cor')
  const moduloAtual = watch('modulo')

  useEffect(() => {
    if (fase) {
      reset({
        nome:              fase.nome,
        descricao:         '',
        cor:               fase.cor ?? '#C2AA6A',
        prazo_dias:        fase.prazo_dias,
        modulo:            fase.modulo ?? moduloInicial,
        notificar_cliente: false,
        mensagem_cliente:  '',
      })
    } else {
      reset({ cor: '#C2AA6A', notificar_cliente: false, modulo: moduloInicial })
    }
  }, [fase, reset, moduloInicial])

  async function onSubmit(values: FormValues) {
    try {
      if (fase) {
        await atualizar.mutateAsync({
          id: fase.id,
          nome: values.nome,
          cor: values.cor,
          prazo_dias: values.prazo_dias ?? null,
          modulo: values.modulo,
        })
        toast.success('Fase atualizada com sucesso.')
      } else {
        await criar.mutateAsync({
          nome:             values.nome,
          cor:              values.cor,
          prazo_dias:       values.prazo_dias ?? null,
          modulo:           values.modulo,
          ordem:            999,
        })
        toast.success('Fase criada com sucesso.')
      }
      onFechar()
    } catch (err) {
      console.error('[FaseFormDrawer]', err)
      toast.error('Não foi possível salvar a fase. Tente novamente.')
    }
  }

  return (
    <Drawer open={aberto} onOpenChange={onFechar}>
      <DrawerContent className="max-w-md ml-auto h-full">
        <DrawerHeader>
          <DrawerTitle>{fase ? 'Editar fase' : 'Nova fase'}</DrawerTitle>
        </DrawerHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 px-6 py-4 flex-1 overflow-y-auto">

          {/* Módulo */}
          <div className="space-y-1.5">
            <Label>Módulo *</Label>
            <div className="flex gap-2 flex-wrap">
              {MODULOS_FASES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setValue('modulo', m.id)}
                  className={[
                    'flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-all flex-1 min-w-[120px]',
                    moduloAtual === m.id
                      ? 'border-[#253B29] bg-[#253B29] text-white'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white',
                  ].join(' ')}
                >
                  <span className="text-xs font-semibold">{m.label}</span>
                  <span className={[
                    'text-[10px] mt-0.5 leading-tight',
                    moduloAtual === m.id ? 'text-white/70' : 'text-gray-400',
                  ].join(' ')}>
                    {m.descricao}
                  </span>
                </button>
              ))}
            </div>
            {errors.modulo && <p className="text-xs text-red-500">{errors.modulo.message}</p>}
          </div>

          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome da fase *</Label>
            <Input id="nome" placeholder="Ex: Análise de Crédito" {...register('nome')} />
            {errors.nome && <p className="text-xs text-red-500">{errors.nome.message}</p>}
          </div>

          {/* Cor */}
          <div className="space-y-1.5">
            <Label htmlFor="cor">Cor do badge</Label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={corAtual}
                onChange={(e) => setValue('cor', e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border border-gray-200"
              />
              <Input id="cor" placeholder="#C2AA6A" {...register('cor')} className="font-mono" />
            </div>
            {errors.cor && <p className="text-xs text-red-500">{errors.cor.message}</p>}
          </div>

          {/* SLA */}
          <div className="space-y-1.5">
            <Label htmlFor="prazo_dias">SLA (prazo em dias)</Label>
            <Input
              id="prazo_dias"
              type="number"
              placeholder="Ex: 5"
              {...register('prazo_dias', { valueAsNumber: true })}
            />
          </div>

          {/* Notificação WhatsApp */}
          <div className="flex items-center justify-between">
            <Label htmlFor="notificar">Notificar cliente via WhatsApp</Label>
            <Switch
              id="notificar"
              checked={notificar}
              onCheckedChange={(v) => setValue('notificar_cliente', v)}
            />
          </div>

          {notificar && (
            <div className="space-y-1.5">
              <Label htmlFor="mensagem">Mensagem ao cliente</Label>
              <Textarea
                id="mensagem"
                placeholder="Olá {nome_cliente}! Seu processo avançou para: {nome_fase}."
                rows={4}
                {...register('mensagem_cliente')}
              />
              <p className="text-xs text-gray-400">
                Variáveis: {'{nome_cliente}'}, {'{nome_fase}'}, {'{data}'}
              </p>
            </div>
          )}

          <DrawerFooter className="px-0">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-[#253B29] hover:bg-[#C2AA6A] hover:text-[#253B29] text-white w-full"
            >
              {isSubmitting ? 'Salvando...' : fase ? 'Salvar alterações' : 'Criar fase'}
            </Button>
            <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  )
}
