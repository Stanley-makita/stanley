'use client'

// ============================================================
// components/parceiros/ModaisVincularParceiro.tsx
//
// Modais "Buscar existente / Cadastrar novo" de Corretor, Imobiliária/
// Construtora e Parceiro Comercial — compartilhados entre Processo (Negócio)
// e Lead (Captação), diferenciados por `contexto`.
// ============================================================

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { normalizarTelefone } from '@/lib/pessoa'
import type {
  Corretor,
  Imobiliaria,
  Parceiro,
  PapelCorretorProcesso,
  PapelImobiliariaProcesso,
} from '@/types/parceiros'

export type ContextoVinculo = 'lead' | 'processo'

const PAPEL_CORRETOR_OPTIONS: { value: PapelCorretorProcesso; label: string }[] = [
  { value: 'corretor_comprador', label: 'Corretor do Comprador' },
  { value: 'corretor_vendedor',  label: 'Corretor do Vendedor' },
  { value: 'corretor_parceiro',  label: 'Corretor Parceiro' },
]

const PAPEL_IMOBILIARIA_OPTIONS: { value: PapelImobiliariaProcesso; label: string }[] = [
  { value: 'imobiliaria', label: 'Imobiliária' },
  { value: 'construtora', label: 'Construtora' },
  { value: 'vendedora',   label: 'Vendedora' },
]

const TABELA_VINCULO_CORRETOR: Record<ContextoVinculo, string> = {
  processo: 'processo_corretores',
  lead: 'lead_corretores',
}
const TABELA_VINCULO_IMOBILIARIA: Record<ContextoVinculo, string> = {
  processo: 'processo_imobiliarias',
  lead: 'lead_imobiliarias',
}
const TABELA_VINCULO_PARCEIRO: Record<ContextoVinculo, string> = {
  processo: 'processo_parceiros',
  lead: 'lead_parceiros',
}
const COLUNA_ID: Record<ContextoVinculo, string> = {
  processo: 'processo_id',
  lead: 'lead_id',
}

function ehVinculoDuplicado(error: { code?: string } | null | undefined) {
  return error?.code === '23505'
}

// ============================================================
// Modal: Adicionar Corretor
// ============================================================

interface ModalCorretorProps {
  open: boolean
  contexto: ContextoVinculo
  entidadeId: string
  onClose: () => void
  onAdded: () => void
}

export function ModalAdicionarCorretor({ open, contexto, entidadeId, onClose, onAdded }: ModalCorretorProps) {
  const supabase = createClient()
  const [corretores, setCorretores] = useState<Corretor[]>([])
  const [corretorId, setCorretorId] = useState('')
  const [papel, setPapel] = useState<PapelCorretorProcesso>('corretor_comprador')
  const [novoNome, setNovoNome] = useState('')
  const [novoTelefone, setNovoTelefone] = useState('')
  const [modo, setModo] = useState<'buscar' | 'novo'>('buscar')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    supabase
      .from('corretores')
      .select('id, nome, telefone, creci, imobiliaria:imobiliarias(id, nome)')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => { if (data) setCorretores(data as unknown as Corretor[]) })
  }, [open, supabase])

  async function salvar() {
    if (saving) return
    setSaving(true)
    try {
      let id = corretorId

      if (modo === 'novo') {
        const { data, error } = await supabase
          .from('corretores')
          .insert({ nome: novoNome.trim(), telefone: novoTelefone.trim() ? normalizarTelefone(novoTelefone) : null })
          .select('id')
          .single()
        if (error || !data) {
          toast.error('Não foi possível cadastrar o corretor.')
          return
        }
        id = data.id
      }

      if (!id) return

      const vinculo: Record<string, unknown> = { [COLUNA_ID[contexto]]: entidadeId, corretor_id: id }
      if (contexto === 'processo') {
        vinculo.papel = papel
        vinculo.principal = false
      }

      const { error: vinculoError } = await supabase.from(TABELA_VINCULO_CORRETOR[contexto]).insert(vinculo)
      if (vinculoError) {
        if (ehVinculoDuplicado(vinculoError)) {
          toast.error('Este corretor já está vinculado.')
        } else {
          toast.error('Corretor cadastrado, mas o vínculo falhou. Tente vincular novamente.')
        }
        return
      }

      onAdded()
      onClose()
      resetForm()
    } finally {
      setSaving(false)
    }
  }

  function resetForm() {
    setCorretorId('')
    setPapel('corretor_comprador')
    setNovoNome('')
    setNovoTelefone('')
    setModo('buscar')
  }

  const podeSalvar = modo === 'buscar' ? !!corretorId : novoNome.trim().length > 1

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); resetForm() } }}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar Corretor</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="flex gap-2">
            <Button variant={modo === 'buscar' ? 'default' : 'outline'} size="sm"
              className={modo === 'buscar' ? 'bg-fonti-primary' : ''} onClick={() => setModo('buscar')}>
              Buscar existente
            </Button>
            <Button variant={modo === 'novo' ? 'default' : 'outline'} size="sm"
              className={modo === 'novo' ? 'bg-fonti-primary' : ''} onClick={() => setModo('novo')}>
              Cadastrar novo
            </Button>
          </div>

          {modo === 'buscar' ? (
            <div className="space-y-2">
              <Label>Corretor</Label>
              <Select value={corretorId} onValueChange={setCorretorId}>
                <SelectTrigger><SelectValue placeholder="Selecione o corretor…" /></SelectTrigger>
                <SelectContent>
                  {corretores.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}{c.imobiliaria ? ` — ${c.imobiliaria.nome}` : ' — Autônomo'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Nome do corretor" />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={novoTelefone} onChange={e => setNovoTelefone(e.target.value)} placeholder="(44) 99999-9999" />
              </div>
            </div>
          )}

          {contexto === 'processo' && (
            <div className="space-y-2">
              <Label>Papel no processo</Label>
              <Select value={papel} onValueChange={v => setPapel(v as PapelCorretorProcesso)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAPEL_CORRETOR_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { onClose(); resetForm() }}>Cancelar</Button>
            <Button className="bg-fonti-primary hover:bg-fonti-primary-hover" disabled={!podeSalvar || saving} onClick={salvar}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Adicionar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Modal: Adicionar Imobiliária / Construtora
// ============================================================

interface ModalImobiliariaProps {
  open: boolean
  contexto: ContextoVinculo
  entidadeId: string
  onClose: () => void
  onAdded: () => void
}

export function ModalAdicionarImobiliaria({ open, contexto, entidadeId, onClose, onAdded }: ModalImobiliariaProps) {
  const supabase = createClient()
  const [imobiliarias, setImobiliarias] = useState<Imobiliaria[]>([])
  const [imobiliariaId, setImobiliariaId] = useState('')
  const [papel, setPapel] = useState<PapelImobiliariaProcesso>('imobiliaria')
  const [novoNome, setNovoNome] = useState('')
  const [novoTipo, setNovoTipo] = useState<'imobiliaria' | 'construtora' | 'ambos'>('imobiliaria')
  const [modo, setModo] = useState<'buscar' | 'novo'>('buscar')
  const [saving, setSaving] = useState(false)

  const papelOptions = contexto === 'lead'
    ? PAPEL_IMOBILIARIA_OPTIONS.filter(o => o.value !== 'vendedora')
    : PAPEL_IMOBILIARIA_OPTIONS

  useEffect(() => {
    if (!open) return
    supabase.from('imobiliarias').select('id, nome, tipo').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setImobiliarias(data as unknown as Imobiliaria[]) })
  }, [open, supabase])

  useEffect(() => {
    if (contexto === 'lead' && papel === 'vendedora') setPapel('imobiliaria')
  }, [contexto, papel])

  async function salvar() {
    if (saving) return
    setSaving(true)
    try {
      let id = imobiliariaId
      if (modo === 'novo') {
        const { data, error } = await supabase
          .from('imobiliarias').insert({ nome: novoNome.trim(), tipo: novoTipo }).select('id').single()
        if (error || !data) {
          toast.error('Não foi possível cadastrar a imobiliária/construtora.')
          return
        }
        id = data.id
      }
      if (!id) return

      const vinculo = { [COLUNA_ID[contexto]]: entidadeId, imobiliaria_id: id, papel }
      const { error: vinculoError } = await supabase.from(TABELA_VINCULO_IMOBILIARIA[contexto]).insert(vinculo)
      if (vinculoError) {
        if (ehVinculoDuplicado(vinculoError)) {
          toast.error('Esta imobiliária/construtora já está vinculada nesse papel.')
        } else {
          toast.error('Empresa cadastrada, mas o vínculo falhou. Tente vincular novamente.')
        }
        return
      }

      onAdded(); onClose(); resetForm()
    } finally { setSaving(false) }
  }

  function resetForm() { setImobiliariaId(''); setPapel('imobiliaria'); setNovoNome(''); setNovoTipo('imobiliaria'); setModo('buscar') }
  const podeSalvar = modo === 'buscar' ? !!imobiliariaId : novoNome.trim().length > 1

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); resetForm() } }}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md">
        <DialogHeader><DialogTitle>Adicionar Imobiliária / Construtora</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex gap-2">
            <Button variant={modo === 'buscar' ? 'default' : 'outline'} size="sm"
              className={modo === 'buscar' ? 'bg-fonti-primary' : ''} onClick={() => setModo('buscar')}>Buscar existente</Button>
            <Button variant={modo === 'novo' ? 'default' : 'outline'} size="sm"
              className={modo === 'novo' ? 'bg-fonti-primary' : ''} onClick={() => setModo('novo')}>Cadastrar nova</Button>
          </div>
          {modo === 'buscar' ? (
            <div className="space-y-2">
              <Label>Imobiliária / Construtora</Label>
              <Select value={imobiliariaId} onValueChange={setImobiliariaId}>
                <SelectTrigger><SelectValue placeholder="Selecione a empresa…" /></SelectTrigger>
                <SelectContent>
                  {imobiliarias.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2"><Label>Nome *</Label>
                <Input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Nome da empresa" /></div>
              <div className="space-y-2"><Label>Tipo</Label>
                <Select value={novoTipo} onValueChange={v => setNovoTipo(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="imobiliaria">Imobiliária</SelectItem>
                    <SelectItem value="construtora">Construtora</SelectItem>
                    <SelectItem value="ambos">Imobiliária e Construtora</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div className="space-y-2"><Label>Papel {contexto === 'processo' ? 'no processo' : ''}</Label>
            <Select value={papel} onValueChange={v => setPapel(v as PapelImobiliariaProcesso)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {papelOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { onClose(); resetForm() }}>Cancelar</Button>
            <Button className="bg-fonti-primary hover:bg-fonti-primary-hover" disabled={!podeSalvar || saving} onClick={salvar}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Adicionar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Modal: Adicionar Parceiro Comercial
// ============================================================

interface ModalParceiroProps {
  open: boolean
  contexto: ContextoVinculo
  entidadeId: string
  onClose: () => void
  onAdded: () => void
}

export function ModalAdicionarParceiro({ open, contexto, entidadeId, onClose, onAdded }: ModalParceiroProps) {
  const supabase = createClient()
  const [parceiros, setParceiros] = useState<Parceiro[]>([])
  const [parceiroId, setParceiroId] = useState('')
  const [novoNome, setNovoNome] = useState('')
  const [novoTelefone, setNovoTelefone] = useState('')
  const [novoTipo, setNovoTipo] = useState<'pessoa_fisica' | 'empresa'>('pessoa_fisica')
  const [modo, setModo] = useState<'buscar' | 'novo'>('buscar')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    supabase.from('parceiros').select('id, nome, telefone, tipo').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setParceiros(data as unknown as Parceiro[]) })
  }, [open, supabase])

  async function salvar() {
    if (saving) return
    setSaving(true)
    try {
      let id = parceiroId
      if (modo === 'novo') {
        const { data, error } = await supabase
          .from('parceiros').insert({
            nome: novoNome.trim(),
            telefone: novoTelefone.trim() ? normalizarTelefone(novoTelefone) : null,
            tipo: novoTipo,
          })
          .select('id').single()
        if (error || !data) {
          toast.error('Não foi possível cadastrar o parceiro.')
          return
        }
        id = data.id
      }
      if (!id) return

      const vinculo = { [COLUNA_ID[contexto]]: entidadeId, parceiro_id: id }
      const { error: vinculoError } = await supabase.from(TABELA_VINCULO_PARCEIRO[contexto]).insert(vinculo)
      if (vinculoError) {
        if (ehVinculoDuplicado(vinculoError)) {
          toast.error('Este parceiro já está vinculado.')
        } else {
          toast.error('Parceiro cadastrado, mas o vínculo falhou. Tente vincular novamente.')
        }
        return
      }

      onAdded(); onClose(); resetForm()
    } finally { setSaving(false) }
  }

  function resetForm() { setParceiroId(''); setNovoNome(''); setNovoTelefone(''); setNovoTipo('pessoa_fisica'); setModo('buscar') }
  const podeSalvar = modo === 'buscar' ? !!parceiroId : novoNome.trim().length > 1

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); resetForm() } }}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md">
        <DialogHeader><DialogTitle>Adicionar Parceiro Comercial</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex gap-2">
            <Button variant={modo === 'buscar' ? 'default' : 'outline'} size="sm"
              className={modo === 'buscar' ? 'bg-fonti-primary' : ''} onClick={() => setModo('buscar')}>Buscar existente</Button>
            <Button variant={modo === 'novo' ? 'default' : 'outline'} size="sm"
              className={modo === 'novo' ? 'bg-fonti-primary' : ''} onClick={() => setModo('novo')}>Cadastrar novo</Button>
          </div>
          {modo === 'buscar' ? (
            <div className="space-y-2"><Label>Parceiro</Label>
              <Select value={parceiroId} onValueChange={setParceiroId}>
                <SelectTrigger><SelectValue placeholder="Selecione o parceiro…" /></SelectTrigger>
                <SelectContent>
                  {parceiros.map(p => <SelectItem key={p.id} value={p.id}>{p.nome} — {p.tipo === 'pessoa_fisica' ? 'PF' : 'PJ'}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2"><Label>Tipo</Label>
                <Select value={novoTipo} onValueChange={v => setNovoTipo(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pessoa_fisica">Pessoa Física</SelectItem>
                    <SelectItem value="empresa">Empresa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Nome *</Label>
                <Input value={novoNome} onChange={e => setNovoNome(e.target.value)}
                  placeholder={novoTipo === 'pessoa_fisica' ? 'Nome completo' : 'Razão social'} /></div>
              <div className="space-y-2"><Label>Telefone</Label>
                <Input value={novoTelefone} onChange={e => setNovoTelefone(e.target.value)} placeholder="(44) 99999-9999" /></div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { onClose(); resetForm() }}>Cancelar</Button>
            <Button className="bg-fonti-primary hover:bg-fonti-primary-hover" disabled={!podeSalvar || saving} onClick={salvar}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Adicionar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
