import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Sprint Inteligência Documental — Fase E (dual-write).
 * Espelha um INSERT em `documentos_clientes` para o modelo unificado
 * (`documentos` + `documento_vinculos`), reaproveitando a mesma regra de
 * resolução de pessoa_id usada nas migrations 144/145 (direto → via lead
 * → via comprador principal do processo, sem fuzzy match de CPF/nome).
 *
 * Best-effort: nunca lança erro — se a sincronização falhar, o fluxo
 * principal (que já gravou em documentos_clientes) não deve ser afetado.
 * `documentos_clientes` continua sendo a fonte de leitura até o corte
 * de leitura ser feito componente a componente.
 */
export async function sincronizarDocumentoUnificado(
  supabase: SupabaseClient,
  doc: {
    id: string
    empresa_id: string
    pessoa_id?: string | null
    lead_id?: string | null
    processo_id?: string | null
    nome_original: string
    nome_exibicao?: string | null
    mime_type?: string | null
    tamanho_bytes?: number | null
    storage_bucket: string
    storage_path: string
    canal_origem?: string | null
    classificacao?: string | null
    ocr_status?: string | null
    permanente?: boolean | null
    validade_data?: string | null
    validade_dias?: number | null
    created_at?: string | null
  },
  opcoes?: { vinculadoPor?: string | null },
): Promise<void> {
  try {
    let pessoaId = doc.pessoa_id ?? null

    if (!pessoaId && doc.lead_id) {
      const { data: lead } = await supabase
        .from('leads')
        .select('pessoa_id')
        .eq('id', doc.lead_id)
        .maybeSingle()
      pessoaId = lead?.pessoa_id ?? null
    }

    if (!pessoaId && doc.processo_id) {
      const { data: comprador } = await supabase
        .from('processo_compradores')
        .select('pessoa_id')
        .eq('processo_id', doc.processo_id)
        .not('pessoa_id', 'is', null)
        .order('principal', { ascending: false })
        .limit(1)
        .maybeSingle()
      pessoaId = comprador?.pessoa_id ?? null
    }

    // Mesmo critério da migration: sem pessoa resolvível, não entra no
    // modelo novo ainda (fica só em documentos_clientes, igual aos
    // documentos históricos não migrados).
    if (!pessoaId) return

    let catalogoTipoId: string | null = null
    if (doc.classificacao) {
      const { data: cat } = await supabase
        .from('catalogo_tipos_documento')
        .select('id')
        .eq('codigo', doc.classificacao)
        .maybeSingle()
      catalogoTipoId = cat?.id ?? null
    }

    const { error: errDoc } = await supabase
      .from('documentos')
      .upsert(
        {
          id: doc.id,
          empresa_id: doc.empresa_id,
          dominio: 'acervo_documental',
          pessoa_id: pessoaId,
          processo_id: null,
          catalogo_tipo_id: catalogoTipoId,
          classificacao_legado: doc.classificacao ?? null,
          nome_original: doc.nome_original,
          nome_exibicao: doc.nome_exibicao ?? null,
          mime_type: doc.mime_type ?? null,
          tamanho_bytes: doc.tamanho_bytes ?? null,
          storage_bucket: doc.storage_bucket,
          storage_path: doc.storage_path,
          origem: doc.canal_origem ?? 'upload_manual',
          status_ocr: doc.ocr_status ?? null,
          permanente: doc.permanente ?? false,
          validade_data: doc.validade_data ?? null,
          validade_dias: doc.validade_dias ?? null,
          recebido_em: doc.created_at ?? new Date().toISOString(),
        },
        { onConflict: 'id', ignoreDuplicates: true },
      )
    if (errDoc) {
      console.error('[sincronizarDocumentoUnificado] falha ao gravar em documentos:', errDoc.message)
      return
    }

    const vinculos: Array<{ entidade_tipo: 'lead' | 'processo'; entidade_id: string }> = []
    if (doc.lead_id) vinculos.push({ entidade_tipo: 'lead', entidade_id: doc.lead_id })
    if (doc.processo_id) vinculos.push({ entidade_tipo: 'processo', entidade_id: doc.processo_id })

    for (const v of vinculos) {
      await supabase
        .from('documento_vinculos')
        .upsert(
          {
            empresa_id: doc.empresa_id,
            documento_id: doc.id,
            entidade_tipo: v.entidade_tipo,
            entidade_id: v.entidade_id,
            vinculado_por: opcoes?.vinculadoPor ?? null,
          },
          { onConflict: 'documento_id,entidade_tipo,entidade_id', ignoreDuplicates: true },
        )
    }
  } catch (err) {
    console.error('[sincronizarDocumentoUnificado] erro inesperado:', err)
  }
}
