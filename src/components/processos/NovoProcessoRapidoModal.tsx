'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Home, Clock, FileText, MapPin, ChevronLeft, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCriarProcesso } from '@/hooks/processos/useCriarProcesso'
import { useUsuariosEmpresa } from '@/hooks/useUsuariosEmpresa'
import { useAuth } from '@/hooks/auth/useAuth'
import { supabase } from '@/lib/supabase'
import { PessoaBuscaCombobox, type PessoaOpcao } from './PessoaBuscaCombobox'
import { NovaPessoaModal, type PessoaCriada } from '@/components/pessoas/NovaPessoaModal'
import type { ModalidadeProcesso } from '@/types/processos'

type Modulo = 'financiamento' | 'consorcio' | 'contrato' | 'registro'

const MODULOS = [
  { id: 'financiamento' as Modulo, nome: 'Financiamento', descricao: 'Imobiliário, CGI, SBPE, PMCMV', icone: <Home className="h-5 w-5" /> },
  { id: 'consorcio'    as Modulo, nome: 'Consórcio',     descricao: 'Carta de crédito via consórcio',  icone: <Clock className="h-5 w-5" /> },
  { id: 'contrato'     as Modulo, nome: 'Contrato',      descricao: 'Prestação de serviço e contratos', icone: <FileText className="h-5 w-5" /> },
  { id: 'registro'     as Modulo, nome: 'Registro',      descricao: 'Registro e regularização de imóvel', icone: <MapPin className="h-5 w-5" /> },
]

const MODALIDADE_POR_MODULO: Record<Modulo, ModalidadeProcesso> = {
  financiamento: 'SBPE',
  consorcio:     'Consorcio',
  contrato:      'Contrato',
  registro:      'Registro',
}

// Mapeia módulo da tela para o módulo de fases no banco
const FASES_MODULO_POR_MODULO: Record<Modulo, string> = {
  financiamento: 'processos',
  consorcio:     'consorcio',
  contrato:      'contrato',
  registro:      'registro',
}

interface Props {
  aberto: boolean
  onFechar: () => void
  moduloInicial?: Modulo
}

export function NovoProcessoRapidoModal({ aberto, onFechar, moduloInicial }: Props) {
  const [modulo, setModulo] = useState<Modulo | null>(moduloInicial ?? null)
  const [pessoa, setPessoa] = useState<PessoaOpcao | null>(null)
  const [nomeImovel, setNomeImovel] = useState('')
  const [operacionalId, setOperacionalId] = useState('')
  const [comercialId, setComercialId] = useState('')
  const [novaPessoaAberta, setNovaPessoaAberta] = useState(false)

  const router = useRouter()
  const { usuario } = useAuth()
  const { data: usuarios = [] } = useUsuariosEmpresa()
  const criarProcesso = useCriarProcesso()

  function fechar() {
    setModulo(moduloInicial ?? null)
    setPessoa(null)
    setNomeImovel('')
    setOperacionalId('')
    setComercialId('')
    onFechar()
  }

  function handlePessoaCriada(p: PessoaCriada) {
    setPessoa(p)
  }

  async function handleCriar() {
    if (!modulo) return
    const modalidade = MODALIDADE_POR_MODULO[modulo]
    const nomeUsado = nomeImovel.trim() || (pessoa ? `Processo de ${pessoa.nome}` : 'Novo Processo')

    // Buscar primeira fase do módulo para posicionar o processo corretamente no kanban
    const { data: primeiraFase } = await supabase
      .from('fases')
      .select('id')
      .eq('empresa_id', usuario!.empresa_id)
      .eq('modulo', FASES_MODULO_POR_MODULO[modulo])
      .eq('ativo', true)
      .order('ordem', { ascending: true })
      .limit(1)
      .maybeSingle()

    const processo = await criarProcesso.mutateAsync({
      lead_id:           null,
      pessoa_id:         pessoa?.id ?? null,
      nome_imovel:       nomeUsado,
      modalidade,
      banco_id:          null,
      valor_imovel:      null,
      valor_financiado:  null,
      valor_entrada:     null,
      status_emissao:    'nao_emitido',
      chance_emissao:    'incerteza',
      status_processo:   'em_analise',
      tem_assessoria:    false,
      valor_assessoria:  null,
      comissao_comercial: null,
      comissao_empresa:   null,
      operacional_id:    operacionalId && operacionalId !== '__nenhum' ? operacionalId : (usuario?.id ?? null),
      comercial_id:      comercialId   && comercialId   !== '__nenhum' ? comercialId   : null,
      corretor_nome:     null,
      corretor_creci:    null,
      fase_atual_id:     primeiraFase?.id ?? null,
      data_inicio:       new Date().toISOString().split('T')[0],
    })

    if (pessoa) {
      await supabase.from('processo_compradores').insert({
        processo_id: processo.id,
        empresa_id:  processo.empresa_id,
        pessoa_id:   pessoa.id,
        nome:        pessoa.nome,
        cpf:         pessoa.cpf,
        email:       pessoa.email,
        telefone:    pessoa.telefone,
        principal:   true,
      })
    }

    router.push(`/processos/${processo.id}`)
    fechar()
  }

  const moduloInfo = modulo ? MODULOS.find(m => m.id === modulo) : null
  const podeCriar = !!modulo && !criarProcesso.isPending

  return (
    <>
      <Dialog open={aberto} onOpenChange={(v) => { if (!v && !novaPessoaAberta) fechar() }}>
        <DialogContent className={cn('p-0 gap-0 overflow-hidden', !modulo ? 'max-w-sm' : 'max-w-md')}>
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-gray-100">
            <DialogTitle className="text-sm font-semibold text-[#253B29]">
              {!modulo ? 'Novo Processo' : `Novo Processo — ${moduloInfo?.nome}`}
            </DialogTitle>
            <p className="text-xs text-gray-400 mt-0.5">
              {!modulo ? 'Selecione o tipo de negócio' : 'Preencha os dados básicos para criar o processo'}
            </p>
          </DialogHeader>

          {!modulo ? (
            /* Passo 1: Seletor de módulo */
            <div className="px-5 pt-4 pb-5 space-y-1.5">
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                {MODULOS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setModulo(m.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left bg-white hover:bg-[#E7E0C4]/30 transition-colors cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[#E7E0C4] text-[#253B29] flex items-center justify-center shrink-0">
                      {m.icone}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#253B29]">{m.nome}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{m.descricao}</p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex justify-end pt-2">
                <Button variant="outline" size="sm" onClick={fechar} className="h-9">Cancelar</Button>
              </div>
            </div>
          ) : (
            /* Passo 2: Formulário */
            <div className="px-5 py-5 space-y-4 overflow-y-auto max-h-[75vh]">

              {/* Cliente */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500 block">Cliente</label>
                <PessoaBuscaCombobox
                  pessoaSelecionada={pessoa}
                  onSelect={setPessoa}
                  onCriarPessoa={() => setNovaPessoaAberta(true)}
                />
              </div>

              {/* Título do negócio */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500 block">
                  Título do negócio
                  <span className="ml-1 text-gray-400 font-normal">(opcional)</span>
                </label>
                <Input
                  placeholder={pessoa ? `Processo de ${pessoa.nome}` : 'Ex: Apto Jd. América, Financiamento João Silva…'}
                  value={nomeImovel}
                  onChange={(e) => setNomeImovel(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              {/* Responsáveis */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-500 block">Responsável operacional</label>
                  <Select
                    value={operacionalId || (usuario?.id ?? '')}
                    onValueChange={setOperacionalId}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__nenhum">Nenhum</SelectItem>
                      {usuarios.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-500 block">Colaborador comercial</label>
                  <Select value={comercialId} onValueChange={setComercialId}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__nenhum">Nenhum</SelectItem>
                      {usuarios.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Ações */}
              <div className="flex items-center justify-between pt-1">
                {!moduloInicial ? (
                  <button
                    type="button"
                    onClick={() => setModulo(null)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Voltar
                  </button>
                ) : (
                  <Button variant="outline" size="sm" onClick={fechar} className="h-9">Cancelar</Button>
                )}
                <Button
                  className="bg-[#253B29] hover:bg-[#1a2b1e] text-white h-9 px-5"
                  onClick={handleCriar}
                  disabled={!podeCriar}
                >
                  {criarProcesso.isPending
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Criando…</>
                    : 'Criar Processo'
                  }
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <NovaPessoaModal
        aberto={novaPessoaAberta}
        onFechar={() => setNovaPessoaAberta(false)}
        onSucesso={handlePessoaCriada}
      />
    </>
  )
}
