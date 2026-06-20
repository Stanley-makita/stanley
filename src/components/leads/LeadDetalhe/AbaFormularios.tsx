'use client'

import { useState } from 'react'
import { FileDown, ExternalLink, Loader2, CheckSquare, Square, FileText, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import type { Lead } from '@/types/leads'
import { cn } from '@/lib/utils'

interface Props {
  lead: Lead
}

const BANCOS = [
  'Caixa Econômica Federal', 'Bradesco', 'Itaú', 'Santander', 'Banco do Brasil',
  'BTG Pactual', 'Sicredi', 'Inter', 'C6 Bank', 'Pan', 'Outro',
]

type FormDef = { nomeArquivo: string; label: string }

const ATALHOS = [
  {
    titulo: 'Autenticidade de CNH / Habilitação',
    descricao: 'Consultar dados e autenticidade via SENATRAN (requer Gov.br)',
    url: 'https://www.gov.br/pt-br/servicos/obter-cnh',
    icone: '🪪',
  },
  {
    titulo: 'Validar Assinatura Digital',
    descricao: 'Validador ITI — sem necessidade de login',
    url: 'https://validar.iti.gov.br',
    icone: '✅',
  },
  {
    titulo: 'Consultar FGTS',
    descricao: 'Saldo e extratos FGTS (requer Gov.br)',
    url: 'https://www.fgts.gov.br',
    icone: '🏦',
  },
  {
    titulo: 'Consulta Certidão Negativa Federal',
    descricao: 'Certidão de regularidade fiscal — Receita Federal',
    url: 'https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/PF/Emitir',
    icone: '📋',
  },
]

function dadosIncompletos(lead: Lead) {
  const faltando: string[] = []
  if (!lead.nome?.trim())             faltando.push('nome completo')
  if (!lead.cpf?.trim())              faltando.push('CPF')
  if (!lead.data_nascimento?.trim())  faltando.push('data de nascimento')
  return faltando
}

export function AbaFormularios({ lead }: Props) {
  const camposFaltando = dadosIncompletos(lead)
  const dadosBloqueados = camposFaltando.length > 0

  const [banco, setBanco] = useState<string>(lead.banco_pretendido ?? '')
  const [formularios, setFormularios] = useState<FormDef[]>([])
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [carregandoLista, setCarregandoLista] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [atalhoAberto, setAtalhoAberto] = useState(true)

  async function carregarFormularios(bancNome: string) {
    if (!bancNome) { setFormularios([]); return }
    setCarregandoLista(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}/formularios?banco=${encodeURIComponent(bancNome)}`)
      const json = await res.json()
      const lista: FormDef[] = json.formularios ?? []
      setFormularios(lista)
      setSelecionados(new Set(lista.map((f: FormDef) => f.nomeArquivo)))
    } catch {
      toast.error('Erro ao carregar lista de formulários.')
    } finally {
      setCarregandoLista(false)
    }
  }

  function handleBancoChange(b: string) {
    setBanco(b)
    setFormularios([])
    setSelecionados(new Set())
    carregarFormularios(b)
  }

  function toggleFormulario(nome: string) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      next.has(nome) ? next.delete(nome) : next.add(nome)
      return next
    })
  }

  function toggleTodos() {
    if (selecionados.size === formularios.length) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(formularios.map((f) => f.nomeArquivo)))
    }
  }

  async function handleGerar() {
    if (!banco || selecionados.size === 0) return
    setGerando(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}/formularios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banco, formularios: Array.from(selecionados) }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Erro ao gerar formulários.')
      } else {
        toast.success(json.mensagem)
      }
    } catch {
      toast.error('Erro de rede ao gerar formulários.')
    } finally {
      setGerando(false)
    }
  }

  const todosSelecionados = formularios.length > 0 && selecionados.size === formularios.length

  return (
    <div className="space-y-6">

      {/* ── Seção: Gerar Formulários ─────────────────────── */}
      <section className="bg-white border border-gray-100 rounded-lg p-4 space-y-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Gerar Formulários</p>

        {/* Alerta de dados incompletos */}
        {dadosBloqueados && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">Complete os dados do cliente</p>
              <p className="text-xs text-amber-600 mt-0.5">
                Preencha {camposFaltando.join(', ')} antes de gerar formulários.
              </p>
            </div>
          </div>
        )}

        {/* Seletor de banco */}
        <div className={cn('flex gap-3 items-end', dadosBloqueados && 'opacity-40 pointer-events-none select-none')}>
          <div className="flex-1 space-y-1.5">
            <label className="text-xs text-gray-500">Banco</label>
            <Select value={banco} onValueChange={handleBancoChange} disabled={dadosBloqueados}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Selecionar banco..." />
              </SelectTrigger>
              <SelectContent>
                {BANCOS.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Lista de formulários */}
        {carregandoLista && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Carregando formulários...
          </div>
        )}

        {!carregandoLista && formularios.length > 0 && (
          <div className="space-y-2">
            {/* Selecionar todos */}
            <button
              type="button"
              onClick={toggleTodos}
              className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700"
            >
              {todosSelecionados
                ? <CheckSquare className="w-4 h-4 text-fonti-primary" />
                : <Square className="w-4 h-4" />
              }
              {todosSelecionados ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>

            <div className="space-y-1.5">
              {formularios.map((f) => {
                const sel = selecionados.has(f.nomeArquivo)
                return (
                  <button
                    key={f.nomeArquivo}
                    type="button"
                    onClick={() => toggleFormulario(f.nomeArquivo)}
                    className={cn(
                      'w-full flex items-center gap-3 p-2.5 rounded-lg border text-sm text-left transition-all',
                      sel
                        ? 'border-fonti-primary bg-fonti-primary/5 text-fonti-primary'
                        : 'border-gray-100 text-gray-500 hover:border-gray-200'
                    )}
                  >
                    {sel
                      ? <CheckSquare className="w-4 h-4 shrink-0" />
                      : <Square className="w-4 h-4 shrink-0 text-gray-300" />
                    }
                    <FileText className="w-4 h-4 shrink-0 text-gray-400" />
                    <span>{f.label}</span>
                  </button>
                )
              })}
            </div>

            <Button
              className="w-full bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-2"
              onClick={handleGerar}
              disabled={gerando || selecionados.size === 0}
            >
              {gerando
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <FileDown className="w-4 h-4" />
              }
              {gerando ? 'Gerando...' : `Gerar ${selecionados.size} formulário(s)`}
            </Button>
            <p className="text-xs text-gray-400 text-center">
              Os PDFs serão salvos na aba Documentos.
            </p>
          </div>
        )}

        {!carregandoLista && banco && formularios.length === 0 && (
          <p className="text-xs text-gray-400 italic">
            {banco.toLowerCase().includes('caixa')
              ? 'Formulários Caixa em implementação.'
              : 'Nenhum formulário disponível para este banco.'}
          </p>
        )}

        {!banco && (
          <p className="text-xs text-gray-400 italic">Selecione um banco para ver os formulários disponíveis.</p>
        )}
      </section>

      {/* ── Seção: Atalhos Operacionais ─────────────────── */}
      <section className="bg-white border border-gray-100 rounded-lg overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:bg-gray-50"
          onClick={() => setAtalhoAberto((v) => !v)}
        >
          <span>Atalhos Operacionais</span>
          {atalhoAberto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {atalhoAberto && (
          <div className="px-4 pb-4 space-y-2">
            {ATALHOS.map((a) => (
              <div
                key={a.url}
                className="flex items-start gap-3 p-3 border border-gray-100 rounded-lg hover:border-gray-200 transition-all"
              >
                <span className="text-xl shrink-0 mt-0.5">{a.icone}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{a.titulo}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{a.descricao}</p>
                </div>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0"
                >
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir
                  </Button>
                </a>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  )
}
