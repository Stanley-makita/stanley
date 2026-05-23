'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/auth/useAuth'
import { useFases } from '@/hooks/configuracoes/useFases'
import { useProcessoFasesHistorico, useAvancarFase } from '@/hooks/processos/useProcessoFasesHistorico'
import { type Processo } from '@/types/processos'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ChevronRight, CheckCircle2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { usePermissao } from '@/hooks/auth/usePermissao'

interface Props {
  processoId: string
  processo: Processo
}

export function AbaFases({ processoId, processo }: Props) {
  const { usuario } = useAuth()
  const { pode } = usePermissao()
  const { data: historico = [], isLoading } = useProcessoFasesHistorico(processoId)
  const avancarFase = useAvancarFase(processoId)

  const [faseSelecionada, setFaseSelecionada] = useState<string>('')
  const [observacao, setObservacao] = useState('')
  const [exibirForm, setExibirForm] = useState(false)

  const { data: fases = [] } = useFases('processos')

  async function confirmarAvanco() {
    if (!faseSelecionada) return
    await avancarFase.mutateAsync({ faseId: faseSelecionada, observacao: observacao || undefined })
    setExibirForm(false)
    setFaseSelecionada('')
    setObservacao('')
  }

  const podeAvancar = pode('processos.editar')

  return (
    <div className="space-y-5">
      {/* Botão avançar fase */}
      {podeAvancar && (
        <div className="flex justify-end">
          <Button
            size="sm"
            className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5 h-8"
            onClick={() => setExibirForm(!exibirForm)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
            Avançar fase
          </Button>
        </div>
      )}

      {/* Form avançar fase */}
      {exibirForm && (
        <div className="border border-[#C2AA6A] rounded-xl p-4 bg-[#E7E0C4]/20 space-y-3">
          <p className="text-xs font-semibold text-[#253B29]">Registrar nova fase</p>
          <Select value={faseSelecionada} onValueChange={setFaseSelecionada}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Selecionar fase..." />
            </SelectTrigger>
            <SelectContent>
              {fases.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: f.cor ?? '#253B29' }} />
                    {f.nome}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Observação (opcional)..."
            rows={2}
            className="resize-none text-sm"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setExibirForm(false)}>Cancelar</Button>
            <Button
              size="sm"
              className="bg-[#253B29] hover:bg-[#1a2b1e] text-white h-8"
              onClick={confirmarAvanco}
              disabled={!faseSelecionada || avancarFase.isPending}
            >
              Confirmar
            </Button>
          </div>
        </div>
      )}

      {/* Timeline de fases */}
      {isLoading ? (
        <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl" />)}</div>
      ) : historico.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Nenhuma fase registrada.</p>
      ) : (
        <div className="relative">
          {/* Linha vertical */}
          <div className="absolute left-4 top-4 bottom-4 w-px bg-gray-200" />

          <div className="space-y-4">
            {historico.map((item, idx) => {
              const isCurrent = processo.fase_atual_id === item.fase_id
              const cor = item.fase?.cor ?? '#253B29'

              return (
                <div key={item.id} className="relative flex gap-4 pl-10">
                  {/* Círculo na linha */}
                  <div
                    className={`absolute left-2.5 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${isCurrent ? 'ring-2' : ''}`}
                    style={{
                      backgroundColor: cor,
                      boxShadow: isCurrent ? `0 0 0 2px ${cor}40` : undefined,
                    }}
                  >
                    {idx === 0 && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
                  </div>

                  <div className={`flex-1 rounded-xl p-4 border ${isCurrent ? 'border-[#C2AA6A] bg-[#E7E0C4]/20' : 'border-gray-100 bg-white'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#253B29]">{item.fase?.nome ?? '—'}</span>
                        {isCurrent && (
                          <span className="text-xs bg-[#253B29] text-white px-2 py-0.5 rounded-full">Atual</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(item.entrou_em), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">
                      por {item.usuario?.nome ?? 'Sistema'}
                      {' • '}
                      {new Date(item.entrou_em).toLocaleDateString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                    {item.observacao && (
                      <p className="text-sm text-gray-600 mt-2 bg-gray-50 rounded-lg p-2">{item.observacao}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}