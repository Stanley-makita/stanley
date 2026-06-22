'use client'

import { type Lead } from '@/types/leads'
import { LeadOrigemBadge } from '../LeadOrigemBadge'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Mail, Phone, CreditCard, Users, DollarSign } from 'lucide-react'

interface Props { lead: Lead }

function fmtMoeda(v: number | null) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function fmtData(s: string | null) {
  if (!s) return '—'
  try { return format(new Date(s), 'dd/MM/yyyy', { locale: ptBR }) } catch { return s }
}

function iniciais(nome: string) {
  return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

export function AbaVisaoGeral({ lead }: Props) {
  return (
    <div className="space-y-5">

      {/* Dados Pessoais */}
      <Card titulo="Dados Pessoais" icone={<Users className="h-4 w-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          <CampoComIcone icone={<Phone className="h-3.5 w-3.5" />} label="Telefone" valor={lead.telefone} />
          <CampoComIcone icone={<Mail className="h-3.5 w-3.5" />} label="Email" valor={lead.email} />
          <CampoComIcone icone={<CreditCard className="h-3.5 w-3.5" />} label="CPF" valor={lead.cpf} />
        </div>
      </Card>

      {/* Financeiro */}
      <Card titulo="Financeiro" icone={<DollarSign className="h-4 w-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          <div>
            <p className="text-xs text-gray-400 mb-1">Valor Pretendido</p>
            <p className="text-sm font-bold text-fonti-primary">{fmtMoeda(lead.valor_pretendido)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Origem</p>
            <LeadOrigemBadge origem={lead.origem} />
          </div>
          {lead.fase && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Fase atual</p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: lead.fase.cor }} />
                <span className="text-sm font-medium text-fonti-primary">{lead.fase.nome}</span>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Responsáveis */}
      {lead.responsavel && (
        <Card titulo="Responsável pelo Atendimento" icone={<Users className="h-4 w-4" />}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-fonti-primary flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-white">{iniciais(lead.responsavel.nome)}</span>
            </div>
            <span className="text-sm font-medium text-fonti-primary">{lead.responsavel.nome}</span>
          </div>
        </Card>
      )}

      {/* Observações */}
      {lead.observacoes && (
        <Card titulo="Observações" icone={<Mail className="h-4 w-4" />}>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {lead.observacoes}
          </p>
        </Card>
      )}

      {/* Footer — datas */}
      <div className="flex gap-8 text-xs text-gray-400 pt-2 border-t border-gray-100">
        <div className="text-center">
          <p className="font-medium text-gray-500 mb-0.5">Criado em</p>
          <p>{fmtData(lead.created_at)}</p>
        </div>
        <div className="text-center">
          <p className="font-medium text-gray-500 mb-0.5">Última Movimentação</p>
          <p>{fmtData(lead.updated_at)}</p>
        </div>
      </div>

    </div>
  )
}

function Card({ titulo, icone, children }: { titulo: string; icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border border-gray-100 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-gray-400">{icone}</span>
        <h3 className="text-xs font-semibold text-gray-500">{titulo}</h3>
      </div>
      {children}
    </div>
  )
}

function CampoComIcone({
  icone, label, valor,
}: { icone: React.ReactNode; label: string; valor?: string | null }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="text-gray-300 mt-0.5 shrink-0">{icone}</span>
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-800 truncate">{valor || '—'}</p>
      </div>
    </div>
  )
}
