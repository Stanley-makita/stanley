import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

/** Autentica pelo Bearer e confere que o lead é da empresa do usuário. */
export async function resolverUsuarioELead(request: NextRequest, leadId: string) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { data: usuario } = await supabase
    .from('usuarios').select('id, empresa_id').eq('auth_user_id', user.id).single()
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { data: lead } = await supabase
    .from('leads').select('id, pessoa_id')
    .eq('id', leadId).eq('empresa_id', usuario.empresa_id).is('deleted_at', null)
    .maybeSingle()
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
  return { usuario: usuario as { id: string; empresa_id: string }, lead: lead as { id: string; pessoa_id: string | null } }
}

/**
 * Mesmo universo que a aba Documentos do lead mostra (AbaDocumentos): vínculo
 * direto com o lead + documentos do acervo da Pessoa do lead sem vínculo com
 * lead/lead_historico.
 */
export async function carregarDocumentosDoLead(leadId: string, pessoaId: string | null, empresaId: string) {
  const { data: vinculos } = await supabase
    .from('documento_vinculos').select('documento_id')
    .eq('entidade_tipo', 'lead').eq('entidade_id', leadId).eq('empresa_id', empresaId)
  const idsComVinculoLead = new Set((vinculos ?? []).map(v => v.documento_id as string))

  let idsPessoaSemVinculo: string[] = []
  if (pessoaId) {
    const { data: docsPessoa } = await supabase
      .from('documentos').select('id')
      .eq('dominio', 'acervo_documental').eq('pessoa_id', pessoaId)
      .eq('empresa_id', empresaId).is('deleted_at', null)
    const idsPessoa = (docsPessoa ?? []).map(d => d.id as string)
    if (idsPessoa.length > 0) {
      const { data: comLead } = await supabase
        .from('documento_vinculos').select('documento_id')
        .in('entidade_tipo', ['lead', 'lead_historico']).in('documento_id', idsPessoa)
      const set = new Set((comLead ?? []).map(v => v.documento_id as string))
      idsPessoaSemVinculo = idsPessoa.filter(id => !set.has(id))
    }
  }

  const ids = Array.from(new Set([...Array.from(idsComVinculoLead), ...idsPessoaSemVinculo]))
  if (ids.length === 0) return { docs: [], idsComVinculoLead }
  const { data: docs } = await supabase
    .from('documentos').select('id, pessoa_id, classificacao_legado')
    .in('id', ids).eq('empresa_id', empresaId).is('deleted_at', null)
  return {
    docs: (docs ?? []) as { id: string; pessoa_id: string | null; classificacao_legado: string | null }[],
    idsComVinculoLead,
  }
}

export async function carregarVendedoresDoLead(leadId: string): Promise<string[]> {
  const { data } = await supabase.from('lead_vendedores').select('pessoa_id').eq('lead_id', leadId)
  return (data ?? []).map(v => v.pessoa_id as string)
}

/** codigo do tipo → codigo da pasta sugerida (catalogo_tipos_documento). */
export async function carregarPastaSugeridaPorTipo(): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('catalogo_tipos_documento').select('codigo, pasta_sugerida_codigo')
    .not('pasta_sugerida_codigo', 'is', null)
  return new Map((data ?? []).map(t => [t.codigo as string, t.pasta_sugerida_codigo as string]))
}
