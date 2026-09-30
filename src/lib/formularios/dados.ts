import { supabaseAdmin } from '@/lib/supabase/admin'
import { carregarParticipantes } from '@/lib/participantes/carregar'
import { montarCompradores, montarVendedores } from '@/lib/participantes/compradores'
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

type LinhaAntiga = { pessoa_id: string | null } & Record<string, unknown>

/** Sobrepõe, por pessoa_id, os campos não-nulos das linhas antigas (processo_compradores/
 *  processo_vendedores) nos dados montados a partir da Pessoa. Mesma Pessoa em mais de uma
 *  linha: vale o 1º valor não-nulo (linhas em ordem de criação). */
function sobreporCamposAntigos<T extends { id: string }>(itens: T[], antigas: LinhaAntiga[], campos: Array<keyof T & string>): T[] {
  return itens.map(item => {
    const linhas = antigas.filter(l => l.pessoa_id === item.id)
    if (linhas.length === 0) return item
    const saida = { ...item }
    for (const campo of campos) {
      const valor = linhas.map(l => l[campo]).find(v => v !== null && v !== undefined && v !== '')
      if (valor !== undefined) (saida as Record<string, unknown>)[campo] = valor
    }
    return saida
  })
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

  const participantes = await carregarParticipantes(sb, { tipo: 'processo', id: proc.id }, proc.empresa_id)

  // Fase A: a tela antiga ainda grava email/telefone/conta/estado civil/cônjuge direto em
  // processo_compradores/processo_vendedores (não na Pessoa). Quando preenchidos, esses campos
  // das linhas antigas vencem o que veio da Pessoa (casados pelo pessoa_id).
  const [{ data: compAntigos, error: errCompAnt }, { data: vendAntigos, error: errVendAnt }] = await Promise.all([
    sb.from('processo_compradores')
      .select('pessoa_id, email, telefone')
      .eq('processo_id', proc.id)
      .order('created_at', { ascending: true }),
    sb.from('processo_vendedores')
      .select('pessoa_id, email, telefone, estado_civil, banco, agencia, conta, conjuge_nome, conjuge_cpf')
      .eq('processo_id', proc.id)
      .order('created_at', { ascending: true }),
  ])
  if (errCompAnt) throw errCompAnt
  if (errVendAnt) throw errVendAnt

  const compradores = sobreporCamposAntigos(montarCompradores(participantes), compAntigos ?? [], ['email', 'telefone'])
  const vendedores = sobreporCamposAntigos(montarVendedores(participantes), vendAntigos ?? [],
    ['email', 'telefone', 'estado_civil', 'banco', 'agencia', 'conta', 'conjuge_nome', 'conjuge_cpf'])

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
    const { data: fgtsRows, error: errFgts } = await sb
      .from('pessoa_fgts_contas')
      .select('pis_pasep, cod_empregador, nro_conta_fgts, valor_saque, saldo_disponivel')
      .eq('pessoa_id', compradorPrincipal.id)
      .order('created_at', { ascending: true })
    if (errFgts) throw errFgts
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
    vendedores,
    imovel,
    fgts_comprador1: fgtsContas,
  }
}
