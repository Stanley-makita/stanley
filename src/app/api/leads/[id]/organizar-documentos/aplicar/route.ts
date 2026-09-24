import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { resolverUsuarioELead, carregarDocumentosDoLead } from '@/lib/documentos/contextoLeadServidor'
import { planejarGravacaoPastas, filtrarDocumentosDoLead } from '@/lib/documentos/organizarPastas'

/**
 * Grava a pasta dos documentos no vínculo com o lead (documento_vinculos,
 * entidade_tipo='lead'). Documento só da Pessoa ganha o vínculo. Nunca toca
 * em `documentos` — o dono continua sendo a Pessoa (CLAUDE.md, invariante 2).
 * Usada pelo "Organizar arquivos" e pelo "mover de pasta" manual na Captação.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolverUsuarioELead(request, params.id)
  if (ctx instanceof NextResponse) return ctx
  const { usuario, lead } = ctx

  const body = await request.json().catch(() => ({})) as { itens?: { documento_id: string; pasta_id: string | null }[] }
  const itensBrutos = Array.isArray(body.itens) ? body.itens : []
  // Dedup por documento_id: em requisição duplicada/concorrente, o último item
  // do array vence (mesmo padrão que um novo clique substituiria o anterior).
  const itens = Array.from(new Map(itensBrutos.map(i => [i.documento_id, i])).values())

  const { docs, idsComVinculoLead } = await carregarDocumentosDoLead(lead.id, lead.pessoa_id, usuario.empresa_id)
  const permitidos = new Set(filtrarDocumentosDoLead(itens.map(i => i.documento_id), docs).map(d => d.id))
  const validos = itens.filter(i => permitidos.has(i.documento_id))
  const { atualizar, criar } = planejarGravacaoPastas(validos, idsComVinculoLead)

  for (const item of atualizar) {
    const { data, error } = await supabase
      .from('documento_vinculos')
      .update({ pasta_id: item.pasta_id })
      .eq('documento_id', item.documento_id)
      .eq('entidade_tipo', 'lead')
      .eq('entidade_id', lead.id)
      .eq('empresa_id', usuario.empresa_id)
      .select('id')
    if (error || !data || data.length === 0) {
      console.error('[organizar-documentos/aplicar] vínculo não atualizado:', item.documento_id, error?.message)
      return NextResponse.json({ error: 'Não foi possível mover um dos documentos. Recarregue e tente de novo.' }, { status: 500 })
    }
  }

  if (criar.length > 0) {
    // upsert (não insert): há índice único (documento_id, entidade_tipo, entidade_id) —
    // duas requisições concorrentes pro mesmo documento sem vínculo ainda não colidem
    // com erro de duplicidade, a segunda só atualiza a pasta da primeira.
    const { data, error } = await supabase
      .from('documento_vinculos')
      .upsert(criar.map(c => ({
        empresa_id:    usuario.empresa_id,
        documento_id:  c.documento_id,
        entidade_tipo: 'lead',
        entidade_id:   lead.id,
        vinculado_por: usuario.id,
        pasta_id:      c.pasta_id,
      })), { onConflict: 'documento_id,entidade_tipo,entidade_id' })
      .select('id')
    if (error || !data || data.length !== criar.length) {
      console.error('[organizar-documentos/aplicar] vínculo não criado:', error?.message)
      return NextResponse.json({ error: 'Não foi possível mover um dos documentos. Recarregue e tente de novo.' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, atualizados: atualizar.length, criados: criar.length })
}
