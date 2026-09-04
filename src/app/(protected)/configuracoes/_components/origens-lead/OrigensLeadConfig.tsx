'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Plus, Pencil, PowerOff, Power } from 'lucide-react'
import {
  useTodasOrigensLead, useCriarOrigemLead, useRenomearOrigemLead,
  useDesativarOrigemLead, useReativarOrigemLead, type OrigemLead,
} from '@/hooks/leads/useOrigensLead'

export function OrigensLeadConfig() {
  const { data: origens = [], isLoading } = useTodasOrigensLead()
  const criar = useCriarOrigemLead()
  const renomear = useRenomearOrigemLead()
  const desativar = useDesativarOrigemLead()
  const reativar = useReativarOrigemLead()

  const [dialogCriar, setDialogCriar] = useState(false)
  const [dialogRenomear, setDialogRenomear] = useState<OrigemLead | null>(null)
  const [nomeCampo, setNomeCampo] = useState('')

  async function handleCriar() {
    const nome = nomeCampo.trim()
    if (!nome) return
    try {
      await criar.mutateAsync(nome)
      setDialogCriar(false)
      setNomeCampo('')
      toast.success(`Origem "${nome}" criada.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar origem.')
    }
  }

  async function handleRenomear() {
    if (!dialogRenomear) return
    const nome = nomeCampo.trim()
    if (!nome) return
    try {
      await renomear.mutateAsync({ id: dialogRenomear.id, nome })
      setDialogRenomear(null)
      setNomeCampo('')
      toast.success('Origem renomeada.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao renomear origem.')
    }
  }

  async function handleDesativar(origem: OrigemLead) {
    try {
      await desativar.mutateAsync(origem)
      toast.success(`Origem "${origem.nome}" desativada.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao desativar origem.')
    }
  }

  async function handleReativar(origem: OrigemLead) {
    try {
      await reativar.mutateAsync(origem.id)
      toast.success(`Origem "${origem.nome}" reativada.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao reativar origem.')
    }
  }

  if (isLoading) {
    return <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          As origens automáticas (com o selo "Automática") só têm o nome editável — são gravadas
          por integrações (site, WhatsApp, Instagram, Facebook, indicação) e nunca podem ser
          desativadas. As demais podem ser criadas, renomeadas e desativadas livremente.
        </p>
      </div>

      <Button
        size="sm"
        className="gap-1.5 bg-fonti-primary hover:bg-fonti-primary-hover text-white"
        onClick={() => { setNomeCampo(''); setDialogCriar(true) }}
      >
        <Plus className="h-3.5 w-3.5" />
        Nova origem
      </Button>

      <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
        {origens.map((origem) => (
          <div
            key={origem.id}
            className={`flex items-center justify-between gap-4 px-4 py-3 ${origem.ativo ? 'bg-white' : 'bg-gray-50 opacity-60'}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-800">{origem.nome}</span>
              {origem.sistema && (
                <Badge variant="outline" className="text-[10px] text-gray-500 border-gray-300">Automática</Badge>
              )}
              {!origem.ativo && (
                <Badge variant="outline" className="text-[10px] text-gray-400 border-gray-300">Inativa</Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-fonti-primary"
                title="Renomear"
                onClick={() => { setNomeCampo(origem.nome); setDialogRenomear(origem) }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {!origem.sistema && (
                origem.ativo ? (
                  <Button
                    variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                    title="Desativar" onClick={() => handleDesativar(origem)}
                  >
                    <PowerOff className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-green-600"
                    title="Reativar" onClick={() => handleReativar(origem)}
                  >
                    <Power className="h-3.5 w-3.5" />
                  </Button>
                )
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={dialogCriar} onOpenChange={setDialogCriar}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova origem de lead</DialogTitle>
            <DialogDescription>Aparece nas telas de preenchimento manual de Captação.</DialogDescription>
          </DialogHeader>
          <Input placeholder="Ex: Feira de Imóveis" value={nomeCampo} onChange={(e) => setNomeCampo(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogCriar(false)}>Cancelar</Button>
            <Button onClick={handleCriar} disabled={!nomeCampo.trim() || criar.isPending}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dialogRenomear} onOpenChange={(open) => !open && setDialogRenomear(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Renomear origem</DialogTitle>
          </DialogHeader>
          <Input placeholder="Nome da origem" value={nomeCampo} onChange={(e) => setNomeCampo(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogRenomear(null)}>Cancelar</Button>
            <Button onClick={handleRenomear} disabled={!nomeCampo.trim() || renomear.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
