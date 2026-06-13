'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'

export interface ResultadoBusca {
  tipo: 'lead' | 'processo' | 'pessoa'
  id: string
  titulo: string
  subtitulo: string
  fase?: string
  faseCor?: string
}

// Fases "avançadas" — lead já virou processo, não aparece na busca
const FASES_LEAD_EXCLUIDAS = [
  'qualificado', 'documentação', 'documentacao',
  'em análise', 'em analise', 'aprovado',
  'em contratação', 'em contratacao', 'concluído', 'concluido',
]

function faseExcluida(nomeRaw: string | undefined): boolean {
  if (!nomeRaw) return false
  return FASES_LEAD_EXCLUIDAS.includes(nomeRaw.toLowerCase().trim())
}

export function useBuscaGlobal() {
  const { usuario } = useAuth()
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<ResultadoBusca[]>([])
  const [buscando, setBuscando] = useState(false)
  const [aberto, setAberto] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (termo.length < 2) {
      setResultados([])
      setAberto(false)
      return
    }

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      if (!usuario?.empresa_id) return
      setBuscando(true)
      try {
        const q = `%${termo}%`
        const empresa = usuario.empresa_id

        const [{ data: leadsData }, { data: pessoasData }, { data: telData }, { data: processosData }, { data: conjugeData }] = await Promise.all([
          // Leads ativos por nome, telefone ou cpf (com fase para filtrar client-side)
          supabase
            .from('leads')
            .select('id, nome, telefone, cpf, fase:fases!fase_id(nome, cor)')
            .eq('empresa_id', empresa)
            .is('deleted_at', null)
            .or(`nome.ilike.${q},telefone.ilike.${q},cpf.ilike.${q}`)
            .limit(10),

          // Pessoas ativas por nome ou cpf
          supabase
            .from('pessoas')
            .select('id, nome, cpf, email, pessoa_telefones!inner(telefone, principal, ativo)')
            .eq('empresa_id', empresa)
            .is('deleted_at', null)
            .or(`nome.ilike.${q},cpf.ilike.${q}`)
            .limit(5),

          // Pessoas por telefone (busca separada para suportar OR cross-table)
          supabase
            .from('pessoa_telefones')
            .select('pessoa_id, telefone, pessoas!inner(id, nome, cpf, email, deleted_at)')
            .eq('empresa_id', empresa)
            .eq('ativo', true)
            .ilike('telefone', q)
            .limit(5),

          // Processos em andamento (exclui reprovado e cancelado)
          supabase
            .from('processos')
            .select('id, nome_imovel, numero_processo, status_processo, banco:bancos!banco_id(nome), lead:leads!lead_id(nome), fase_atual:fases!fase_atual_id(nome, cor)')
            .eq('empresa_id', empresa)
            .is('deleted_at', null)
            .not('status_processo', 'in', '("reprovado","cancelado")')
            .or(`nome_imovel.ilike.${q},numero_processo.ilike.${q}`)
            .limit(5),

          // Leads encontrados via cônjuge vinculado
          supabase
            .from('leads')
            .select('id, nome, telefone, cpf, fase:fases!fase_id(nome, cor), conjuge_pessoa:pessoas!conjuge_pessoa_id(id, nome, cpf)')
            .eq('empresa_id', empresa)
            .is('deleted_at', null)
            .not('conjuge_pessoa_id', 'is', null)
            .limit(6),
        ])

        // Leads: mapear e filtrar fases avançadas client-side
        const leads: ResultadoBusca[] = (leadsData ?? [])
          .map((l: any) => {
            const faseNome = Array.isArray(l.fase) ? l.fase[0]?.nome : l.fase?.nome
            const faseCor  = Array.isArray(l.fase) ? l.fase[0]?.cor  : l.fase?.cor
            return { raw: l, faseNome, faseCor }
          })
          .filter(({ faseNome }) => !faseExcluida(faseNome))
          .slice(0, 6)
          .map(({ raw: l, faseNome, faseCor }) => ({
            tipo:      'lead' as const,
            id:        l.id,
            titulo:    l.nome,
            subtitulo: l.telefone + (l.cpf ? ` · ${l.cpf}` : ''),
            fase:      faseNome,
            faseCor,
          }))

        // Pessoas: mescla resultados deduplicando por id
        const pessoaMap = new Map<string, ResultadoBusca>()

        for (const p of (pessoasData ?? []) as any[]) {
          const tel = (p.pessoa_telefones ?? []).find((t: any) => t.principal && t.ativo)
            ?? (p.pessoa_telefones ?? []).find((t: any) => t.ativo)
          pessoaMap.set(p.id, {
            tipo:      'pessoa' as const,
            id:        p.id,
            titulo:    p.nome,
            subtitulo: [tel?.telefone, p.cpf, p.email].filter(Boolean).join(' · ') || 'Sem contato',
          })
        }

        for (const row of (telData ?? []) as any[]) {
          const p = Array.isArray(row.pessoas) ? row.pessoas[0] : row.pessoas
          if (!p || p.deleted_at || pessoaMap.has(p.id)) continue
          pessoaMap.set(p.id, {
            tipo:      'pessoa' as const,
            id:        p.id,
            titulo:    p.nome,
            subtitulo: [row.telefone, p.cpf, p.email].filter(Boolean).join(' · '),
          })
        }

        // Processos em andamento
        const processos: ResultadoBusca[] = (processosData ?? []).map((p: any) => {
          const leadNome  = Array.isArray(p.lead)       ? p.lead[0]?.nome       : p.lead?.nome
          const bancoNome = Array.isArray(p.banco)      ? p.banco[0]?.nome      : p.banco?.nome
          const faseNome  = Array.isArray(p.fase_atual) ? p.fase_atual[0]?.nome : p.fase_atual?.nome
          const faseCor   = Array.isArray(p.fase_atual) ? p.fase_atual[0]?.cor  : p.fase_atual?.cor
          const partes = [p.numero_processo, bancoNome].filter(Boolean).join(' · ')
          return {
            tipo:      'processo' as const,
            id:        p.id,
            titulo:    p.nome_imovel ?? leadNome ?? 'Processo',
            subtitulo: leadNome ? `${leadNome}${partes ? ' · ' + partes : ''}` : partes || '—',
            fase:      faseNome,
            faseCor,
          }
        })

        // Leads encontrados via cônjuge: filtrar client-side pelo termo
        const termoLower = termo.toLowerCase()
        const leadsViaConjuge: ResultadoBusca[] = (conjugeData ?? [])
          .filter((l: any) => {
            const c = Array.isArray(l.conjuge_pessoa) ? l.conjuge_pessoa[0] : l.conjuge_pessoa
            if (!c) return false
            return (
              c.nome?.toLowerCase().includes(termoLower) ||
              c.cpf?.includes(termo.replace(/\D/g, ''))
            )
          })
          .filter((l: any) => {
            const faseNome = Array.isArray(l.fase) ? l.fase[0]?.nome : l.fase?.nome
            return !faseExcluida(faseNome)
          })
          .map((l: any) => {
            const c = Array.isArray(l.conjuge_pessoa) ? l.conjuge_pessoa[0] : l.conjuge_pessoa
            const faseNome = Array.isArray(l.fase) ? l.fase[0]?.nome : l.fase?.nome
            const faseCor  = Array.isArray(l.fase) ? l.fase[0]?.cor  : l.fase?.cor
            // Não duplicar com leads já encontrados pela query principal
            return {
              tipo:      'lead' as const,
              id:        l.id,
              titulo:    l.nome,
              subtitulo: `via cônjuge: ${c?.nome ?? ''}`,
              fase:      faseNome,
              faseCor,
            }
          })
          .filter((r: ResultadoBusca) => !leads.find(l => l.id === r.id))

        const todas = [...leads, ...leadsViaConjuge, ...Array.from(pessoaMap.values()), ...processos]
        setResultados(todas)
        setAberto(todas.length > 0)
      } finally {
        setBuscando(false)
      }
    }, 280)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [termo, usuario?.empresa_id])

  function limpar() {
    setTermo('')
    setResultados([])
    setAberto(false)
  }

  return { termo, setTermo, resultados, buscando, aberto, setAberto, limpar }
}
