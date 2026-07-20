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
  Building2,
  User,
  Handshake,
  Plus,
  Trash2,
  Star,
  Loader2,
} from 'lucide-react'
import type {
  ProcessoCorretor,
  ProcessoImobiliaria,
  ProcessoParceiro,
} from '@/types/parceiros'
import {
  ModalAdicionarCorretor,
  ModalAdicionarImobiliaria,
  ModalAdicionarParceiro,
} from '@/components/parceiros/ModaisVincularParceiro'

// ── Props ────────────────────────────────────────────────────

interface BlocoParceirosProps {
  processoId: string
  readOnly?: boolean
}

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
    <div className="border border-gray-200 rounded-xl p-4 bg-white shadow-[var(--shadow-card)]">

      <h4 className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest border-b border-gray-100 pb-2 mb-3">
        Parceiros
      </h4>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

      {/* ── CORRETOR ── */}
      <div className="space-y-2 rounded-lg bg-gray-50 p-3">
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
      <div className="space-y-2 rounded-lg bg-gray-50 p-3">
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
      <div className="space-y-2 rounded-lg bg-gray-50 p-3">
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

      </div>{/* fim grid */}

      {/* ── MODAIS ── */}
      <ModalAdicionarCorretor
        open={modalCorretor}
        contexto="processo"
        entidadeId={processoId}
        onClose={() => setModalCorretor(false)}
        onAdded={carregarVinculos}
      />
      <ModalAdicionarImobiliaria
        open={modalImobiliaria}
        contexto="processo"
        entidadeId={processoId}
        onClose={() => setModalImobiliaria(false)}
        onAdded={carregarVinculos}
      />
      <ModalAdicionarParceiro
        open={modalParceiro}
        contexto="processo"
        entidadeId={processoId}
        onClose={() => setModalParceiro(false)}
        onAdded={carregarVinculos}
      />
    </div>
  )
}

