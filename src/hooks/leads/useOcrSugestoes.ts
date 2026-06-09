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
  nome:             'Nome',
  cpf:              'CPF',
  rg:               'RG',
  data_nascimento:  'Data de nascimento',
  orgao_emissor:    'Órgão emissor',
  filiacao_mae:     'Filiação (mãe)',
  filiacao_pai:     'Filiação (pai)',
  estado_civil:     'Estado civil',
  regime_casamento: 'Regime de bens',
  data_casamento:   'Data de casamento',
  endereco_rua:     'Rua',
  endereco_numero:  'Número',
  endereco_bairro:  'Bairro',
  endereco_cidade:  'Cidade',
  endereco_uf:      'UF',
  endereco_cep:     'CEP',
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

      // Busca documentos com OCR concluído (exceto FGTS)
      const { data: docs } = await supabase
        .from('documentos_clientes')
        .select('id, ocr_dados, classificacao')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('ocr_status', 'concluido')
        .not('ocr_dados', 'is', null)
        .neq('classificacao', 'extrato_fgts')
        .or(`lead_id.eq.${leadId},pessoa_id.eq.${lead.pessoa_id}`)

      if (!docs || docs.length === 0) return []

      // Agrega sugestões — último documento que tiver o campo vence (dedup por campo)
      const map = new Map<string, SugestaoOcr>()

      for (const doc of docs) {
        const ocr = doc.ocr_dados as OcrResultado
        if (!ocr) continue

        for (const campo of CAMPOS_OCR) {
          const valorEncontrado = (ocr as unknown as Record<string, unknown>)[campo]
          if (!valorEncontrado || typeof valorEncontrado !== 'string') continue

          const valorAtual = (pessoa as unknown as Record<string, unknown>)[campo]
          const strAtual = valorAtual ? String(valorAtual).trim() : null

          if (strAtual && strAtual.toLowerCase() === valorEncontrado.trim().toLowerCase()) continue

          const categoria: 'novo' | 'conflito' = strAtual ? 'conflito' : 'novo'

          // Se já existe para este campo e é 'conflito', mantém; 'novo' pode ser sobrescrito
          if (map.has(campo) && categoria === 'novo') continue

          map.set(campo, {
            campo,
            label:          CAMPO_LABELS[campo] ?? campo,
            valorAtual:     strAtual,
            valorEncontrado: valorEncontrado.trim(),
            categoria,
            documento_id:   doc.id,
            confianca:      ocr.confianca ?? 'media',
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
