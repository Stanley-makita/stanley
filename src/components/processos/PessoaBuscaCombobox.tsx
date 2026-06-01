'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, UserPlus, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

export interface PessoaOpcao {
  id: string
  nome: string
  cpf: string | null
  email: string | null
  telefone: string | null
}

interface Props {
  pessoaSelecionada: PessoaOpcao | null
  onSelect: (pessoa: PessoaOpcao | null) => void
  onCriarPessoa: () => void
}

export function PessoaBuscaCombobox({ pessoaSelecionada, onSelect, onCriarPessoa }: Props) {
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<PessoaOpcao[]>([])
  const [carregando, setCarregando] = useState(false)
  const [aberto, setAberto] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!termo.trim() || termo.length < 2) {
      setResultados([])
      setAberto(false)
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setCarregando(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/pessoas?q=${encodeURIComponent(termo)}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        })
        if (!res.ok) return
        const json = await res.json()
        const pessoas: PessoaOpcao[] = (json.data ?? []).slice(0, 6).map((p: {
          id: string
          nome: string
          cpf: string | null
          email: string | null
          telefones?: { telefone: string; principal: boolean }[]
        }) => ({
          id: p.id,
          nome: p.nome,
          cpf: p.cpf ?? null,
          email: p.email ?? null,
          telefone: p.telefones?.find((t) => t.principal)?.telefone ?? p.telefones?.[0]?.telefone ?? null,
        }))
        setResultados(pessoas)
        setAberto(true)
      } catch {
        setResultados([])
      } finally {
        setCarregando(false)
      }
    }, 300)
  }, [termo])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function selecionar(pessoa: PessoaOpcao) {
    onSelect(pessoa)
    setTermo('')
    setAberto(false)
    setResultados([])
  }

  function limpar() {
    onSelect(null)
    setTermo('')
    setResultados([])
    setAberto(false)
  }

  if (pessoaSelecionada) {
    return (
      <div className="flex items-center gap-2 bg-[#E7E0C4]/30 border border-[#253B29]/20 rounded-lg px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#253B29] truncate">{pessoaSelecionada.nome}</p>
          {pessoaSelecionada.cpf && (
            <p className="text-xs text-gray-500">CPF: {pessoaSelecionada.cpf}</p>
          )}
        </div>
        <button
          type="button"
          onClick={limpar}
          className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          title="Remover cliente"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onFocus={() => resultados.length > 0 && setAberto(true)}
          placeholder="Buscar por nome ou CPF..."
          className="w-full pl-9 pr-9 h-9 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#253B29]/20 focus:border-[#253B29]/50 transition"
        />
        {carregando && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
        )}
      </div>

      {aberto && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {resultados.length > 0 && (
            <ul>
              {resultados.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => selecionar(p)}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0"
                  >
                    <p className="text-sm font-medium text-[#253B29]">{p.nome}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {[p.cpf, p.telefone].filter(Boolean).join(' · ') || 'Sem CPF ou telefone'}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => { setAberto(false); onCriarPessoa() }}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-[#253B29] hover:bg-[#E7E0C4]/40 transition-colors',
              resultados.length > 0 && 'border-t border-gray-100'
            )}
          >
            <UserPlus className="h-4 w-4 shrink-0" />
            {resultados.length === 0 && termo.trim()
              ? `Criar pessoa "${termo}"`
              : 'Criar nova pessoa'}
          </button>
        </div>
      )}

      {termo.length >= 2 && !carregando && !aberto && resultados.length === 0 && (
        <button
          type="button"
          onClick={onCriarPessoa}
          className="mt-1 w-full flex items-center gap-2 px-3 py-2 text-sm text-[#253B29] hover:bg-gray-50 border border-dashed border-gray-200 rounded-lg transition-colors"
        >
          <UserPlus className="h-4 w-4 shrink-0" />
          Não encontrado — criar nova pessoa
        </button>
      )}
    </div>
  )
}
