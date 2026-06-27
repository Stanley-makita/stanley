'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import {
  usePessoaDocumentos,
  useUpsertPessoaDocumento,
  type UpsertDocumentoInput,
} from '@/hooks/pessoas/usePessoaDocumentos'
import { type TipoDocumentoPessoa, type PessoaDocumento } from '@/types/pessoas'

// ── Tipos de documento exibidos na UI ──────────────────────────────────────

const TIPOS_VISIVEIS: TipoDocumentoPessoa[] = [
  'rg', 'cnh', 'certidao_nascimento', 'certidao_casamento',
]

const COR_CARD: Record<TipoDocumentoPessoa, string> = {
  rg:                  'bg-gray-50 border-gray-200',
  cnh:                 'bg-blue-50/50 border-blue-100',
  certidao_nascimento: 'bg-green-50/50 border-green-100',
  certidao_casamento:  'bg-rose-50/50 border-rose-100',
  cpf:                 'bg-gray-50 border-gray-200',
  passaporte:          'bg-gray-50 border-gray-200',
  rne:                 'bg-gray-50 border-gray-200',
  outro:               'bg-gray-50 border-gray-200',
}

const TITULO_CARD: Record<TipoDocumentoPessoa, string> = {
  rg:                  'RG / Identidade',
  cnh:                 'CNH',
  certidao_nascimento: 'Certidão de Nascimento',
  certidao_casamento:  'Certidão de Casamento',
  cpf:                 'CPF',
  passaporte:          'Passaporte',
  rne:                 'RNE',
  outro:               'Outro',
}

// ── Estado local por card ──────────────────────────────────────────────────

type DocForm = {
  numero: string
  orgao_emissor: string
  uf_emissor: string
  data_emissao: string
  data_validade: string
  data_primeira_habilitacao: string
  cartorio: string
  matricula: string
  livro: string
  folha: string
  termo: string
  cidade_emissao: string
  uf_emissao: string
}

const FORM_VAZIO: DocForm = {
  numero: '', orgao_emissor: '', uf_emissor: '',
  data_emissao: '', data_validade: '', data_primeira_habilitacao: '',
  cartorio: '', matricula: '', livro: '', folha: '', termo: '',
  cidade_emissao: '', uf_emissao: '',
}

function docParaForm(doc: PessoaDocumento | undefined): DocForm {
  if (!doc) return FORM_VAZIO
  return {
    numero:                   doc.numero                   ?? '',
    orgao_emissor:            doc.orgao_emissor            ?? '',
    uf_emissor:               doc.uf_emissor               ?? '',
    data_emissao:             doc.data_emissao             ?? '',
    data_validade:            doc.data_validade            ?? '',
    data_primeira_habilitacao: doc.data_primeira_habilitacao ?? '',
    cartorio:                 doc.cartorio                 ?? '',
    matricula:                doc.matricula                ?? '',
    livro:                    doc.livro                    ?? '',
    folha:                    doc.folha                    ?? '',
    termo:                    doc.termo                    ?? '',
    cidade_emissao:           doc.cidade_emissao           ?? '',
    uf_emissao:               doc.uf_emissao               ?? '',
  }
}

function temDados(doc: PessoaDocumento | undefined): boolean {
  if (!doc) return false
  return !!(doc.numero || doc.orgao_emissor || doc.data_emissao || doc.data_validade ||
    doc.data_primeira_habilitacao || doc.cartorio || doc.matricula)
}

// ── Campos Label helper ────────────────────────────────────────────────────

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 mb-1 block">{label}</label>
      {children}
    </div>
  )
}

// ── Card por tipo ──────────────────────────────────────────────────────────

interface CardProps {
  tipo: TipoDocumentoPessoa
  doc: PessoaDocumento | undefined
  pessoaId: string
  empresaId: string
}

function DocumentoCard({ tipo, doc, pessoaId, empresaId }: CardProps) {
  const [aberto, setAberto] = useState(temDados(doc))
  const [form, setForm] = useState<DocForm>(docParaForm(doc))
  const [salvando, setSalvando] = useState(false)
  const f = (patch: Partial<DocForm>) => setForm((s) => ({ ...s, ...patch }))

  // Sincronizar quando dados externos mudam (ex: OCR confirmar)
  useEffect(() => {
    setForm(docParaForm(doc))
    if (temDados(doc)) setAberto(true)
  }, [doc?.id, doc?.atualizado_em])

  const upsert = useUpsertPessoaDocumento()

  async function salvar() {
    setSalvando(true)
    try {
      const payload: UpsertDocumentoInput = {
        empresa_id:  empresaId,
        pessoa_id:   pessoaId,
        tipo_documento: tipo,
        numero:       form.numero || null,
        orgao_emissor: form.orgao_emissor || null,
        uf_emissor:   form.uf_emissor || null,
        data_emissao: form.data_emissao || null,
        data_validade: form.data_validade || null,
        data_primeira_habilitacao: form.data_primeira_habilitacao || null,
        cartorio:     form.cartorio || null,
        matricula:    form.matricula || null,
        livro:        form.livro || null,
        folha:        form.folha || null,
        termo:        form.termo || null,
        cidade_emissao: form.cidade_emissao || null,
        uf_emissao:   form.uf_emissao || null,
        payload_ocr:  doc?.payload_ocr ?? null,
        documento_cliente_id: doc?.documento_cliente_id ?? null,
      }

      await upsert.mutateAsync(payload)

      // Sincronizar campos flat em pessoas para compat
      await sincronizarPessoasFlat(tipo, form, pessoaId)

      toast.success(`${TITULO_CARD[tipo]} salvo.`)
    } catch {
      toast.error('Erro ao salvar documento.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className={cn('rounded-lg border p-3 mb-3', COR_CARD[tipo])}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex items-center justify-between w-full"
      >
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
          {TITULO_CARD[tipo]}
          {temDados(doc) && (
            <span className="ml-2 text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full normal-case font-normal">
              preenchido
            </span>
          )}
        </span>
        {aberto
          ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
          : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        }
      </button>

      {aberto && (
        <div className="mt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* RG */}
            {tipo === 'rg' && <>
              <Campo label="Nº do RG">
                <Input value={form.numero} onChange={(e) => f({ numero: e.target.value })} placeholder="Ex: 9.755.869-8" />
              </Campo>
              <Campo label="Órgão emissor">
                <Input value={form.orgao_emissor} onChange={(e) => f({ orgao_emissor: e.target.value })} placeholder="Ex: SESP/PR" />
              </Campo>
              <Campo label="UF emissor">
                <Input value={form.uf_emissor} onChange={(e) => f({ uf_emissor: e.target.value.toUpperCase().slice(0, 2) })} placeholder="PR" maxLength={2} />
              </Campo>
              <Campo label="Data de emissão">
                <Input type="date" value={form.data_emissao} onChange={(e) => f({ data_emissao: e.target.value })} />
              </Campo>
            </>}

            {/* CNH */}
            {tipo === 'cnh' && <>
              <Campo label="Nº Registro CNH">
                <Input value={form.numero} onChange={(e) => f({ numero: e.target.value })} placeholder="Ex: 00123456789" />
              </Campo>
              <Campo label="Órgão emissor">
                <Input value={form.orgao_emissor} onChange={(e) => f({ orgao_emissor: e.target.value })} placeholder="Ex: DETRAN/PR" />
              </Campo>
              <Campo label="Data de emissão">
                <Input type="date" value={form.data_emissao} onChange={(e) => f({ data_emissao: e.target.value })} />
              </Campo>
              <Campo label="Validade">
                <Input type="date" value={form.data_validade} onChange={(e) => f({ data_validade: e.target.value })} />
              </Campo>
              <Campo label="Primeira habilitação">
                <Input type="date" value={form.data_primeira_habilitacao} onChange={(e) => f({ data_primeira_habilitacao: e.target.value })} />
              </Campo>
            </>}

            {/* Certidões */}
            {(tipo === 'certidao_nascimento' || tipo === 'certidao_casamento') && <>
              <Campo label="Cartório">
                <Input value={form.cartorio} onChange={(e) => f({ cartorio: e.target.value })} placeholder="Ex: 1º Cartório de Registro Civil" />
              </Campo>
              <Campo label="Data de emissão">
                <Input type="date" value={form.data_emissao} onChange={(e) => f({ data_emissao: e.target.value })} />
              </Campo>
              <Campo label="Matrícula">
                <Input value={form.matricula} onChange={(e) => f({ matricula: e.target.value })} />
              </Campo>
              <Campo label="Livro">
                <Input value={form.livro} onChange={(e) => f({ livro: e.target.value })} />
              </Campo>
              <Campo label="Folha">
                <Input value={form.folha} onChange={(e) => f({ folha: e.target.value })} />
              </Campo>
              <Campo label="Termo">
                <Input value={form.termo} onChange={(e) => f({ termo: e.target.value })} />
              </Campo>
              <Campo label="Cidade de emissão">
                <Input value={form.cidade_emissao} onChange={(e) => f({ cidade_emissao: e.target.value })} />
              </Campo>
              <Campo label="UF de emissão">
                <Input value={form.uf_emissao} onChange={(e) => f({ uf_emissao: e.target.value.toUpperCase().slice(0, 2) })} placeholder="PR" maxLength={2} />
              </Campo>
            </>}
          </div>

          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={salvando}
              onClick={salvar}
            >
              {salvando && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Salvar {TITULO_CARD[tipo]}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sincronização campos flat em pessoas (compat) ─────────────────────────

async function sincronizarPessoasFlat(
  tipo: TipoDocumentoPessoa,
  form: DocForm,
  pessoaId: string,
) {
  if (tipo === 'rg') {
    await supabase
      .from('pessoas')
      .update({ rg: form.numero || null })
      .eq('id', pessoaId)
  } else if (tipo === 'cnh') {
    await supabase
      .from('pessoas')
      .update({
        registro_cnh:           form.numero                   || null,
        validade_cnh:           form.data_validade            || null,
        primeira_habilitacao_cnh: form.data_primeira_habilitacao || null,
      })
      .eq('id', pessoaId)
  }
}

// ── Componente principal ───────────────────────────────────────────────────

interface Props {
  pessoaId: string
  empresaId: string
}

export function DocumentosIdentidadeSection({ pessoaId, empresaId }: Props) {
  const { data: documentos = [], isLoading } = usePessoaDocumentos(pessoaId)

  const porTipo = (tipo: TipoDocumentoPessoa) =>
    documentos.find((d) => d.tipo_documento === tipo)

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        Carregando documentos...
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {TIPOS_VISIVEIS.map((tipo) => (
        <DocumentoCard
          key={tipo}
          tipo={tipo}
          doc={porTipo(tipo)}
          pessoaId={pessoaId}
          empresaId={empresaId}
        />
      ))}
    </div>
  )
}
