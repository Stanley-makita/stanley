// Adapta dados de um Lead para a estrutura DadosProcesso usada pelos mappers.
// Participantes V2: compradores vêm só de `participacoes` (spec 2026-09-28).
import type { DadosProcesso, DadosFgts } from './dados'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { carregarParticipantes } from '@/lib/participantes/carregar'
import { montarCompradores, montarVendedores } from '@/lib/participantes/compradores'

export async function buscarDadosFormularioLead(leadId: string): Promise<DadosProcesso> {
  const sb = supabaseAdmin
  const { data: lead, error: errLead } = await sb
    .from('leads')
    .select('id, empresa_id, banco_pretendido, valor_imovel, valor_pretendido, entrada, prazo_meses, cidade_imovel, tipo_imovel')
    .eq('id', leadId)
    .single()
  if (errLead) throw errLead

  const participantes = await carregarParticipantes(sb, { tipo: 'lead', id: lead.id }, lead.empresa_id)
  const compradores = montarCompradores(participantes)

  let fgtsContas: DadosFgts[] = []
  const titular = compradores.find(c => c.principal)
  if (titular) {
    const { data: fgtsRows, error: eF } = await sb
      .from('pessoa_fgts_contas')
      .select('pis_pasep, cod_empregador, nro_conta_fgts, valor_saque, saldo_disponivel')
      .eq('pessoa_id', titular.id)
      .order('created_at', { ascending: true })
    if (eF) throw eF
    fgtsContas = fgtsRows ?? []
  }

  return {
    id:                              lead.id,
    empresa_id:                      lead.empresa_id,
    numero_processo:                 `LEAD-${lead.id.slice(0, 8).toUpperCase()}`,
    banco_nome:                      lead.banco_pretendido ?? null,
    modalidade:                      'financiamento',
    valor_imovel:                    lead.valor_imovel ?? null,
    valor_financiado:                lead.valor_pretendido ?? null,
    valor_entrada:                   lead.entrada ?? null,
    valor_recursos_proprios:         null,
    valor_fgts:                      null,
    prazo_amortizacao_meses:         lead.prazo_meses ?? null,
    dia_vencimento_parcela:          null,
    sistema_amortizacao:             null,
    indexador:                       null,
    financiar_despesas_cartorariais: false,
    compradores,
    vendedores:                      montarVendedores(participantes),
    imovel: {
      rua: null, numero: null, bairro: null,
      cidade: lead.cidade_imovel ?? null,
      uf: null, cep: null, apto_unidade: null, categoria: null,
      tipo: lead.tipo_imovel ?? null,
      matricula: null,
    },
    fgts_comprador1: fgtsContas,
  }
}
