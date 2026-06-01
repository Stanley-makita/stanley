'use client'

import { useState } from 'react'
import { User, Star, Trash2, Plus, Building2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PessoaBuscaCombobox, type PessoaOpcao } from '@/components/processos/PessoaBuscaCombobox'
import { NovaPessoaModal } from '@/components/pessoas/NovaPessoaModal'
import {
  useProcessoCorretores,
  useAdicionarCorretor,
  useDefinirCorretorPrincipal,
  useRemoverCorretor,
  useAtualizarImobiliaria,
} from '@/hooks/processos/useProcessoCorretores'
import type { Processo } from '@/types/processos'
import { cn } from '@/lib/utils'

interface Props {
  processo: Processo
}

export function BlocoParceiros({ processo }: Props) {
  const { data: corretores = [] } = useProcessoCorretores(processo.id)
  const adicionarCorretor    = useAdicionarCorretor(processo.id)
  const definirPrincipal     = useDefinirCorretorPrincipal(processo.id)
  const removerCorretor      = useRemoverCorretor(processo.id)
  const atualizarImobiliaria = useAtualizarImobiliaria(processo.id)

  const [adicionandoCorretor, setAdicionandoCorretor] = useState(false)
  const [pessoaCorretor, setPessoaCorretor] = useState<PessoaOpcao | null>(null)
  const [novaPessoaCorretor, setNovaPessoaCorretor] = useState(false)
  const [pessoaImobiliaria, setPessoaImobiliaria] = useState<PessoaOpcao | null>(null)
  const [novaPessoaImob, setNovaPessoaImob] = useState(false)

  async function handleAdicionarCorretor() {
    if (!pessoaCorretor) return
    const isPrimeiro = corretores.length === 0
    await adicionarCorretor.mutateAsync({
      pessoa_id: pessoaCorretor.id,
      nome:      pessoaCorretor.nome,
      telefone:  pessoaCorretor.telefone ?? null,
      principal: isPrimeiro,
    })
    setPessoaCorretor(null)
    setAdicionandoCorretor(false)
  }

  async function handleVincularImobiliaria(p: PessoaOpcao) {
    await atualizarImobiliaria.mutateAsync(p.id)
    setPessoaImobiliaria(null)
  }

  async function handleRemoverImobiliaria() {
    await atualizarImobiliaria.mutateAsync(null)
  }

  const imobiliaria = processo.imobiliaria

  return (
    <div className="space-y-3 border border-gray-100 rounded-lg p-4">
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Parceiros</h4>

      {/* ── Corretores ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-gray-600">Corretor{corretores.length > 1 ? 'es' : ''}</p>
          {!adicionandoCorretor && (
            <button
              onClick={() => setAdicionandoCorretor(true)}
              className="flex items-center gap-1 text-xs text-[#253B29] hover:text-[#253B29]/70 transition-colors"
            >
              <Plus className="h-3 w-3" /> Adicionar
            </button>
          )}
        </div>

        {/* Lista de corretores */}
        {corretores.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {corretores.map((c) => (
              <div key={c.id} className={cn(
                'flex items-center gap-2 text-sm p-1.5 rounded-lg',
                c.principal && 'bg-[#E7E0C4]/30'
              )}>
                <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-[#253B29] font-medium">{c.nome}</span>
                  {c.telefone && <span className="text-xs text-gray-400 ml-2">{c.telefone}</span>}
                </div>
                {c.principal && (
                  <span className="text-[10px] bg-[#253B29] text-white px-1.5 py-0.5 rounded-full shrink-0">
                    Principal
                  </span>
                )}
                <div className="flex gap-1 shrink-0">
                  {!c.principal && (
                    <button
                      onClick={() => definirPrincipal.mutate(c.id)}
                      title="Definir como principal"
                      className="text-gray-300 hover:text-[#C2AA6A] transition-colors"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => removerCorretor.mutate(c.id)}
                    className="text-gray-300 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Formulário adicionar corretor */}
        {adicionandoCorretor && (
          <div className="border border-[#C2AA6A]/30 rounded-lg p-2.5 bg-[#E7E0C4]/10 space-y-2">
            <PessoaBuscaCombobox
              pessoaSelecionada={pessoaCorretor}
              onSelect={setPessoaCorretor}
              onCriarPessoa={() => setNovaPessoaCorretor(true)}
            />
            <div className="flex gap-1.5 justify-end">
              <Button
                variant="ghost" size="sm"
                className="h-7 text-xs"
                onClick={() => { setAdicionandoCorretor(false); setPessoaCorretor(null) }}
              >
                <X className="h-3 w-3 mr-1" /> Cancelar
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs bg-[#253B29] hover:bg-[#1a2b1e] text-white"
                disabled={!pessoaCorretor || adicionarCorretor.isPending}
                onClick={handleAdicionarCorretor}
              >
                Adicionar
              </Button>
            </div>
          </div>
        )}

        {corretores.length === 0 && !adicionandoCorretor && (
          <p className="text-sm text-gray-300 italic">Nenhum corretor vinculado</p>
        )}
      </div>

      {/* ── Imobiliária ── */}
      <div className="border-t border-gray-100 pt-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-gray-600">Imobiliária</p>
        </div>

        {imobiliaria ? (
          <div className="flex items-center gap-2 text-sm p-1.5 rounded-lg bg-blue-50/50">
            <Building2 className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="text-[#253B29] font-medium flex-1">{imobiliaria.nome}</span>
            <button
              onClick={handleRemoverImobiliaria}
              className="text-gray-300 hover:text-red-400 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : pessoaImobiliaria ? (
          <div className="border border-[#C2AA6A]/30 rounded-lg p-2.5 bg-[#E7E0C4]/10 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <span className="text-[#253B29] font-medium">{pessoaImobiliaria.nome}</span>
              <button onClick={() => setPessoaImobiliaria(null)} className="ml-auto text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex gap-1.5 justify-end">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPessoaImobiliaria(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs bg-[#253B29] hover:bg-[#1a2b1e] text-white"
                onClick={() => handleVincularImobiliaria(pessoaImobiliaria)}
                disabled={atualizarImobiliaria.isPending}
              >
                Vincular
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <PessoaBuscaCombobox
              pessoaSelecionada={null}
              onSelect={(p) => p && setPessoaImobiliaria(p)}
              onCriarPessoa={() => setNovaPessoaImob(true)}
            />
          </div>
        )}
      </div>

      {/* Modais de criação de pessoa */}
      <NovaPessoaModal
        aberto={novaPessoaCorretor}
        onFechar={() => setNovaPessoaCorretor(false)}
        onSucesso={(p) => { setPessoaCorretor(p); setNovaPessoaCorretor(false) }}
      />
      <NovaPessoaModal
        aberto={novaPessoaImob}
        onFechar={() => setNovaPessoaImob(false)}
        onSucesso={(p) => { setPessoaImobiliaria(p); setNovaPessoaImob(false) }}
      />
    </div>
  )
}
