import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Processo, ProcessoComprador, ProcessoVendedor } from '@/types/processos'

export interface ContratoAssessoriaOpcoes {
  numero_contrato_assessoria: string
  check_financiamento: boolean
  check_itbi: boolean
  check_registro: boolean
  check_juridico: boolean
  valor_servicos: number | null
}

function fmtMoeda(v: number | null | undefined): string {
  if (!v) return '[A PREENCHER]'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function val(v: string | null | undefined): string {
  return v?.trim() || '[A PREENCHER]'
}

function check(marcado: boolean): string {
  return marcado ? '☑' : '☐'
}

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CENTENAS = ['', 'cem', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
  'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

function centenasExtenso(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cem'
  const c = Math.floor(n / 100)
  const resto = n % 100
  const centena = CENTENAS[c]
  if (resto === 0) return centena
  const dezena = resto < 20 ? UNIDADES[resto] : DEZENAS[Math.floor(resto / 10)] + (resto % 10 !== 0 ? ' e ' + UNIDADES[resto % 10] : '')
  return centena + ' e ' + dezena
}

function milharExtenso(n: number): string {
  if (n === 0) return ''
  if (n === 1) return 'mil'
  return centenasExtenso(n) + ' mil'
}

function inteiroExtenso(n: number): string {
  if (n === 0) return 'zero'
  const milhar = Math.floor(n / 1000)
  const resto = n % 1000
  const partes: string[] = []
  if (milhar > 0) partes.push(milharExtenso(milhar))
  if (resto > 0) partes.push(centenasExtenso(resto))
  return partes.join(' e ')
}

export function valorPorExtenso(valor: number): string {
  if (!valor || valor <= 0) return '[A PREENCHER]'
  const reais = Math.floor(valor)
  const centavos = Math.round((valor - reais) * 100)
  const parteReais = inteiroExtenso(reais) + (reais === 1 ? ' real' : ' reais')
  if (centavos === 0) return parteReais
  const parteCentavos = inteiroExtenso(centavos) + (centavos === 1 ? ' centavo' : ' centavos')
  return parteReais + ' e ' + parteCentavos
}

function buildEndereco(p: { endereco_rua?: string | null; endereco_numero?: string | null; endereco_bairro?: string | null; endereco_cidade?: string | null; endereco_uf?: string | null; endereco_cep?: string | null } | null | undefined): string {
  if (!p) return '[A PREENCHER]'
  const partes = [
    p.endereco_rua,
    p.endereco_numero ? `nº ${p.endereco_numero}` : null,
    p.endereco_bairro,
    p.endereco_cidade && p.endereco_uf ? `${p.endereco_cidade}/${p.endereco_uf}` : (p.endereco_cidade ?? null),
    p.endereco_cep ? `CEP ${p.endereco_cep}` : null,
  ].filter(Boolean)
  return partes.length > 0 ? partes.join(', ') : '[A PREENCHER]'
}

export function substituirVariaveis(
  html: string,
  processo: Processo,
  compradores: ProcessoComprador[],
  vendedores: ProcessoVendedor[],
  opcoes?: ContratoAssessoriaOpcoes,
): string {
  const comprador = compradores[0]
  const vendedor = vendedores[0]
  const cp = comprador?.pessoa  // dados detalhados do comprador (pessoas)
  const vp = vendedor?.pessoa   // dados detalhados do vendedor (pessoas)

  const hoje = new Date()

  // Cônjuge do vendedor: prefere dado da tabela processo_vendedores, fallback para pessoas
  const vendedorConjugeNome = vendedor?.conjuge_nome ?? vp?.conjuge_nome
  // Cônjuge do comprador: vem de pessoas (comprador não tem coluna conjuge_nome)
  const compradorConjugeNome = cp?.conjuge_nome

  const variaveis: Record<string, string> = {
    // Data e localização
    data_extenso: format(hoje, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }),
    cidade_comarca: 'Maringá/PR',
    cidade: 'Maringá',

    // Comprador
    comprador_nome: val(comprador?.nome),
    comprador_cpf: val(comprador?.cpf),
    comprador_email: val(comprador?.email),
    comprador_telefone: val(comprador?.telefone),
    comprador_rg: val(cp?.rg),
    comprador_nacionalidade: val(cp?.nacionalidade),
    comprador_estado_civil: val(cp?.estado_civil),
    comprador_profissao: val(cp?.profissao),
    comprador_cnh: '[A PREENCHER]',
    comprador_endereco: buildEndereco(cp),

    // Vendedor
    vendedor_nome: val(vendedor?.nome),
    vendedor_cpf: val(vendedor?.cpf),
    vendedor_email: val(vendedor?.email),
    vendedor_estado_civil: val(vendedor?.estado_civil ?? vp?.estado_civil),
    vendedor_banco: val(vendedor?.banco),
    vendedor_agencia: val(vendedor?.agencia),
    vendedor_conta: val(vendedor?.conta),
    vendedor_rg: val(vp?.rg),
    vendedor_nacionalidade: val(vp?.nacionalidade),
    vendedor_profissao: val(vp?.profissao),
    vendedor_cnh: '[A PREENCHER]',
    vendedor_endereco: buildEndereco(vp),

    // Locador/Locatário — mesmos dados do vendedor/comprador para locação
    locador_nome: val(vendedor?.nome),
    locador_cpf: val(vendedor?.cpf),
    locador_rg: val(vp?.rg),
    locador_cnh: '[A PREENCHER]',
    locador_profissao: val(vp?.profissao),
    locador_endereco: buildEndereco(vp),
    locador_conjuge: vendedorConjugeNome ? `, cônjuge ${vendedorConjugeNome}` : '',

    locatario_nome: val(comprador?.nome),
    locatario_cpf: val(comprador?.cpf),
    locatario_rg: val(cp?.rg),
    locatario_profissao: val(cp?.profissao),
    locatario_endereco: buildEndereco(cp),
    locatario_conjuge: compradorConjugeNome ? `, cônjuge ${compradorConjugeNome}` : '',

    // Contratante (prestação de serviços) — usa comprador
    contratante_nome: val(comprador?.nome),
    contratante_cpf: val(comprador?.cpf),
    contratante_nacionalidade: val(cp?.nacionalidade),
    contratante_estado_civil: val(cp?.estado_civil),
    contratante_profissao: val(cp?.profissao),
    contratante_cnh: '[A PREENCHER]',
    contratante_endereco: buildEndereco(cp),

    // Fiador — não há tabela de fiadores no sistema ainda
    fiador_nome: '[A PREENCHER]',
    fiador_cpf: '[A PREENCHER]',
    fiador_rg: '[A PREENCHER]',
    fiador_profissao: '[A PREENCHER]',
    fiador_endereco: '[A PREENCHER]',
    fiador_conjuge: '',

    // Imóvel — apenas nome e valor disponíveis
    imovel_descricao_completa: val(processo.nome_imovel),
    imovel_matricula: '[A PREENCHER]',
    imovel_cartorio: '[A PREENCHER]',
    imovel_endereco: '[A PREENCHER]',
    imovel_area: '[A PREENCHER]',
    imovel_cadastro_prefeitura: '[A PREENCHER]',

    // Valores financeiros
    valor_total: fmtMoeda(processo.valor_imovel),
    valor_total_extenso: '[A PREENCHER]',
    valor_entrada: fmtMoeda(processo.valor_entrada),
    valor_entrada_extenso: '[A PREENCHER]',
    valor_financiado: fmtMoeda(processo.valor_financiado),
    valor_financiado_extenso: '[A PREENCHER]',
    banco_financiador: val(processo.banco?.nome),

    // Dados bancários do vendedor
    conta_banco: val(vendedor?.banco),
    agencia: val(vendedor?.agencia),
    titular_conta: val(vendedor?.nome),

    // Corretor
    corretor_nome: val(processo.corretor_nome),
    corretor_creci: val(processo.corretor_creci),
    corretor_cpf: '[A PREENCHER]',
    valor_comissao: '[A PREENCHER]',
    valor_comissao_extenso: '[A PREENCHER]',

    // Posse
    data_posse: '[A PREENCHER]',

    // Locação
    valor_aluguel: '[A PREENCHER]',
    valor_aluguel_extenso: '[A PREENCHER]',
    prazo_locacao_meses: '[A PREENCHER]',
    data_inicio_contrato: '[A PREENCHER]',
    data_fim_contrato: '[A PREENCHER]',
    data_inicio: '[A PREENCHER]',
    data_fim: '[A PREENCHER]',
    dia_vencimento: '[A PREENCHER]',
    finalidade_locacao: '[A PREENCHER]',
    banco_locador: val(vendedor?.banco),
    agencia_locador: val(vendedor?.agencia),
    conta_locador: val(vendedor?.conta),
    email_locador: val(vendedor?.email),
    email_locatario: val(comprador?.email),
    email_fiador: '[A PREENCHER]',
    foro_comarca: 'Maringá/PR',

    // Distrato
    valor_multa_total: '[A PREENCHER]',
    valor_multa_extenso: '[A PREENCHER]',
    valor_aluguel_proporcional: '[A PREENCHER]',
    periodo_proporcional: '[A PREENCHER]',
    percentual_administradora: '[A PREENCHER]',
    valor_quota_administradora: '[A PREENCHER]',
    valor_saldo_proprietario: '[A PREENCHER]',
    conta_administradora: '[A PREENCHER]',
    agencia_administradora: '[A PREENCHER]',
    banco_administradora: '[A PREENCHER]',
    pix_administradora: '[A PREENCHER]',
    data_pagamento_proprietario: '[A PREENCHER]',
    administradora_nome: '[A PREENCHER]',
    administradora_cnpj: '[A PREENCHER]',
    administradora_responsavel: '[A PREENCHER]',
    administradora_cpf: '[A PREENCHER]',
    administradora_endereco: '[A PREENCHER]',

    // Prestação de serviços (template antigo — mantido por compatibilidade)
    numero_contrato: processo.numero_processo || '[A PREENCHER]',
    banco_instituicao: val(processo.banco?.nome),
    servicos_contratados: '<li>[A PREENCHER — liste os serviços contratados]</li>',
    valor_honorarios: '[A PREENCHER]',
    valor_honorarios_extenso: '[A PREENCHER]',
    momento_pagamento: '[A PREENCHER]',

    // Prestação de serviços de assessoria (novo template)
    numero_contrato_assessoria: opcoes?.numero_contrato_assessoria ?? '[A PREENCHER]',
    check_financiamento: check(opcoes?.check_financiamento ?? false),
    check_itbi: check(opcoes?.check_itbi ?? false),
    check_registro: check(opcoes?.check_registro ?? false),
    check_juridico: check(opcoes?.check_juridico ?? false),
    valor_total_servicos: fmtMoeda(opcoes?.valor_servicos ?? null),
    valor_total_servicos_extenso: opcoes?.valor_servicos
      ? valorPorExtenso(opcoes.valor_servicos)
      : '[A PREENCHER]',
    plataforma_assinatura: '[A PREENCHER]',
    cidade_foro: 'Maringá/PR',
  }

  return html.replace(/\{\{(\w+)\}\}/g, (_, chave) => variaveis[chave] ?? `[A PREENCHER]`)
}
