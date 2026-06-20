'use client'

import { useState, useEffect } from 'react'
import { useCriarSolicitacao } from '@/hooks/solicitacoes/useCriarSolicitacao'
import { useUsuariosEmpresa } from '@/hooks/useUsuariosEmpresa'
import {
  TIPO_LABELS, SLA_HORAS_PADRAO,
  type TipoSolicitacao, type PrioridadeSolicitacao, type ContextoSolicitacao,
} from '@/types/solicitacoes-operacionais'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { addHours, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Props {
  aberto: boolean
  onFechar: () => void
  leadId?: string
  processoId?: string
  conversaId?: string
  pessoaId?: string
  contexto?: ContextoSolicitacao
}

const TIPOS = Object.entries(TIPO_LABELS) as [TipoSolicitacao, string][]

const PRIORIDADES: { value: PrioridadeSolicitacao; label: string }[] = [
  { value: 'urgente', label: 'Urgente' },
  { value: 'alta',    label: 'Alta' },
  { value: 'normal',  label: 'Normal' },
  { value: 'baixa',   label: 'Baixa' },
]

function moeda(v: number | null | undefined) {
  if (!v) return null
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

function gerarTitulo(tipo: TipoSolicitacao, ctx?: ContextoSolicitacao): string {
  const prefixo = `[${TIPO_LABELS[tipo].toUpperCase()}] `
  if (!ctx) return prefixo

  if (ctx.processoNumero) {
    const partes = [`Processo #${ctx.processoNumero}`]
    if (ctx.processoBanco) partes.push(ctx.processoBanco)
    if (ctx.processoModalidade) partes.push(ctx.processoModalidade)
    return prefixo + partes.join(' — ')
  }

  if (ctx.nomeCliente) {
    const partes: string[] = [ctx.nomeCliente]
    if (ctx.renda) partes.push(`Renda ${moeda(ctx.renda)}`)
    if (ctx.produto) partes.push(ctx.produto)
    return prefixo + partes.join(' — ')
  }

  return prefixo
}

function gerarDescricao(ctx?: ContextoSolicitacao): string {
  if (!ctx) return ''
  const linhas: string[] = []

  if (ctx.processoNumero) {
    linhas.push(`Processo: #${ctx.processoNumero}`)
    if (ctx.processoNomeImovel) linhas.push(`Imóvel: ${ctx.processoNomeImovel}`)
    if (ctx.processoBanco) linhas.push(`Banco: ${ctx.processoBanco}`)
    if (ctx.processoModalidade) linhas.push(`Modalidade: ${ctx.processoModalidade}`)
    if (ctx.processoCompradorPrincipal) linhas.push(`Compradores: ${ctx.processoCompradorPrincipal}`)
    if (ctx.processoValorFinanciado) linhas.push(`Financiado: ${moeda(ctx.processoValorFinanciado)}`)
    if (ctx.processoFaseAtual) linhas.push(`Fase atual: ${ctx.processoFaseAtual}`)
  } else if (ctx.nomeCliente && ctx.renda !== undefined) {
    if (ctx.valorPretendido) linhas.push(`Valor pretendido: ${moeda(ctx.valorPretendido)}`)
    if (ctx.renda) linhas.push(`Renda: ${moeda(ctx.renda)}`)
    if (ctx.produto) linhas.push(`Produto: ${ctx.produto}`)
    if (ctx.telefone) linhas.push(`Telefone: ${ctx.telefone}`)
  } else if (ctx.telefone || ctx.nomeCliente) {
    if (ctx.telefone) linhas.push(`Telefone: ${ctx.telefone}`)
  }

  return linhas.join('\n')
}

export function NovaSolicitacaoDrawer({
  aberto, onFechar, leadId, processoId, conversaId, pessoaId, contexto,
}: Props) {
  const { data: usuarios = [] } = useUsuariosEmpresa()
  const criar = useCriarSolicitacao()

  const [tipo, setTipo] = useState<TipoSolicitacao>('simulacao')
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [prioridade, setPrioridade] = useState<PrioridadeSolicitacao>('normal')
  const [responsavelId, setResponsavelId] = useState<string>('none')

  // Inicializa campos quando o drawer abre
  useEffect(() => {
    if (!aberto) return
    const tipoInicial: TipoSolicitacao = 'simulacao'
    setTipo(tipoInicial)
    setTitulo(gerarTitulo(tipoInicial, contexto))
    setDescricao(gerarDescricao(contexto))
    setPrioridade('normal')
    setResponsavelId(contexto?.responsavelSugeridoId ?? 'none')
  }, [aberto]) // eslint-disable-line react-hooks/exhaustive-deps

  // Atualiza só o prefixo [TIPO] quando o tipo muda, mantém o restante
  useEffect(() => {
    if (!aberto) return
    const prefixo = `[${TIPO_LABELS[tipo].toUpperCase()}] `
    setTitulo((prev) => {
      const semPrefixo = prev.replace(/^\[.*?\]\s*/, '')
      return prefixo + semPrefixo
    })
  }, [tipo]) // eslint-disable-line react-hooks/exhaustive-deps

  const prazoEstimado = format(
    addHours(new Date(), SLA_HORAS_PADRAO[tipo]),
    "dd/MM 'às' HH'h'",
    { locale: ptBR }
  )

  async function handleSubmit() {
    if (!titulo.trim() || responsavelId === 'none') return
    try {
      await criar.mutateAsync({
        tipo,
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        prioridade,
        responsavel_id: responsavelId !== 'none' ? responsavelId : undefined,
        lead_id: leadId,
        processo_id: processoId,
        conversa_id: conversaId,
        pessoa_id: pessoaId,
      })
      onFechar()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="flex max-h-[92svh] w-[calc(100vw-1rem)] max-w-md flex-col gap-0 p-0 sm:w-full">
        <DialogHeader className="border-b px-4 pb-4 pt-5 sm:px-6 sm:pt-6">
          <DialogTitle className="text-fonti-primary">Nova Solicitação Operacional</DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          {/* Para quem? */}
          <div className="space-y-1.5">
            <Label>Para quem? <span className="text-red-500">*</span></Label>
            <Select value={responsavelId} onValueChange={setResponsavelId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o destinatário" />
              </SelectTrigger>
              <SelectContent>
                {usuarios.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo */}
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoSolicitacao)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-400">Prazo sugerido: {prazoEstimado}</p>
          </div>

          {/* Título */}
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: [SIMULAÇÃO] João Silva — R$350k, renda R$8k"
            />
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label>Descrição <span className="text-gray-400 font-normal">(opcional)</span></Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Detalhes: renda, banco preferido, modalidade, imóvel em vista..."
              rows={4}
            />
          </div>

          {/* Prioridade */}
          <div className="space-y-1.5">
            <Label>Prioridade</Label>
            <Select value={prioridade} onValueChange={(v) => setPrioridade(v as PrioridadeSolicitacao)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORIDADES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t px-4 py-4 sm:flex-row sm:px-6">
          <Button variant="outline" className="flex-1" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            className="flex-1 bg-fonti-primary hover:bg-fonti-primary-hover text-white"
            onClick={handleSubmit}
            disabled={!titulo.trim() || responsavelId === 'none' || criar.isPending}
          >
            {criar.isPending ? 'Criando...' : 'Criar Solicitação'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
