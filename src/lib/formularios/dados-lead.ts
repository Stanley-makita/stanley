// Adapta dados de um Lead para a estrutura DadosProcesso usada pelos mappers
import type { DadosProcesso, DadosComprador, DadosFgts } from './dados'
import { supabaseAdmin } from '@/lib/supabase/admin'

function getClient() {
  return supabaseAdmin
}

export async function buscarDadosFormularioLead(leadId: string): Promise<DadosProcesso> {
  const sb = getClient()

  // 1. Buscar lead
  const { data: lead, error: errLead } = await sb
    .from('leads')
    .select(`
      id, empresa_id, nome, cpf, email, telefone,
      banco_pretendido, valor_imovel, valor_pretendido, entrada, prazo_meses,
      cidade_imovel, tipo_imovel,
      renda_formal, renda_informal, renda_considerada,
      estado_civil, regime_casamento, data_nascimento, profissao,
      conjuge_nome, conjuge_cpf, conjuge_data_nascimento,
      pessoa_id
    `)
    .eq('id', leadId)
    .single()
  if (errLead) throw errLead

  // 2. Dados completos da pessoa vinculada (se existir)
  let pessoaData: Record<string, unknown> = {}
  let fgtsContas: DadosFgts[] = []

  if (lead.pessoa_id) {
    const { data: pessoa } = await sb
      .from('pessoas')
      .select(`
        id, nome, cpf, email, data_nascimento, rg, profissao,
        estado_civil, sexo, renda_formal, renda_informal, nacionalidade,
        endereco_rua, endereco_numero, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep,
        regime_casamento, data_casamento,
        conjuge_nome, conjuge_cpf, conjuge_data_nascimento, conjuge_profissao, conjuge_renda_formal,
        empresa_nome, empresa_cnpj, municipio_trabalho, uf_trabalho,
        conta_bancaria_banco, conta_bancaria_agencia, conta_bancaria_numero, conta_bancaria_digito,
        pessoa_telefones(telefone, principal, ativo)
      `)
      .eq('id', lead.pessoa_id)
      .single()

    if (pessoa) {
      pessoaData = pessoa as Record<string, unknown>

      // FGTS da pessoa
      const { data: fgtsRows } = await sb
        .from('pessoa_fgts_contas')
        .select('pis_pasep, cod_empregador, nro_conta_fgts, valor_saque, saldo_disponivel')
        .eq('pessoa_id', lead.pessoa_id)
        .order('created_at', { ascending: true })
      fgtsContas = fgtsRows ?? []
    }
  }

  // 3. Montar comprador principal a partir do lead + pessoa
  const tels = ((pessoaData.pessoa_telefones as Array<{ telefone: string; principal: boolean; ativo: boolean }> | undefined) ?? [])
    .filter((t) => t.ativo)
  const telPrincipal = tels.find((t) => t.principal) ?? tels[0]

  const compradorPrincipal: DadosComprador = {
    id:                       (pessoaData.id as string) ?? lead.id,
    nome:                     (pessoaData.nome as string) ?? lead.nome ?? '',
    cpf:                      (pessoaData.cpf as string | null) ?? lead.cpf ?? null,
    email:                    (pessoaData.email as string | null) ?? lead.email ?? null,
    telefone:                 telPrincipal?.telefone ?? lead.telefone ?? null,
    data_nascimento:          (pessoaData.data_nascimento as string | null) ?? lead.data_nascimento ?? null,
    rg:                       (pessoaData.rg as string | null) ?? null,
    profissao:                (pessoaData.profissao as string | null) ?? lead.profissao ?? null,
    estado_civil:             (pessoaData.estado_civil as string | null) ?? lead.estado_civil ?? null,
    sexo:                     (pessoaData.sexo as string | null) ?? null,
    renda_formal:             (pessoaData.renda_formal as number | null) ?? lead.renda_formal ?? null,
    renda_informal:           (pessoaData.renda_informal as number | null) ?? lead.renda_informal ?? null,
    nacionalidade:            (pessoaData.nacionalidade as string | null) ?? null,
    endereco_rua:             (pessoaData.endereco_rua as string | null) ?? null,
    endereco_numero:          (pessoaData.endereco_numero as string | null) ?? null,
    endereco_bairro:          (pessoaData.endereco_bairro as string | null) ?? null,
    endereco_cidade:          (pessoaData.endereco_cidade as string | null) ?? lead.cidade_imovel ?? null,
    endereco_uf:              (pessoaData.endereco_uf as string | null) ?? null,
    endereco_cep:             (pessoaData.endereco_cep as string | null) ?? null,
    regime_casamento:         (pessoaData.regime_casamento as string | null) ?? lead.regime_casamento ?? null,
    data_casamento:           (pessoaData.data_casamento as string | null) ?? null,
    conjuge_nome:             (pessoaData.conjuge_nome as string | null) ?? lead.conjuge_nome ?? null,
    conjuge_cpf:              (pessoaData.conjuge_cpf as string | null) ?? lead.conjuge_cpf ?? null,
    conjuge_data_nascimento:  (pessoaData.conjuge_data_nascimento as string | null) ?? lead.conjuge_data_nascimento ?? null,
    conjuge_profissao:        (pessoaData.conjuge_profissao as string | null) ?? null,
    conjuge_renda_formal:     (pessoaData.conjuge_renda_formal as number | null) ?? null,
    empresa_nome:             (pessoaData.empresa_nome as string | null) ?? null,
    empresa_cnpj:             (pessoaData.empresa_cnpj as string | null) ?? null,
    municipio_trabalho:       (pessoaData.municipio_trabalho as string | null) ?? null,
    uf_trabalho:              (pessoaData.uf_trabalho as string | null) ?? null,
    conta_bancaria_banco:     (pessoaData.conta_bancaria_banco as string | null) ?? null,
    conta_bancaria_agencia:   (pessoaData.conta_bancaria_agencia as string | null) ?? null,
    conta_bancaria_numero:    (pessoaData.conta_bancaria_numero as string | null) ?? null,
    conta_bancaria_digito:    (pessoaData.conta_bancaria_digito as string | null) ?? null,
    principal: true,
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
    compradores:                     [compradorPrincipal],
    vendedores:                      [],
    imovel: {
      rua: null,
      numero: null,
      bairro: null,
      cidade: lead.cidade_imovel ?? null,
      uf: null,
      cep: null,
      apto_unidade: null,
      categoria: null,
      tipo: lead.tipo_imovel ?? null,
      matricula: null,
    },
    fgts_comprador1: fgtsContas,
  }
}
