'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import type { OcrResultado } from '@/lib/documentos/ocr'

export interface SugestaoOcr {
  campo: string
  label: string
  valorAtual: string | null
  valorEncontrado: string
  categoria: 'novo' | 'conflito'
  documento_id: string
  confianca: 'alta' | 'media' | 'baixa'
}

export interface OcrSugestoesResult {
  sugestoes: SugestaoOcr[]
  totalNovos: number
  totalConflitos: number
  isLoading: boolean
}

const CAMPO_LABELS: Record<string, string> = {
  nome:                     'Nome',
  cpf:                      'CPF',
  rg:                       'RG',
  data_nascimento:          'Data de nascimento',
  data_emissao:             'Data de emissão',
  cidade_nascimento:        'Cidade de nascimento',
  estado_nascimento:        'UF de nascimento',
  orgao_emissor:            'Órgão emissor',
  filiacao_mae:             'Filiação (mãe)',
  filiacao_pai:             'Filiação (pai)',
  registro_cnh:             'Nº Registro CNH',
  validade_cnh:             'Validade da habilitação',
  primeira_habilitacao_cnh: 'Primeira habilitação',
  estado_civil:             'Estado civil',
  regime_casamento:         'Regime de bens',
  data_casamento:           'Data de casamento',
  endereco_rua:             'Rua',
  endereco_numero:          'Número',
  endereco_bairro:          'Bairro',
  endereco_cidade:          'Cidade',
  endereco_uf:              'UF',
  endereco_cep:             'CEP',
}

const CAMPOS_OCR = Object.keys(CAMPO_LABELS)

export function useOcrSugestoes(leadId: string): OcrSugestoesResult {
  const { usuario } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['ocr-sugestoes', leadId],
    enabled: !!usuario && !!leadId,
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<SugestaoOcr[]> => {
      // Busca pessoa_id do lead
      const { data: lead } = await supabase
        .from('leads')
        .select('pessoa_id')
        .eq('id', leadId)
        .eq('empresa_id', usuario!.empresa_id)
        .maybeSingle()

      if (!lead?.pessoa_id) return []

      // Busca campos atuais da Pessoa
      const { data: pessoa } = await supabase
        .from('pessoas')
        .select(CAMPOS_OCR.join(', '))
        .eq('id', lead.pessoa_id)
        .maybeSingle()

      if (!pessoa) return []

      // Fase E (corte de leitura): descobre IDs via documento_vinculos (lead) + acervo da
      // pessoa (documentos), lê OCR de extracoes_ocr (vigente).
      const [{ data: vinculosLead }, { data: docsPessoa }] = await Promise.all([
        supabase
          .from('documento_vinculos')
          .select('documento_id')
          .eq('entidade_tipo', 'lead')
          .eq('entidade_id', leadId)
          .eq('empresa_id', usuario!.empresa_id),
        supabase
          .from('documentos')
          .select('id')
          .eq('dominio', 'acervo_documental')
          .eq('pessoa_id', lead.pessoa_id)
          .eq('empresa_id', usuario!.empresa_id),
      ])
      const idsCandidatos = Array.from(new Set([
        ...(vinculosLead ?? []).map(v => v.documento_id),
        ...(docsPessoa ?? []).map(d => d.id),
      ]))
      if (idsCandidatos.length === 0) return []

      // Busca documentos com OCR concluído (exceto FGTS)
      const { data: docsBase } = await supabase
        .from('documentos')
        .select('id, classificacao:classificacao_legado')
        .in('id', idsCandidatos)
        .eq('empresa_id', usuario!.empresa_id)
        .eq('status_ocr', 'concluido')
        .neq('classificacao_legado', 'extrato_fgts')

      if (!docsBase || docsBase.length === 0) return []

      const { data: extracoes } = await supabase
        .from('extracoes_ocr')
        .select('documento_id, dados, dados_validados')
        .in('documento_id', docsBase.map(d => d.id))
        .eq('vigente', true)

      const ocrPorDocumento = new Map((extracoes ?? []).map(e => [e.documento_id, e.dados_validados ?? e.dados ?? null]))
      const docs = docsBase
        .map(d => ({ ...d, ocr_dados: ocrPorDocumento.get(d.id) ?? null }))
        .filter(d => d.ocr_dados !== null)

      if (!docs || docs.length === 0) return []

      const CAMPOS_DATA = new Set(['data_nascimento', 'data_casamento', 'data_emissao', 'validade_cnh', 'primeira_habilitacao_cnh'])
      const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

      function formatarValorExibicao(campo: string, valor: string): string {
        if (CAMPOS_DATA.has(campo) && DATA_RE.test(valor)) {
          const [y, m, d] = valor.split('-')
          return `${d}/${m}/${y}`
        }
        return valor
      }

      function validarValor(campo: string, valor: string): boolean {
        // CPF deve ter exatamente 11 dígitos
        if (campo === 'cpf' && valor.replace(/\D/g, '').length !== 11) return false
        // Datas devem estar no formato YYYY-MM-DD
        if (CAMPOS_DATA.has(campo) && !DATA_RE.test(valor)) return false
        return true
      }

      // Agrega sugestões — último documento que tiver o campo vence (dedup por campo)
      const map = new Map<string, SugestaoOcr>()

      for (const doc of docs) {
        const ocr = doc.ocr_dados as OcrResultado
        if (!ocr) continue

        for (const campo of CAMPOS_OCR) {
          const valorEncontrado = (ocr as unknown as Record<string, unknown>)[campo]
          if (!valorEncontrado || typeof valorEncontrado !== 'string') continue

          const valorBruto = valorEncontrado.trim()
          if (!validarValor(campo, valorBruto)) continue

          const valorAtual = (pessoa as unknown as Record<string, unknown>)[campo]
          const strAtual = valorAtual ? String(valorAtual).trim() : null

          if (strAtual && strAtual.toLowerCase() === valorBruto.toLowerCase()) continue

          const categoria: 'novo' | 'conflito' = strAtual ? 'conflito' : 'novo'

          // Se já existe para este campo e é 'conflito', mantém; 'novo' pode ser sobrescrito
          if (map.has(campo) && categoria === 'novo') continue

          map.set(campo, {
            campo,
            label:           CAMPO_LABELS[campo] ?? campo,
            valorAtual:      strAtual ? formatarValorExibicao(campo, strAtual) : null,
            valorEncontrado: formatarValorExibicao(campo, valorBruto),
            categoria,
            documento_id:    doc.id,
            confianca:       ocr.confianca ?? 'media',
          })
        }
      }

      return Array.from(map.values())
    },
  })

  const sugestoes = data ?? []
  return {
    sugestoes,
    totalNovos:     sugestoes.filter(s => s.categoria === 'novo').length,
    totalConflitos: sugestoes.filter(s => s.categoria === 'conflito').length,
    isLoading,
  }
}
