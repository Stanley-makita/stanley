import type { SupabaseClient } from '@supabase/supabase-js'

// "Comercial notificado via WhatsApp" no Histórico (pedido 20/10/2026): toda mensagem
// automática de WhatsApp ao comercial sobre um lead/negócio fica registrada na linha do
// tempo. Lead → lead_historico ('acao_operacional', autor = Sistema). Negócio →
// processo_comentarios ('alteracao'; usuario_id é obrigatório lá, então vai o comercial
// avisado). Best-effort: falha ao registrar nunca derruba o aviso.
export async function registrarAvisoWhatsappComercial(
  supabase: SupabaseClient,
  p: {
    empresaId: string
    leadId: string | null
    processoId: string | null
    comercial: { id: string; nome: string | null }
    assunto: string
  },
): Promise<void> {
  const texto = `Comercial notificado via WhatsApp — ${p.comercial.nome ?? 'comercial'}: ${p.assunto}`
  try {
    const { error } = p.processoId
      ? await supabase.from('processo_comentarios').insert({
        empresa_id: p.empresaId, processo_id: p.processoId, usuario_id: p.comercial.id, tipo: 'alteracao', texto,
      })
      : p.leadId
        ? await supabase.from('lead_historico').insert({
          empresa_id: p.empresaId, lead_id: p.leadId, tipo: 'acao_operacional', descricao: texto,
        })
        : { error: null }
    if (error) console.error('[historico] aviso ao comercial não registrado:', error.message)
  } catch (err) {
    console.error('[historico] aviso ao comercial não registrado:', err)
  }
}
