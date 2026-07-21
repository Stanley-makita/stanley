import { supabaseAdmin } from '@/lib/supabase/admin'
// Busca todos os dados necessários para preencher os formulários de um processo

function getClient() {
  return supabaseAdmin
}

export type DadosPessoa = {
  id: string
  nome: string
  cpf: string | null
  email: string | null
  data_nascimento: string | null
  rg: string | null
  profissao: string | null
  estado_civil: string | null
  sexo: string | null
  renda_formal: number | null
  renda_informal: number | null
  nacionalidade: string | null
  endereco_rua: string | null
  endereco_numero: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_uf: string | null
  endereco_cep: string | null
  regime_casamento: string | null
  data_casamento: string | null
  conjuge_nome: string | null
  conjuge_cpf: string | null
  conjuge_data_nascimento: string | null
  conjuge_profissao: string | null
  conjuge_renda_formal: number | null
  empresa_nome: string | null
  empresa_cnpj: string | null
  municipio_trabalho: string | null
  uf_trabalho: string | null
  conta_bancaria_banco: string | null
  conta_bancaria_agencia: string | null
  conta_bancaria_numero: string | null
  conta_bancaria_digito: string | null
  telefone: string | null
}

export type DadosComprador = DadosPessoa & {
  principal: boolean
}

export type DadosVendedor = {
  id: string
  nome: string
  cpf: string | null
  email: string | null
  telefone: string | null
  estado_civil: string | null
  banco: string | null
  agencia: string | null
  conta: string | null
  conjuge_nome: string | null
  conjuge_cpf: string | null
}

export type DadosImovel = {
  rua: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
  apto_unidade: string | null
  categoria: string | null
  tipo: string | null
  matricula: string | null
}

export type DadosFgts = {
  pis_pasep: string | null
  cod_empregador: string | null
  nro_conta_fgts: string | null
  valor_saque: string | null
  saldo_disponivel: number | null
}

export type DadosProcesso = {
  id: string
  empresa_id: string
  numero_processo: string
  banco_nome: string | null
  modalidade: string
  valor_imovel: number | null
  valor_financiado: number | null
  valor_entrada: number | null
  valor_recursos_proprios: number | null
  valor_fgts: number | null
  prazo_amortizacao_meses: number | null
  dia_vencimento_parcela: number | null
  sistema_amortizacao: string | null
  indexador: string | null
  financiar_despesas_cartorariais: boolean
  compradores: DadosComprador[]
  vendedores: DadosVendedor[]
  imovel: DadosImovel | null
  fgts_comprador1: DadosFgts[]
}

export async function buscarDadosFormulario(processoId: string): Promise<DadosProcesso> {
  const sb = getClient()

  // Buscar processo + banco
  const { data: proc, error: errProc } = await sb
    .from('processos')
    .select(`
      id, empresa_id, numero_processo, modalidade,
      valor_imovel, valor_financiado, valor_entrada,
      valor_recursos_proprios, valor_fgts,
      prazo_amortizacao_meses, dia_vencimento_parcela,
      sistema_amortizacao, indexador, financiar_despesas_cartorariais,
      imovel_id,
      banco:bancos!banco_id(nome)
    `)
    .eq('id', processoId)
    .single()
  if (errProc) throw errProc

  // Buscar compradores com dados completos de pessoas
  const { data: compRows, error: errComp } = await sb
    .from('processo_compradores')
    .select(`
      id, nome, cpf, email, telefone, renda_mensal, principal,
      pessoa_id,
      pessoa:pessoas!inner(
        id, nome, cpf, email, data_nascimento, rg, profissao,
        estado_civil, sexo, renda_formal, renda_informal, nacionalidade,
        endereco_rua, endereco_numero, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep,
        regime_casamento, data_casamento,
        conjuge_nome, conjuge_cpf, conjuge_data_nascimento, conjuge_profissao, conjuge_renda_formal,
        empresa_nome, empresa_cnpj, municipio_trabalho, uf_trabalho,
        conta_bancaria_banco, conta_bancaria_agencia, conta_bancaria_numero, conta_bancaria_digito,
        pessoa_telefones(telefone, principal, ativo)
      )
    `)
    .eq('processo_id', processoId)
    .order('created_at', { ascending: true })

  // Se o inner join falhar (compradores sem pessoa_id), busca sem o join
  const { data: compRowsSimples } = errComp
    ? await sb.from('processo_compradores')
        .select('id, nome, cpf, email, telefone, renda_mensal, principal')
        .eq('processo_id', processoId)
        .order('created_at', { ascending: true })
    : { data: null }

  const rows = compRows ?? compRowsSimples ?? []

  const compradores: DadosComprador[] = rows.map((r: any) => {
    const p = r.pessoa ?? {}
    const tels = (p.pessoa_telefones ?? []).filter((t: any) => t.ativo)
    const telPrincipal = tels.find((t: any) => t.principal) ?? tels[0]
    // Prioriza dados da tabela pessoas; cai para dados diretos do comprador
    return {
      id:                       p.id ?? r.id,
      nome:                     p.nome ?? r.nome ?? '',
      cpf:                      p.cpf ?? r.cpf ?? null,
      email:                    p.email ?? r.email ?? null,
      telefone:                 telPrincipal?.telefone ?? r.telefone ?? null,
      data_nascimento:          p.data_nascimento ?? null,
      rg:                       p.rg ?? null,
      profissao:                p.profissao ?? null,
      estado_civil:             p.estado_civil ?? null,
      sexo:                     p.sexo ?? null,
      renda_formal:             p.renda_formal ?? r.renda_mensal ?? null,
      renda_informal:           p.renda_informal ?? null,
      nacionalidade:            p.nacionalidade ?? null,
      endereco_rua:             p.endereco_rua ?? null,
      endereco_numero:          p.endereco_numero ?? null,
      endereco_bairro:          p.endereco_bairro ?? null,
      endereco_cidade:          p.endereco_cidade ?? null,
      endereco_uf:              p.endereco_uf ?? null,
      endereco_cep:             p.endereco_cep ?? null,
      regime_casamento:         p.regime_casamento ?? null,
      data_casamento:           p.data_casamento ?? null,
      conjuge_nome:             p.conjuge_nome ?? null,
      conjuge_cpf:              p.conjuge_cpf ?? null,
      conjuge_data_nascimento:  p.conjuge_data_nascimento ?? null,
      conjuge_profissao:        p.conjuge_profissao ?? null,
      conjuge_renda_formal:     p.conjuge_renda_formal ?? null,
      empresa_nome:             p.empresa_nome ?? null,
      empresa_cnpj:             p.empresa_cnpj ?? null,
      municipio_trabalho:       p.municipio_trabalho ?? null,
      uf_trabalho:              p.uf_trabalho ?? null,
      conta_bancaria_banco:     p.conta_bancaria_banco ?? null,
      conta_bancaria_agencia:   p.conta_bancaria_agencia ?? null,
      conta_bancaria_numero:    p.conta_bancaria_numero ?? null,
      conta_bancaria_digito:    p.conta_bancaria_digito ?? null,
      principal:                r.principal ?? false,
    }
  })

  // Buscar vendedores
  const { data: vendRows, error: errVend } = await sb
    .from('processo_vendedores')
    .select('id, nome, cpf, email, telefone, estado_civil, banco, agencia, conta, conjuge_nome, conjuge_cpf')
    .eq('processo_id', processoId)
    .order('created_at', { ascending: true })
  if (errVend) throw errVend

  // Buscar imóvel
  let imovel: DadosImovel | null = null
  if (proc.imovel_id) {
    const { data: imov } = await sb
      .from('imoveis')
      .select('rua, numero, bairro, cidade, uf, apto_unidade, categoria, tipo, matricula')
      .eq('id', proc.imovel_id)
      .single()
    if (imov) {
      imovel = { ...imov, cep: null }
    }
  }

  // Buscar contas FGTS do comprador principal
  const compradorPrincipal = compradores.find((c) => c.principal) ?? compradores[0]
  let fgtsContas: DadosFgts[] = []
  if (compradorPrincipal?.id) {
    const { data: fgtsRows } = await sb
      .from('pessoa_fgts_contas')
      .select('pis_pasep, cod_empregador, nro_conta_fgts, valor_saque, saldo_disponivel')
      .eq('pessoa_id', compradorPrincipal.id)
      .order('created_at', { ascending: true })
    fgtsContas = fgtsRows ?? []
  }

  return {
    id: proc.id,
    empresa_id: proc.empresa_id,
    numero_processo: proc.numero_processo,
    banco_nome: (proc.banco as any)?.nome ?? null,
    modalidade: proc.modalidade,
    valor_imovel: proc.valor_imovel,
    valor_financiado: proc.valor_financiado,
    valor_entrada: proc.valor_entrada,
    valor_recursos_proprios: proc.valor_recursos_proprios,
    valor_fgts: proc.valor_fgts,
    prazo_amortizacao_meses: proc.prazo_amortizacao_meses,
    dia_vencimento_parcela: proc.dia_vencimento_parcela,
    sistema_amortizacao: proc.sistema_amortizacao,
    indexador: proc.indexador,
    financiar_despesas_cartorariais: proc.financiar_despesas_cartorariais ?? false,
    compradores,
    vendedores: vendRows ?? [],
    imovel,
    fgts_comprador1: fgtsContas,
  }
}
