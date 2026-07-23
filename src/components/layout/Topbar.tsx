'use client'

import { useRef, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Loader2, User, Users, FileText, Menu, Lock } from 'lucide-react'
import { useBuscaGlobal, type ResultadoBusca } from '@/hooks/busca/useBuscaGlobal'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { SinoNotificacoes } from './SinoNotificacoes'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

function iniciais(nome: string) {
  return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

interface TopbarProps {
  onMenuClick?: () => void
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const router = useRouter()
  const { data: usuario } = useUsuarioAtual()
  const { termo, setTermo, resultados, buscando, aberto, setAberto, limpar } = useBuscaGlobal()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  // Pessoa fora da carteira do comercial que buscou — resumo mínimo em vez
  // de navegar direto pro cadastro (ver busca_pessoas_resumo, 20260725_187).
  const [pessoaResumo, setPessoaResumo] = useState<ResultadoBusca | null>(null)

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Atalho global: Ctrl+K / Cmd+K para focar busca
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  function handleSelect(item: ResultadoBusca) {
    // Pessoa fora da carteira (situacao vem só da RPC pra quem é comercial):
    // nunca navega direto pro cadastro — mostra o resumo mínimo.
    if (item.tipo === 'pessoa' && item.situacao && item.situacao !== 'minha_carteira') {
      setPessoaResumo(item)
      setAberto(false)
      return
    }
    limpar()
    if (item.tipo === 'lead')    router.push(`/leads?open=${item.id}`)
    else if (item.tipo === 'pessoa') router.push(`/pessoas/${item.id}`)
    else router.push(`/processos/${item.id}`)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { limpar(); inputRef.current?.blur() }
    if (e.key === 'Enter' && resultados.length > 0) {
      handleSelect(resultados[0])
    }
  }

  return (
    <header className="h-16 border-b border-gray-100 shadow-sm bg-white flex items-center px-4 md:px-6 gap-3 md:gap-4 shrink-0 z-30">
      <button
        type="button"
        onClick={onMenuClick}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Busca global */}
      <div ref={wrapperRef} className="relative min-w-0 flex-1 max-w-md">
        <div className="relative">
          {buscando
            ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin pointer-events-none" />
            : <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          }
          <input
            ref={inputRef}
            type="text"
            placeholder="Busque em qualquer lugar..."
            value={termo}
            onChange={e => setTermo(e.target.value)}
            onFocus={() => { if (resultados.length > 0) setAberto(true) }}
            onKeyDown={handleKeyDown}
            className="w-full h-9 pl-9 pr-16 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:bg-white focus:border-fonti-primary focus:ring-1 focus:ring-fonti-primary/20 transition-all placeholder:text-gray-400"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-0.5 text-xs text-gray-300 font-mono">
            <span>⌘</span><span>K</span>
          </kbd>
        </div>

        {/* Dropdown de resultados */}
        {aberto && resultados.length > 0 && (() => {
          const leads     = resultados.filter(r => r.tipo === 'lead')
          const pessoas   = resultados.filter(r => r.tipo === 'pessoa')
          const processos = resultados.filter(r => r.tipo === 'processo')

          function ItemLinha({ item }: { item: ResultadoBusca }) {
            const foraCarteira = item.tipo === 'pessoa' && item.situacao && item.situacao !== 'minha_carteira'
            return (
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                onMouseDown={e => { e.preventDefault(); handleSelect(item) }}
              >
                {item.tipo === 'pessoa' ? (
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 relative">
                    <Users className="h-4 w-4 text-blue-600" />
                    {foraCarteira && (
                      <Lock className="h-3 w-3 text-gray-400 absolute -bottom-0.5 -right-0.5 bg-white rounded-full p-[1px]" />
                    )}
                  </div>
                ) : item.tipo === 'processo' ? (
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-amber-600" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-fonti-primary flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-white">{iniciais(item.titulo)}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.titulo}</p>
                  <p className="text-xs text-gray-400 truncate">{item.subtitulo}</p>
                </div>
                {item.fase && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium text-white shrink-0"
                    style={{ backgroundColor: item.faseCor ?? 'var(--fonti-primary)' }}
                  >
                    {item.fase}
                  </span>
                )}
              </button>
            )
          }

          return (
            <div className="absolute top-full mt-1.5 left-0 right-0 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden z-50">
              {leads.length > 0 && (
                <>
                  <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Leads</p>
                  </div>
                  <ul>{leads.map(item => <li key={item.id}><ItemLinha item={item} /></li>)}</ul>
                </>
              )}
              {pessoas.length > 0 && (
                <>
                  <div className={cn('px-3 py-1.5 border-b border-gray-100 bg-gray-50', leads.length > 0 && 'border-t')}>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Pessoas</p>
                  </div>
                  <ul>{pessoas.map(item => <li key={item.id}><ItemLinha item={item} /></li>)}</ul>
                </>
              )}
              {processos.length > 0 && (
                <>
                  <div className={cn('px-3 py-1.5 border-b border-gray-100 bg-gray-50', (leads.length > 0 || pessoas.length > 0) && 'border-t')}>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Processos</p>
                  </div>
                  <ul>{processos.map(item => <li key={item.id}><ItemLinha item={item} /></li>)}</ul>
                </>
              )}
              <div className="px-3 py-1.5 border-t border-gray-100 bg-gray-50">
                <p className="text-xs text-gray-400">Enter para abrir o primeiro · Esc para fechar</p>
              </div>
            </div>
          )
        })()}

        {/* Sem resultados */}
        {aberto && termo.length >= 2 && !buscando && resultados.length === 0 && (
          <div className="absolute top-full mt-1.5 left-0 right-0 bg-white rounded-xl border border-gray-200 shadow-lg z-50 px-4 py-4 text-center">
            <p className="text-sm text-gray-400">Nenhum resultado para <strong>&ldquo;{termo}&rdquo;</strong></p>
          </div>
        )}
      </div>

      {/* Espaço flex */}
      <div className="flex-1" />

      {/* Notificações + perfil */}
      <div className="flex items-center gap-3">
        <SinoNotificacoes />

        {/* Avatar do usuário */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-fonti-primary flex items-center justify-center">
            {usuario?.nome
              ? <span className="text-xs font-bold text-white">{iniciais(usuario.nome)}</span>
              : <User className="h-4 w-4 text-white" />
            }
          </div>
          {usuario?.nome && (
            <span className="text-sm font-medium text-gray-700 hidden lg:block max-w-[120px] truncate">
              {usuario.nome.split(' ')[0]}
            </span>
          )}
        </div>
      </div>

      {/* Resumo mínimo de Pessoa fora da carteira — nunca abre o cadastro completo */}
      <Dialog open={!!pessoaResumo} onOpenChange={(v) => { if (!v) setPessoaResumo(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-fonti-primary text-base">{pessoaResumo?.titulo}</DialogTitle>
          </DialogHeader>
          {pessoaResumo?.situacao === 'ativo_outro_comercial' ? (
            <div className="space-y-3 text-sm text-gray-600">
              <p>
                Este cliente possui atendimento ativo com{' '}
                <strong>{pessoaResumo.responsavelAtual ?? 'outro comercial'}</strong>.
                Você não tem acesso aos dados desta carteira.
              </p>
              <p className="text-xs text-gray-400">
                {pessoaResumo.negociosAndamento ?? 0} negócio(s) em andamento ·{' '}
                {pessoaResumo.negociosConcluidos ?? 0} concluído(s)
              </p>
            </div>
          ) : (
            <div className="space-y-3 text-sm text-gray-600">
              <p>Sem atendimento ativo — só histórico ou negócios já concluídos.</p>
              <p className="text-xs text-gray-400">
                {pessoaResumo?.negociosAndamento ?? 0} negócio(s) em andamento ·{' '}
                {pessoaResumo?.negociosConcluidos ?? 0} concluído(s)
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </header>
  )
}
