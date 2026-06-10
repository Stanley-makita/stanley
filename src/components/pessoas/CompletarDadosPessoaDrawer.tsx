'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Check, X } from 'lucide-react'

const ESTADOS_CIVIS = [
  { value: 'solteiro',      label: 'Solteiro(a)' },
  { value: 'casado',        label: 'Casado(a)' },
  { value: 'uniao_estavel', label: 'União Estável' },
  { value: 'divorciado',    label: 'Divorciado(a)' },
  { value: 'viuvo',         label: 'Viúvo(a)' },
]

const REGIMES = [
  { value: 'comunhao_parcial',   label: 'Comunhão Parcial de Bens' },
  { value: 'comunhao_total',     label: 'Comunhão Total de Bens' },
  { value: 'separacao_total',    label: 'Separação Total de Bens' },
  { value: 'participacao_final', label: 'Participação Final nos Aquestos' },
]

function formatarCpf(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

function normalizarCpf(valor: string): string | null {
  const d = valor.replace(/\D/g, '')
  return d.length === 11 ? d : (d.length === 0 ? null : d)
}

type FormState = {
  telefone: string
  nome: string; email: string; cpf: string; data_nascimento: string
  rg: string; profissao: string; estado_civil: string; sexo: string
  renda_formal: string; renda_informal: string; nacionalidade: string
  // Documentos de identidade
  orgao_emissor: string; data_emissao: string; cidade_nascimento: string; estado_nascimento: string
  filiacao_mae: string; filiacao_pai: string
  // CNH
  registro_cnh: string; validade_cnh: string; primeira_habilitacao_cnh: string
  endereco_rua: string; endereco_numero: string; endereco_bairro: string
  endereco_cidade: string; endereco_uf: string; endereco_cep: string
  conjuge_nome: string; conjuge_cpf: string; conjuge_data_nascimento: string
  conjuge_telefone: string; conjuge_profissao: string
  conjuge_renda_formal: string; conjuge_renda_informal: string
  regime_casamento: string; data_casamento: string
  // Trabalho (FGTS)
  empresa_nome: string; empresa_cnpj: string
  municipio_trabalho: string; uf_trabalho: string
  // Conta bancária (débito parcelas)
  conta_bancaria_banco: string; conta_bancaria_agencia: string
  conta_bancaria_numero: string; conta_bancaria_digito: string
}

const VAZIO: FormState = {
  telefone: '',
  nome: '', email: '', cpf: '', data_nascimento: '', rg: '', profissao: '',
  estado_civil: '', sexo: '', renda_formal: '', renda_informal: '', nacionalidade: '',
  orgao_emissor: '', data_emissao: '', cidade_nascimento: '', estado_nascimento: '',
  filiacao_mae: '', filiacao_pai: '',
  registro_cnh: '', validade_cnh: '', primeira_habilitacao_cnh: '',
  endereco_rua: '', endereco_numero: '', endereco_bairro: '', endereco_cidade: '',
  endereco_uf: '', endereco_cep: '',
  conjuge_nome: '', conjuge_cpf: '', conjuge_data_nascimento: '',
  conjuge_telefone: '', conjuge_profissao: '',
  conjuge_renda_formal: '', conjuge_renda_informal: '',
  regime_casamento: '', data_casamento: '',
  empresa_nome: '', empresa_cnpj: '', municipio_trabalho: '', uf_trabalho: '',
  conta_bancaria_banco: '', conta_bancaria_agencia: '',
  conta_bancaria_numero: '', conta_bancaria_digito: '',
}

interface Props {
  pessoaId: string | null
  open: boolean
  onClose: () => void
  origemAuditoria?: 'leads' | 'pessoas' | 'processos'
}

export function CompletarDadosPessoaDrawer({
  pessoaId, open, onClose, origemAuditoria = 'processos',
}: Props) {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState>(VAZIO)
  const f = (patch: Partial<FormState>) => setForm((s) => ({ ...s, ...patch }))

  const { data: pessoa, isLoading } = useQuery({
    queryKey: ['pessoa-completa', pessoaId],
    enabled: !!pessoaId && open,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pessoas')
        .select(`id, nome, cpf, email, data_nascimento,
          rg, profissao, estado_civil, sexo, renda_formal, renda_informal, nacionalidade,
          orgao_emissor, data_emissao, cidade_nascimento, estado_nascimento, filiacao_mae, filiacao_pai,
          registro_cnh, validade_cnh, primeira_habilitacao_cnh,
          endereco_rua, endereco_numero, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep,
          conjuge_nome, conjuge_cpf, conjuge_data_nascimento, conjuge_telefone, conjuge_profissao,
          conjuge_renda_formal, conjuge_renda_informal, regime_casamento, data_casamento,
          empresa_nome, empresa_cnpj, municipio_trabalho, uf_trabalho,
          conta_bancaria_banco, conta_bancaria_agencia, conta_bancaria_numero, conta_bancaria_digito,
          pessoa_telefones(id, telefone, principal, whatsapp, ativo)`)
        .eq('id', pessoaId!)
        .single()
      if (error) throw error
      return data
    },
  })

  useEffect(() => {
    if (pessoa && open) {
      const tels = (pessoa as any).pessoa_telefones ?? []
      const telAtivos = tels.filter((t: any) => t.ativo)
      const telPrincipal = telAtivos.find((t: any) => t.principal) ?? telAtivos[0]
      setForm({
        telefone:                telPrincipal?.telefone ?? '',
        nome:                    pessoa.nome ?? '',
        email:                   pessoa.email ?? '',
        cpf:                     formatarCpf(pessoa.cpf ?? ''),
        data_nascimento:         pessoa.data_nascimento ?? '',
        rg:                      pessoa.rg ?? '',
        profissao:               pessoa.profissao ?? '',
        estado_civil:            pessoa.estado_civil ?? '',
        sexo:                    (pessoa as any).sexo ?? '',
        orgao_emissor:           (pessoa as any).orgao_emissor ?? '',
        data_emissao:            (pessoa as any).data_emissao ?? '',
        cidade_nascimento:       (pessoa as any).cidade_nascimento ?? '',
        estado_nascimento:       (pessoa as any).estado_nascimento ?? '',
        filiacao_mae:            (pessoa as any).filiacao_mae ?? '',
        filiacao_pai:            (pessoa as any).filiacao_pai ?? '',
        registro_cnh:            (pessoa as any).registro_cnh ?? '',
        validade_cnh:            (pessoa as any).validade_cnh ?? '',
        primeira_habilitacao_cnh: (pessoa as any).primeira_habilitacao_cnh ?? '',
        renda_formal:            pessoa.renda_formal != null ? String(pessoa.renda_formal) : '',
        renda_informal:          pessoa.renda_informal != null ? String(pessoa.renda_informal) : '',
        nacionalidade:           pessoa.nacionalidade ?? '',
        endereco_rua:            pessoa.endereco_rua ?? '',
        endereco_numero:         pessoa.endereco_numero ?? '',
        endereco_bairro:         pessoa.endereco_bairro ?? '',
        endereco_cidade:         pessoa.endereco_cidade ?? '',
        endereco_uf:             pessoa.endereco_uf ?? '',
        endereco_cep:            pessoa.endereco_cep ?? '',
        conjuge_nome:            pessoa.conjuge_nome ?? '',
        conjuge_cpf:             formatarCpf(pessoa.conjuge_cpf ?? ''),
        conjuge_data_nascimento: pessoa.conjuge_data_nascimento ?? '',
        conjuge_telefone:        pessoa.conjuge_telefone ?? '',
        conjuge_profissao:       pessoa.conjuge_profissao ?? '',
        conjuge_renda_formal:    pessoa.conjuge_renda_formal != null ? String(pessoa.conjuge_renda_formal) : '',
        conjuge_renda_informal:  pessoa.conjuge_renda_informal != null ? String(pessoa.conjuge_renda_informal) : '',
        regime_casamento:        pessoa.regime_casamento ?? '',
        data_casamento:          (pessoa as any).data_casamento ?? '',
        empresa_nome:            (pessoa as any).empresa_nome ?? '',
        empresa_cnpj:            (pessoa as any).empresa_cnpj ?? '',
        municipio_trabalho:      (pessoa as any).municipio_trabalho ?? '',
        uf_trabalho:             (pessoa as any).uf_trabalho ?? '',
        conta_bancaria_banco:    (pessoa as any).conta_bancaria_banco ?? '',
        conta_bancaria_agencia:  (pessoa as any).conta_bancaria_agencia ?? '',
        conta_bancaria_numero:   (pessoa as any).conta_bancaria_numero ?? '',
        conta_bancaria_digito:   (pessoa as any).conta_bancaria_digito ?? '',
      })
    }
  }, [pessoa, open])

  const eCasado = form.estado_civil === 'casado' || form.estado_civil === 'uniao_estavel'

  const salvar = useMutation({
    mutationFn: async () => {
      if (!pessoaId || !usuario) return

      const payload = {
        nome:                    form.nome.trim() || undefined,
        email:                   form.email.trim() || null,
        cpf:                     normalizarCpf(form.cpf) ?? null,
        data_nascimento:         form.data_nascimento || null,
        rg:                      form.rg.trim() || null,
        profissao:               form.profissao.trim() || null,
        estado_civil:            form.estado_civil || null,
        sexo:                    form.sexo || null,
        orgao_emissor:           form.orgao_emissor.trim() || null,
        data_emissao:            form.data_emissao || null,
        cidade_nascimento:       form.cidade_nascimento.trim() || null,
        estado_nascimento:       form.estado_nascimento.trim().toUpperCase().slice(0, 2) || null,
        filiacao_mae:            form.filiacao_mae.trim() || null,
        filiacao_pai:            form.filiacao_pai.trim() || null,
        registro_cnh:            form.registro_cnh.trim() || null,
        validade_cnh:            form.validade_cnh || null,
        primeira_habilitacao_cnh: form.primeira_habilitacao_cnh || null,
        renda_formal:            form.renda_formal ? Number(form.renda_formal) : null,
        renda_informal:          form.renda_informal ? Number(form.renda_informal) : null,
        nacionalidade:           form.nacionalidade.trim() || null,
        endereco_rua:            form.endereco_rua.trim() || null,
        endereco_numero:         form.endereco_numero.trim() || null,
        endereco_bairro:         form.endereco_bairro.trim() || null,
        endereco_cidade:         form.endereco_cidade.trim() || null,
        endereco_uf:             form.endereco_uf.trim() || null,
        endereco_cep:            form.endereco_cep.trim() || null,
        conjuge_nome:            eCasado ? (form.conjuge_nome.trim() || null) : null,
        conjuge_cpf:             eCasado ? (normalizarCpf(form.conjuge_cpf) ?? null) : null,
        conjuge_data_nascimento: eCasado ? (form.conjuge_data_nascimento || null) : null,
        conjuge_telefone:        eCasado ? (form.conjuge_telefone.trim() || null) : null,
        conjuge_profissao:       eCasado ? (form.conjuge_profissao.trim() || null) : null,
        conjuge_renda_formal:    eCasado && form.conjuge_renda_formal ? Number(form.conjuge_renda_formal) : null,
        conjuge_renda_informal:  eCasado && form.conjuge_renda_informal ? Number(form.conjuge_renda_informal) : null,
        regime_casamento:        eCasado ? (form.regime_casamento || null) : null,
        data_casamento:          eCasado ? (form.data_casamento || null) : null,
        empresa_nome:            form.empresa_nome.trim() || null,
        empresa_cnpj:            form.empresa_cnpj.trim() || null,
        municipio_trabalho:      form.municipio_trabalho.trim() || null,
        uf_trabalho:             form.uf_trabalho.trim() || null,
        conta_bancaria_banco:    form.conta_bancaria_banco.trim() || null,
        conta_bancaria_agencia:  form.conta_bancaria_agencia.trim() || null,
        conta_bancaria_numero:   form.conta_bancaria_numero.trim() || null,
        conta_bancaria_digito:   form.conta_bancaria_digito.trim() || null,
      }

      // 0. Atualizar telefone principal
      const telefoneVal = form.telefone.trim()
      if (telefoneVal) {
        const tels = (pessoa as any)?.pessoa_telefones ?? []
        const telAtivos = tels.filter((t: any) => t.ativo)
        const telPrincipal = telAtivos.find((t: any) => t.principal) ?? telAtivos[0]
        if (telPrincipal) {
          if (telPrincipal.telefone !== telefoneVal) {
            await supabase.from('pessoa_telefones').update({ telefone: telefoneVal }).eq('id', telPrincipal.id)
          }
        } else {
          await supabase.from('pessoa_telefones').insert({
            pessoa_id: pessoaId, empresa_id: usuario.empresa_id,
            telefone: telefoneVal, principal: true, whatsapp: true, ativo: true,
          })
        }
        // Propagar telefone para compradores e leads vinculados
        await supabase.from('processo_compradores').update({ telefone: telefoneVal }).eq('pessoa_id', pessoaId).eq('empresa_id', usuario.empresa_id)
        await supabase.from('leads').update({ telefone: telefoneVal }).eq('pessoa_id', pessoaId).eq('empresa_id', usuario.empresa_id)
      }

      // 1. Atualizar pessoas
      const { error } = await supabase.from('pessoas').update(payload).eq('id', pessoaId)
      if (error) throw error

      // 2. Propagar para leads
      await supabase.from('leads').update({
        nome:                    payload.nome,
        email:                   payload.email,
        cpf:                     payload.cpf,
        data_nascimento:         payload.data_nascimento,
        rg:                      payload.rg,
        profissao:               payload.profissao,
        estado_civil:            payload.estado_civil,
        renda_formal:            payload.renda_formal,
        renda_informal:          payload.renda_informal,
        conjuge_nome:            payload.conjuge_nome,
        conjuge_cpf:             payload.conjuge_cpf,
        conjuge_data_nascimento: payload.conjuge_data_nascimento,
        regime_casamento:        payload.regime_casamento,
      }).eq('pessoa_id', pessoaId).eq('empresa_id', usuario.empresa_id)

      // 3. Propagar para compradores
      await supabase.from('processo_compradores').update({
        nome:  payload.nome,
        cpf:   payload.cpf,
        email: payload.email,
      }).eq('pessoa_id', pessoaId).eq('empresa_id', usuario.empresa_id)

      // 4. Propagar para vendedores
      await supabase.from('processo_vendedores').update({
        nome:         payload.nome,
        cpf:          payload.cpf,
        email:        payload.email,
        estado_civil: payload.estado_civil,
        conjuge_nome: payload.conjuge_nome,
        conjuge_cpf:  payload.conjuge_cpf,
      }).eq('pessoa_id', pessoaId).eq('empresa_id', usuario.empresa_id)

      // 5. Auditoria
      await supabase.from('pessoas_alteracoes').insert({
        pessoa_id:          pessoaId,
        empresa_id:         usuario.empresa_id,
        usuario_id:         usuario.id,
        campos_alterados:   Object.keys(payload),
        valores_anteriores: {},
        valores_novos:      payload as Record<string, unknown>,
        origem:             origemAuditoria,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pessoa', pessoaId] })
      qc.invalidateQueries({ queryKey: ['pessoa-completa', pessoaId] })
      qc.invalidateQueries({ queryKey: ['pessoas', pessoaId, 'alteracoes'] })
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['processos'] })
      toast.success('Dados complementados com sucesso.', {
        className: 'border-l-4 border-l-[#C2AA6A] bg-[#E7E0C4] text-[#253B29]',
      })
      onClose()
    },
    onError: () => toast.error('Erro ao salvar dados.'),
  })

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#253B29]">
            Completar dados{pessoa ? ` — ${pessoa.nome}` : ''}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-gray-400">Carregando...</div>
        ) : (
          <div className="space-y-5 py-2">

            {/* Dados básicos */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-500 mb-1 block">Nome completo</label>
                <Input value={form.nome} onChange={(e) => f({ nome: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">CPF</label>
                <Input value={form.cpf} onChange={(e) => f({ cpf: formatarCpf(e.target.value) })} placeholder="000.000.000-00" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">RG</label>
                <Input value={form.rg} onChange={(e) => f({ rg: e.target.value })} placeholder="00.000.000-0" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Data de Nascimento</label>
                <Input type="date" value={form.data_nascimento} onChange={(e) => f({ data_nascimento: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">E-mail</label>
                <Input value={form.email} onChange={(e) => f({ email: e.target.value })} placeholder="email@exemplo.com" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Telefone principal</label>
                <Input value={form.telefone} onChange={(e) => f({ telefone: e.target.value })} placeholder="5544999990000" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Profissão</label>
                <Input value={form.profissao} onChange={(e) => f({ profissao: e.target.value })} placeholder="Ex: Advogado" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Nacionalidade</label>
                <Input value={form.nacionalidade} onChange={(e) => f({ nacionalidade: e.target.value })} placeholder="Brasileiro(a)" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Sexo</label>
                <select
                  className="w-full h-10 text-sm border rounded-md px-3 focus:outline-none focus:ring-2 focus:ring-[#253B29]/30"
                  value={form.sexo}
                  onChange={(e) => f({ sexo: e.target.value })}
                >
                  <option value="">Selecionar...</option>
                  <option value="M">Masculino</option>
                  <option value="F">Feminino</option>
                </select>
              </div>
            </div>

            {/* Documentos de identidade */}
            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-[#253B29] mb-3">Documentos de Identidade</p>

              {/* Sub-bloco RG / Identidade */}
              <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 mb-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">RG / Identidade</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Órgão emissor</label>
                    <Input value={form.orgao_emissor} onChange={(e) => f({ orgao_emissor: e.target.value })} placeholder="Ex: SESP/PR" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Data de emissão</label>
                    <Input type="date" value={form.data_emissao} onChange={(e) => f({ data_emissao: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Cidade de nascimento</label>
                    <Input value={form.cidade_nascimento} onChange={(e) => f({ cidade_nascimento: e.target.value })} placeholder="Ex: Maringá" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">UF de nascimento</label>
                    <Input value={form.estado_nascimento} onChange={(e) => f({ estado_nascimento: e.target.value.toUpperCase().slice(0, 2) })} placeholder="PR" maxLength={2} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Nome da mãe</label>
                    <Input value={form.filiacao_mae} onChange={(e) => f({ filiacao_mae: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Nome do pai</label>
                    <Input value={form.filiacao_pai} onChange={(e) => f({ filiacao_pai: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* Sub-bloco CNH */}
              <div className="rounded-lg bg-blue-50/40 border border-blue-100 p-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">CNH</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Nº Registro CNH</label>
                    <Input value={form.registro_cnh} onChange={(e) => f({ registro_cnh: e.target.value })} placeholder="Ex: 00123456789" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Validade da habilitação</label>
                    <Input type="date" value={form.validade_cnh} onChange={(e) => f({ validade_cnh: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Primeira habilitação</label>
                    <Input type="date" value={form.primeira_habilitacao_cnh} onChange={(e) => f({ primeira_habilitacao_cnh: e.target.value })} />
                  </div>
                </div>
              </div>
            </div>

            {/* Dados financeiros */}
            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-[#253B29] mb-3">Dados Financeiros</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Renda Formal (R$)</label>
                  <Input type="number" value={form.renda_formal} onChange={(e) => f({ renda_formal: e.target.value })} placeholder="0" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Renda Informal (R$)</label>
                  <Input type="number" value={form.renda_informal} onChange={(e) => f({ renda_informal: e.target.value })} placeholder="0" />
                </div>
              </div>
            </div>

            {/* Estado Civil */}
            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-[#253B29] mb-3">Estado Civil</p>
              <div className="flex flex-wrap gap-2">
                {ESTADOS_CIVIS.map((ec) => (
                  <button
                    key={ec.value}
                    type="button"
                    onClick={() => f({ estado_civil: form.estado_civil === ec.value ? '' : ec.value })}
                    className={cn(
                      'text-xs px-3 py-1.5 rounded-lg border transition-all',
                      form.estado_civil === ec.value
                        ? 'border-[#253B29] bg-[#253B29] text-white font-medium'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    {ec.label}
                  </button>
                ))}
              </div>

              {/* Cônjuge */}
              {eCasado && (
                <div className="mt-3 p-3 bg-[#E7E0C4]/20 border border-[#C2AA6A]/40 rounded-xl space-y-3">
                  <p className="text-xs font-semibold text-[#253B29]">Cônjuge / Companheiro(a)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Nome completo</label>
                      <Input value={form.conjuge_nome} onChange={(e) => f({ conjuge_nome: e.target.value })} placeholder="Nome do cônjuge" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">CPF</label>
                      <Input value={form.conjuge_cpf} onChange={(e) => f({ conjuge_cpf: formatarCpf(e.target.value) })} placeholder="000.000.000-00" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Nascimento</label>
                      <Input type="date" value={form.conjuge_data_nascimento} onChange={(e) => f({ conjuge_data_nascimento: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Telefone</label>
                      <Input value={form.conjuge_telefone} onChange={(e) => f({ conjuge_telefone: e.target.value })} placeholder="(00) 00000-0000" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Profissão</label>
                      <Input value={form.conjuge_profissao} onChange={(e) => f({ conjuge_profissao: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Renda Formal (R$)</label>
                      <Input type="number" value={form.conjuge_renda_formal} onChange={(e) => f({ conjuge_renda_formal: e.target.value })} placeholder="0" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Renda Informal (R$)</label>
                      <Input type="number" value={form.conjuge_renda_informal} onChange={(e) => f({ conjuge_renda_informal: e.target.value })} placeholder="0" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Data do Casamento/União</label>
                      <Input type="date" value={form.data_casamento} onChange={(e) => f({ data_casamento: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Regime de Bens</label>
                      <select
                        className="w-full h-10 text-sm border rounded-md px-3 focus:outline-none focus:ring-2 focus:ring-[#253B29]/30"
                        value={form.regime_casamento}
                        onChange={(e) => f({ regime_casamento: e.target.value })}
                      >
                        <option value="">Selecionar...</option>
                        {REGIMES.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Endereço */}
            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-[#253B29] mb-3">Endereço</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">CEP</label>
                  <Input value={form.endereco_cep} onChange={(e) => f({ endereco_cep: e.target.value })} placeholder="00000-000" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Número</label>
                  <Input value={form.endereco_numero} onChange={(e) => f({ endereco_numero: e.target.value })} placeholder="123" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Rua / Logradouro</label>
                  <Input value={form.endereco_rua} onChange={(e) => f({ endereco_rua: e.target.value })} placeholder="Rua das Flores" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Bairro</label>
                  <Input value={form.endereco_bairro} onChange={(e) => f({ endereco_bairro: e.target.value })} placeholder="Centro" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">UF</label>
                  <Input value={form.endereco_uf} onChange={(e) => f({ endereco_uf: e.target.value.toUpperCase().slice(0, 2) })} placeholder="PR" maxLength={2} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Cidade</label>
                  <Input value={form.endereco_cidade} onChange={(e) => f({ endereco_cidade: e.target.value })} placeholder="Maringá" />
                </div>
              </div>
            </div>

            {/* Trabalho / FGTS */}
            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-[#253B29] mb-3">Trabalho (para FGTS)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Nome da Empresa</label>
                  <Input value={form.empresa_nome} onChange={(e) => f({ empresa_nome: e.target.value })} placeholder="Razão Social da Empresa" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">CNPJ da Empresa</label>
                  <Input value={form.empresa_cnpj} onChange={(e) => f({ empresa_cnpj: e.target.value })} placeholder="00.000.000/0001-00" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Município de Trabalho</label>
                  <Input value={form.municipio_trabalho} onChange={(e) => f({ municipio_trabalho: e.target.value })} placeholder="Ex: Maringá" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">UF de Trabalho</label>
                  <Input value={form.uf_trabalho} onChange={(e) => f({ uf_trabalho: e.target.value.toUpperCase().slice(0, 2) })} placeholder="PR" maxLength={2} />
                </div>
              </div>
            </div>

            {/* Conta bancária */}
            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-[#253B29] mb-3">Conta Bancária (débito das parcelas)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Banco</label>
                  <Input value={form.conta_bancaria_banco} onChange={(e) => f({ conta_bancaria_banco: e.target.value })} placeholder="Ex: Bradesco" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Agência</label>
                  <Input value={form.conta_bancaria_agencia} onChange={(e) => f({ conta_bancaria_agencia: e.target.value })} placeholder="0000-0" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Conta</label>
                  <Input value={form.conta_bancaria_numero} onChange={(e) => f({ conta_bancaria_numero: e.target.value })} placeholder="00000-0" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Dígito</label>
                  <Input value={form.conta_bancaria_digito} onChange={(e) => f({ conta_bancaria_digito: e.target.value })} placeholder="0" maxLength={2} />
                </div>
              </div>
            </div>

            {/* Botões */}
            <div className="flex gap-2 justify-end pt-2 border-t">
              <Button variant="outline" size="sm" onClick={onClose} disabled={salvar.isPending}>
                <X className="h-4 w-4 mr-1" /> Cancelar
              </Button>
              <Button
                size="sm"
                className="bg-[#253B29] hover:bg-[#1a2b1e] text-white"
                onClick={() => salvar.mutate()}
                disabled={salvar.isPending}
              >
                <Check className="h-4 w-4 mr-1" />
                {salvar.isPending ? 'Salvando...' : 'Salvar dados'}
              </Button>
            </div>

          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
