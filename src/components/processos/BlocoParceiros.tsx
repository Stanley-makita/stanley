'use client'

// ============================================================
// components/processos/BlocoParceiros.tsx
//
// Bloco "PARCEIROS" no drawer/formulário do processo.
// Gerencia Corretor, Imobiliária/Construtora e Parceiro Comercial.
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import {
  Building2,
  User,
  Handshake,
  Plus,
  Trash2,
  Star,
  Loader2,
} from 'lucide-react'
import type {
  Corretor,
  Imobiliaria,
  Parceiro,
  ProcessoCorretor,
  ProcessoImobiliaria,
  ProcessoParceiro,
  PapelCorretorProcesso,
  PapelImobiliariaProcesso,
} from '@/types/parceiros'

// ── Props ────────────────────────────────────────────────────

interface BlocoParceirosProps {
  processoId: string
  readOnly?: boolean
}

// ── Helpers ──────────────────────────────────────────────────

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

// ── Componente principal ─────────────────────────────────────

export function BlocoParceiros({ processoId, readOnly = false }: BlocoParceirosProps) {
  const supabase = createClient()

  // Estado dos vínculos
  const [corretores,    setCorretores]    = useState<ProcessoCorretor[]>([])
  const [imobiliarias,  setImobiliarias]  = useState<ProcessoImobiliaria[]>([])
  const [parceiros,     setParceiros]     = useState<ProcessoParceiro[]>([])
  const [loading,     setLoading]     = useState(true)

  // Estado dos modais
  const [modalCorretor,    setModalCorretor]    = useState(false)
  const [modalImobiliaria, setModalImobiliaria] = useState(false)
  const [modalParceiro,    setModalParceiro]    = useState(false)

  // ── Busca os vínculos existentes ──────────────────────────

  const carregarVinculos = useCallback(async () => {
    setLoading(true)
    const [resCorr, resEmp, resPar] = await Promise.all([
      supabase
        .from('processo_corretores')
        .select('*, corretor:corretores(id, nome, telefone, creci, imobiliaria:imobiliarias(id, nome))')
        .eq('processo_id', processoId),
      supabase
        .from('processo_imobiliarias')
        .select('*, imobiliaria:imobiliarias(id, nome, tipo)')
        .eq('processo_id', processoId),
      supabase
        .from('processo_parceiros')
        .select('*, parceiro:parceiros(id, nome, telefone, tipo)')
        .eq('processo_id', processoId),
    ])
    if (resCorr.data) setCorretores(resCorr.data as unknown as ProcessoCorretor[])
    if (resEmp.data)  setImobiliarias(resEmp.data as unknown as ProcessoImobiliaria[])
    if (resPar.data)  setParceiros(resPar.data as unknown as ProcessoParceiro[])
    setLoading(false)
  }, [processoId, supabase])

  useEffect(() => { carregarVinculos() }, [carregarVinculos])

  // ── Remoções ──────────────────────────────────────────────

  async function removerCorretor(id: string) {
    await supabase.from('processo_corretores').delete().eq('id', id)
    setCorretores(prev => prev.filter(c => c.id !== id))
  }

  async function removerImobiliaria(id: string) {
    await supabase.from('processo_imobiliarias').delete().eq('id', id)
    setImobiliarias(prev => prev.filter(e => e.id !== id))
  }

  async function removerParceiro(id: string) {
    await supabase.from('processo_parceiros').delete().eq('id', id)
    setParceiros(prev => prev.filter(p => p.id !== id))
  }

  async function tornarPrincipal(vinculoId: string) {
    await supabase
      .from('processo_corretores')
      .update({ principal: false })
      .eq('processo_id', processoId)
    await supabase
      .from('processo_corretores')
      .update({ principal: true })
      .eq('id', vinculoId)
    setCorretores(prev =>
      prev.map(c => ({ ...c, principal: c.id === vinculoId }))
    )
  }

  // ── Render ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando parceiros…
      </div>
    )
  }

  return (
    <div className="space-y-5">

      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Parceiros
      </p>

      {/* ── CORRETOR ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" /> Corretor
          </span>
          {!readOnly && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-fonti-primary"
              onClick={() => setModalCorretor(true)}
            >
              <Plus className="h-3 w-3" /> Adicionar
            </Button>
          )}
        </div>

        {corretores.length === 0 ? (
          <p className="text-xs text-muted-foreground italic pl-1">Nenhum corretor vinculado</p>
        ) : (
          <div className="space-y-1.5">
            {corretores.map(vc => (
              <div
                key={vc.id}
                className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{vc.corretor?.nome}</p>
                    {vc.corretor?.imobiliaria && (
                      <p className="text-xs text-muted-foreground truncate">
                        {(vc.corretor.imobiliaria as any).nome}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {vc.principal && (
                    <Badge className="bg-fonti-primary text-white text-xs">Principal</Badge>
                  )}
                  {!readOnly && (
                    <>
                      {!vc.principal && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-fonti-primary"
                          title="Tornar principal"
                          onClick={() => tornarPrincipal(vc.id)}
                        >
                          <Star className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => removerCorretor(vc.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── IMOBILIÁRIA / CONSTRUTORA ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> Imobiliária / Construtora
          </span>
          {!readOnly && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-fonti-primary"
              onClick={() => setModalImobiliaria(true)}
            >
              <Plus className="h-3 w-3" /> Adicionar
            </Button>
          )}
        </div>

        {imobiliarias.length === 0 ? (
          <p className="text-xs text-muted-foreground italic pl-1">Nenhuma empresa vinculada</p>
        ) : (
          <div className="space-y-1.5">
            {imobiliarias.map(ve => (
              <div
                key={ve.id}
                className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{ve.imobiliaria?.nome}</p>
                    <p className="text-xs text-muted-foreground capitalize">{ve.papel}</p>
                  </div>
                </div>
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 ml-2 text-muted-foreground hover:text-destructive"
                    onClick={() => removerImobiliaria(ve.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── PARCEIRO COMERCIAL ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Handshake className="h-3.5 w-3.5" /> Parceiro Comercial
          </span>
          {!readOnly && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-fonti-primary"
              onClick={() => setModalParceiro(true)}
            >
              <Plus className="h-3 w-3" /> Adicionar
            </Button>
          )}
        </div>

        {parceiros.length === 0 ? (
          <p className="text-xs text-muted-foreground italic pl-1">Nenhum parceiro comissionado</p>
        ) : (
          <div className="space-y-1.5">
            {parceiros.map(vp => (
              <div
                key={vp.id}
                className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Handshake className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{vp.parceiro?.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {vp.parceiro?.tipo === 'pessoa_fisica' ? 'Pessoa Física' : 'Empresa'}
                    </p>
                  </div>
                </div>
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 ml-2 text-muted-foreground hover:text-destructive"
                    onClick={() => removerParceiro(vp.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── MODAIS ── */}
      <ModalAdicionarCorretor
        open={modalCorretor}
        processoId={processoId}
        onClose={() => setModalCorretor(false)}
        onAdded={carregarVinculos}
      />
      <ModalAdicionarImobiliaria
        open={modalImobiliaria}
        processoId={processoId}
        onClose={() => setModalImobiliaria(false)}
        onAdded={carregarVinculos}
      />
      <ModalAdicionarParceiro
        open={modalParceiro}
        processoId={processoId}
        onClose={() => setModalParceiro(false)}
        onAdded={carregarVinculos}
      />
    </div>
  )
}

// ============================================================
// Modal: Adicionar Corretor
// ============================================================

interface ModalCorretorProps {
  open: boolean
  processoId: string
  onClose: () => void
  onAdded: () => void
}

function ModalAdicionarCorretor({ open, processoId, onClose, onAdded }: ModalCorretorProps) {
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
      .select('id, nome, telefone, creci, empresa:empresas(id, nome)')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => { if (data) setCorretores(data as unknown as Corretor[]) })
  }, [open, supabase])

  async function salvar() {
    setSaving(true)
    try {
      let id = corretorId

      if (modo === 'novo') {
        const { data, error } = await supabase
          .from('corretores')
          .insert({ nome: novoNome.trim(), telefone: novoTelefone.trim() || null })
          .select('id')
          .single()
        if (error || !data) throw error
        id = data.id
      }

      if (!id) return

      await supabase.from('processo_corretores').insert({
        processo_id: processoId,
        corretor_id: id,
        papel,
        principal: false,
      })

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
      <DialogContent className="max-w-md">
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
                      {c.nome}{c.imobiliaria ? ` — ${(c.imobiliaria as any).nome}` : ' — Autônomo'}
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

          <div className="space-y-2">
            <Label>Papel no processo</Label>
            <Select value={papel} onValueChange={v => setPapel(v as PapelCorretorProcesso)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAPEL_CORRETOR_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
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
// Modal: Adicionar Empresa (Imobiliária / Construtora)
// ============================================================

interface ModalImobiliariaProps {
  open: boolean
  processoId: string
  onClose: () => void
  onAdded: () => void
}

function ModalAdicionarImobiliaria({ open, processoId, onClose, onAdded }: ModalImobiliariaProps) {
  const supabase = createClient()
  const [imobiliarias, setImobiliarias] = useState<Imobiliaria[]>([])
  const [imobiliariaId, setImobiliariaId] = useState('')
  const [papel, setPapel] = useState<PapelImobiliariaProcesso>('imobiliaria')
  const [novoNome, setNovoNome] = useState('')
  const [novoTipo, setNovoTipo] = useState<'imobiliaria' | 'construtora' | 'ambos'>('imobiliaria')
  const [modo, setModo] = useState<'buscar' | 'novo'>('buscar')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    supabase.from('imobiliarias').select('id, nome, tipo').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setImobiliarias(data as unknown as Imobiliaria[]) })
  }, [open, supabase])

  async function salvar() {
    setSaving(true)
    try {
      let id = imobiliariaId
      if (modo === 'novo') {
        const { data, error } = await supabase
          .from('imobiliarias').insert({ nome: novoNome.trim(), tipo: novoTipo }).select('id').single()
        if (error || !data) throw error
        id = data.id
      }
      if (!id) return
      await supabase.from('processo_imobiliarias').insert({ processo_id: processoId, imobiliaria_id: id, papel })
      onAdded(); onClose(); resetForm()
    } finally { setSaving(false) }
  }

  function resetForm() { setImobiliariaId(''); setPapel('imobiliaria'); setNovoNome(''); setNovoTipo('imobiliaria'); setModo('buscar') }
  const podeSalvar = modo === 'buscar' ? !!imobiliariaId : novoNome.trim().length > 1

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); resetForm() } }}>
      <DialogContent className="max-w-md">
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
          <div className="space-y-2"><Label>Papel no processo</Label>
            <Select value={papel} onValueChange={v => setPapel(v as PapelImobiliariaProcesso)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAPEL_IMOBILIARIA_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
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
  processoId: string
  onClose: () => void
  onAdded: () => void
}

function ModalAdicionarParceiro({ open, processoId, onClose, onAdded }: ModalParceiroProps) {
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
    setSaving(true)
    try {
      let id = parceiroId
      if (modo === 'novo') {
        const { data, error } = await supabase
          .from('parceiros').insert({ nome: novoNome.trim(), telefone: novoTelefone.trim() || null, tipo: novoTipo })
          .select('id').single()
        if (error || !data) throw error
        id = data.id
      }
      if (!id) return
      await supabase.from('processo_parceiros').insert({ processo_id: processoId, parceiro_id: id })
      onAdded(); onClose(); resetForm()
    } finally { setSaving(false) }
  }

  function resetForm() { setParceiroId(''); setNovoNome(''); setNovoTelefone(''); setNovoTipo('pessoa_fisica'); setModo('buscar') }
  const podeSalvar = modo === 'buscar' ? !!parceiroId : novoNome.trim().length > 1

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); resetForm() } }}>
      <DialogContent className="max-w-md">
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
