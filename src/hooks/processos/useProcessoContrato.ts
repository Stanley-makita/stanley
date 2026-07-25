'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { toast } from 'sonner'

export interface ProcessoContrato {
  id: string
  empresa_id: string
  processo_id: string
  tipo_modelo: string
  titulo: string
  conteudo_html: string
  criado_por: string
  versao: number
  created_at: string
  updated_at: string
  clicksign_status: string | null
  clicksign_signed_url: string | null
  clicksign_enviado_em: string | null
  clicksign_assinado_em: string | null
  resumo_negociacao_json: import('@/lib/contratos/entenderNegociacao').ResumoNegociacao | null
  plano_contrato_json: unknown | null
  pdf_storage_path: string | null
  pdf_gerado_em: string | null
}

/**
 * Etapa "Compreensão da Negociação": chama a IA (via API route, que já lê os
 * documentos/OCR do processo) e devolve o resumo estruturado — NÃO persiste.
 * Persistência só acontece em useConfirmarEntendimento, depois que o usuário
 * revisar e confirmar.
 */
export function useEntenderNegociacao(processoId: string) {
  return useMutation({
    mutationFn: async (descricao: string) => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/processos/${processoId}/contratos/entender`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ descricao }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao entender a negociação.')
      return json.resumo as import('@/lib/contratos/entenderNegociacao').ResumoNegociacao
    },
    onError: (error) => {
      console.error('[contratos] erro ao entender negociação:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao entender a negociação.')
    },
  })
}

/**
 * Confirma o resumo estruturado — cria (1ª vez) ou atualiza (revisões
 * seguintes, antes de construir a minuta) o rascunho de contrato com
 * resumo_negociacao_json. É "patrimônio" do negócio, não estado de tela.
 */
export function useConfirmarEntendimento(processoId: string) {
  const { usuario } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: {
      rascunhoId: string | null
      tipoContrato: string
      resumo: import('@/lib/contratos/entenderNegociacao').ResumoNegociacao
    }): Promise<string> => {
      if (payload.rascunhoId) {
        const { error } = await supabase
          .from('processo_contratos')
          .update({ resumo_negociacao_json: payload.resumo, updated_at: new Date().toISOString() })
          .eq('id', payload.rascunhoId)
        if (error) throw error
        return payload.rascunhoId
      }

      const { data: existentes } = await supabase
        .from('processo_contratos')
        .select('versao')
        .eq('processo_id', processoId)
      const maxVersao = Math.max(0, ...(existentes ?? []).map((c) => c.versao ?? 1))

      const { data, error } = await supabase
        .from('processo_contratos')
        .insert({
          processo_id: processoId,
          empresa_id: usuario!.empresa_id,
          criado_por: usuario!.id,
          tipo_modelo: payload.tipoContrato,
          titulo: 'Rascunho',
          conteudo_html: '',
          resumo_negociacao_json: payload.resumo,
          versao: maxVersao + 1,
        })
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processo-contratos', processoId] })
    },
    onError: (error) => {
      console.error('[contratos] erro ao confirmar entendimento:', error)
      toast.error('Erro ao salvar o entendimento da negociação.')
    },
  })
}

export function useProcessoContratos(processoId: string) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['processo-contratos', processoId],
    queryFn: async (): Promise<ProcessoContrato[]> => {
      const { data, error } = await supabase
        .from('processo_contratos')
        .select('*')
        .eq('processo_id', processoId)
        .eq('empresa_id', usuario!.empresa_id)
        .order('created_at', { ascending: true })

      if (error) throw error
      return data ?? []
    },
    enabled: !!usuario?.empresa_id && !!processoId,
  })
}

export function useSalvarContrato(processoId: string) {
  const { usuario } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: {
      id?: string
      tipo_modelo: string
      titulo: string
      conteudo_html: string
    }): Promise<string> => {
      if (payload.id) {
        const { error } = await supabase
          .from('processo_contratos')
          .update({
            titulo: payload.titulo,
            conteudo_html: payload.conteudo_html,
            updated_at: new Date().toISOString(),
          })
          .eq('id', payload.id)
        if (error) throw error
        return payload.id
      }

      // Novo contrato: calcular próxima versão
      const { data: existentes } = await supabase
        .from('processo_contratos')
        .select('versao')
        .eq('processo_id', processoId)
      const maxVersao = Math.max(0, ...(existentes ?? []).map((c) => c.versao ?? 1))

      const { data, error } = await supabase
        .from('processo_contratos')
        .insert({
          processo_id: processoId,
          empresa_id: usuario!.empresa_id,
          criado_por: usuario!.id,
          tipo_modelo: payload.tipo_modelo,
          titulo: payload.titulo,
          conteudo_html: payload.conteudo_html,
          versao: maxVersao + 1,
        })
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processo-contratos', processoId] })
      toast.success('Contrato salvo com sucesso.')
    },
    onError: () => {
      toast.error('Não foi possível salvar o contrato. Tente novamente.')
    },
  })
}

/**
 * Etapa "Plano do Contrato": a partir do resumo já confirmado (lido direto do
 * rascunho salvo), devolve a estrutura de cláusulas prevista — ainda sem
 * persistir. Persistência acontece em useConfirmarPlano, depois que o usuário
 * revisar e confirmar (mesma filosofia da etapa anterior).
 */
export function useGerarPlanoContrato(processoId: string) {
  return useMutation({
    mutationFn: async (contratoId: string) => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/processos/${processoId}/contratos/${contratoId}/plano`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao planejar o contrato.')
      return json.plano as import('@/lib/contratos/planejarContrato').PlanoContrato
    },
    onError: (error) => {
      console.error('[contratos] erro ao planejar contrato:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao planejar o contrato.')
    },
  })
}

export function useConfirmarPlano(processoId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: { contratoId: string; plano: import('@/lib/contratos/planejarContrato').PlanoContrato }) => {
      const { error } = await supabase
        .from('processo_contratos')
        .update({ plano_contrato_json: payload.plano, updated_at: new Date().toISOString() })
        .eq('id', payload.contratoId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processo-contratos', processoId] })
    },
    onError: (error) => {
      console.error('[contratos] erro ao confirmar plano:', error)
      toast.error('Erro ao salvar o plano do contrato.')
    },
  })
}

/**
 * Registra na Timeline do processo (mesmo canal usado pelo trigger
 * `fn_contrato_timeline_evento`) se a geração da minuta seguiu direto porque
 * a IA não encontrou pendência nenhuma ("confirmação automática sem
 * pendências") ou porque o operador revisou e confirmou manualmente um
 * cartão de pendências ("confirmação manual do operador") — distinção pedida
 * pra rastreabilidade jurídica de quem validou o quê.
 */
export function useRegistrarConfirmacaoGeracao(processoId: string) {
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (payload: { tipoConfirmacao: 'automatica' | 'manual'; tituloContrato: string }) => {
      const texto = payload.tipoConfirmacao === 'automatica'
        ? `Minuta de "${payload.tituloContrato}" gerada automaticamente — a IA não encontrou pendências (sem revisão manual do operador).`
        : `Minuta de "${payload.tituloContrato}" gerada após revisão e confirmação manual do operador (pendências identificadas antes de continuar).`
      const { error } = await supabase.from('processo_comentarios').insert({
        empresa_id: usuario!.empresa_id,
        processo_id: processoId,
        usuario_id: payload.tipoConfirmacao === 'manual' ? usuario!.id : null,
        tipo: 'alteracao',
        texto,
        notificar_cliente: false,
      })
      if (error) throw error
    },
    onError: (error) => {
      console.error('[contratos] erro ao registrar confirmação de geração:', error)
    },
  })
}

const BUCKET_CONTRATOS = 'documentos-clientes'

/**
 * "Gerar/atualizar PDF da versão atual" — só pode ser chamada enquanto a
 * versão ainda não foi enviada ao ClickSign (ver regra de congelamento em
 * `AbaContrato.tsx`); repetir a ação sobrescreve o mesmo arquivo (mesma
 * versão), nunca cria um artefato pra outra versão. Reaproveita a mesma
 * geração jsPDF/html2canvas de sempre (`gerarPdfBlobContrato`).
 */
export function useGerarPdfContrato(processoId: string) {
  const { usuario } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: { contratoId: string; titulo: string; conteudoHtml: string }): Promise<string> => {
      const { gerarPdfBlobContrato } = await import('@/lib/contratos/gerarPdfContrato')
      const blob = await gerarPdfBlobContrato(payload.conteudoHtml, payload.titulo)
      const storagePath = `${usuario!.empresa_id}/contratos/${payload.contratoId}.pdf`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_CONTRATOS)
        .upload(storagePath, blob, { upsert: true, contentType: 'application/pdf' })
      if (uploadError) throw new Error(uploadError.message)

      const { error } = await supabase
        .from('processo_contratos')
        .update({ pdf_storage_path: storagePath, pdf_gerado_em: new Date().toISOString() })
        .eq('id', payload.contratoId)
      if (error) throw error

      return storagePath
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processo-contratos', processoId] })
      toast.success('PDF gerado com sucesso.')
    },
    onError: (error) => {
      console.error('[contratos] erro ao gerar PDF:', error)
      toast.error('Erro ao gerar o PDF do contrato.')
    },
  })
}

export async function abrirPdfStorage(storagePath: string, download?: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from(BUCKET_CONTRATOS)
    .createSignedUrl(storagePath, 3600, download ? { download } : undefined)
  return data?.signedUrl ?? null
}

/** Lê o PDF já gerado da versão (storage) — usado por "Enviar para ClickSign"
 * pra reaproveitar o mesmo arquivo em vez de gerar um novo na hora. */
export async function baixarPdfContrato(storagePath: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET_CONTRATOS).download(storagePath)
  if (error || !data) throw new Error(error?.message ?? 'Não foi possível ler o PDF gerado.')
  return data
}

/**
 * "Reenviar uma nova versão" — cria uma cópia editável (nova linha,
 * `versao + 1`) de um contrato já enviado/recusado/cancelado/expirado, sem
 * tocar na versão de origem (que permanece congelada e com seu histórico
 * intacto). O PDF e o envio ao ClickSign da nova versão são independentes.
 */
export function useCriarNovaVersaoContrato(processoId: string) {
  const { usuario } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (origem: ProcessoContrato): Promise<string> => {
      const { data: existentes } = await supabase
        .from('processo_contratos')
        .select('versao')
        .eq('processo_id', processoId)
      const maxVersao = Math.max(0, ...(existentes ?? []).map((c) => c.versao ?? 1))

      const { data, error } = await supabase
        .from('processo_contratos')
        .insert({
          processo_id: processoId,
          empresa_id: usuario!.empresa_id,
          criado_por: usuario!.id,
          tipo_modelo: origem.tipo_modelo,
          titulo: origem.titulo,
          conteudo_html: origem.conteudo_html,
          resumo_negociacao_json: origem.resumo_negociacao_json,
          plano_contrato_json: origem.plano_contrato_json,
          versao: maxVersao + 1,
        })
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processo-contratos', processoId] })
    },
    onError: (error) => {
      console.error('[contratos] erro ao criar nova versão do contrato:', error)
      toast.error('Erro ao criar nova versão do contrato.')
    },
  })
}
