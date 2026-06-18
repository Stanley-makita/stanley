// ─── Tipos legado (mantidos para compatibilidade) ──────────────────────────
export type StatusComissao = 'a_receber' | 'recebido' | 'cancelado'
export type TipoLancamento = 'receita' | 'despesa'

// ─── Novo módulo de fechamento financeiro ──────────────────────────────────

export type FinFechamentoStatus =
  | 'rascunho'
  | 'em_conferencia'
  | 'aprovado'
  | 'pago'
  | 'travado'
  | 'reaberto'

export type FinStatusContaReceber =
  | 'a_faturar'
  | 'faturado'
  | 'recebido_parcial'
  | 'recebido'
  | 'vencido'
  | 'cancelado'

export type FinStatusNF = 'emitida' | 'cancelada'

export type FinPapelComissao =
  | 'comercial'
  | 'operacional'
  | 'parceiro'
  | 'assessoria'
  | 'gerente'
  | 'outro'

export type FinStatusComissaoPagar =
  | 'calculada'
  | 'em_revisao'
  | 'aprovada'
  | 'paga'
  | 'suspensa'
  | 'cancelada'

export type FinStatusFolha = 'rascunho' | 'fechada' | 'paga'
export type FinStatusPagamentoItem = 'pendente' | 'pago' | 'suspenso'

export type FinTipoDespesa = 'recorrente' | 'avulsa'
export type FinCategoriaDespesa =
  | 'aluguel'
  | 'salarios'
  | 'marketing'
  | 'software'
  | 'impostos'
  | 'servicos'
  | 'outros'
export type FinStatusDespesa = 'prevista' | 'a_pagar' | 'paga' | 'vencida' | 'cancelada'

export type FinTipoContaBancaria = 'corrente' | 'poupanca' | 'investimento'

export type FinTipoConferencia =
  | 'processo_sem_regra_comissao'
  | 'processo_sem_comercial'
  | 'processo_sem_operacional'
  | 'conta_receber_sem_nf'
  | 'recebimento_divergente'
  | 'comissao_sem_funcionario'
  | 'despesa_vencida'
  | 'folha_incompleta'
  | 'saldo_bancario_nao_informado'
  | 'duplicidade_processo'
  | 'valor_negativo'
  | 'regra_expirada'

export type FinSeveridadeConferencia = 'info' | 'alerta' | 'critico'
export type FinStatusConferencia = 'pendente' | 'ok' | 'ignorada'

// ─── Interfaces ────────────────────────────────────────────────────────────

export interface FinFechamento {
  id: string
  empresa_id: string
  competencia_mes: number
  competencia_ano: number
  status: FinFechamentoStatus
  aberto_em: string
  aprovado_em: string | null
  travado_em: string | null
  aprovado_por: string | null
  observacoes: string | null
  created_at: string
  updated_at: string
  aprovado_por_usuario?: { nome: string }
}

export interface FinFechamentoProcesso {
  id: string
  fechamento_id: string
  empresa_id: string
  processo_id: string
  cliente_nome: string | null
  banco_id: string | null
  modalidade: string | null
  valor_financiado: number | null
  data_emissao: string | null
  comercial_id: string | null
  operacional_id: string | null
  status_origem: string | null
  incluido_manual: boolean
  observacoes: string | null
  created_at: string
  banco?: { nome: string; cor: string | null }
  comercial?: { nome: string }
  operacional?: { nome: string }
}

export interface FinContaReceber {
  id: string
  empresa_id: string
  fechamento_id: string | null
  processo_id: string | null
  banco_id: string | null
  cliente_nome: string | null
  origem: 'emissao' | 'avulso' | 'assinatura'
  valor_base: number
  percentual_previsto: number
  valor_previsto: number
  valor_recebido: number
  status: FinStatusContaReceber
  data_prevista: string | null
  data_recebimento: string | null
  observacoes: string | null
  created_at: string
  updated_at: string
  banco?: { nome: string; cor: string | null }
  notas_fiscais?: FinNotaFiscal[]
  recebimentos?: FinRecebimento[]
}

export interface FinNotaFiscal {
  id: string
  empresa_id: string
  conta_receber_id: string
  numero_nf: string | null
  valor_nf: number | null
  data_emissao: string
  data_recebimento: string | null
  status: FinStatusNF
  arquivo_url: string | null
  observacoes: string | null
  created_at: string
}

export interface FinRecebimento {
  id: string
  empresa_id: string
  conta_receber_id: string
  valor: number
  data_recebimento: string
  banco_conta_id: string | null
  forma_recebimento: 'transferencia' | 'pix' | 'boleto' | 'outros' | null
  comprovante_url: string | null
  observacoes: string | null
  created_at: string
  conta_bancaria?: { apelido: string | null; banco_nome: string }
}

export interface FinComissaoPagar {
  id: string
  empresa_id: string
  fechamento_id: string
  processo_id: string | null
  pessoa_id: string | null
  usuario_id: string | null
  funcionario_id: string | null
  tipo_destinatario: 'funcionario' | 'usuario' | 'externo'
  papel: FinPapelComissao
  regra_id: string | null
  valor_base: number
  percentual: number
  valor_calculado: number
  ajuste_manual: number
  valor_final: number
  status: FinStatusComissaoPagar
  data_prevista_pagamento: string | null
  data_pagamento: string | null
  observacoes: string | null
  created_at: string
  updated_at: string
  funcionario?: { nome: string }
  usuario?: { nome: string }
  regra?: { nome: string }
}

export interface FinFolha {
  id: string
  empresa_id: string
  fechamento_id: string | null
  competencia_mes: number
  competencia_ano: number
  status: FinStatusFolha
  total_salarios: number
  total_beneficios: number
  total_comissoes: number
  total_descontos: number
  total_liquido: number
  observacoes: string | null
  created_at: string
  updated_at: string
  itens?: FinFolhaItem[]
}

export interface FinFolhaItem {
  id: string
  empresa_id: string
  folha_id: string
  funcionario_id: string
  salario_base: number
  salario_liquido: number
  vale_transporte: number
  vale_alimentacao: number
  unimed: number
  comissao_comercial: number
  comissao_contratos: number
  ferias: number
  decimo_terceiro: number
  descontos: number
  outros_creditos: number
  outros_debitos: number
  total_liquido: number
  status_pagamento: FinStatusPagamentoItem
  data_pagamento: string | null
  observacoes: string | null
  created_at: string
  updated_at: string
  funcionario?: { nome: string; cargo?: { nome: string } | null }
}

export interface FinDespesaRecorrente {
  id: string
  empresa_id: string
  categoria: FinCategoriaDespesa
  fornecedor: string | null
  descricao: string
  valor_padrao: number | null
  dia_vencimento: number | null
  ativa: boolean
  data_inicio: string
  data_fim: string | null
  observacoes: string | null
  created_at: string
  updated_at: string
}

export interface FinDespesa {
  id: string
  empresa_id: string
  fechamento_id: string | null
  tipo: FinTipoDespesa
  categoria: FinCategoriaDespesa
  fornecedor: string | null
  descricao: string
  valor: number
  data_vencimento: string | null
  data_pagamento: string | null
  status: FinStatusDespesa
  recorrente_id: string | null
  comprovante_url: string | null
  observacoes: string | null
  created_at: string
  updated_at: string
}

export interface FinContaBancaria {
  id: string
  empresa_id: string
  banco_nome: string
  agencia: string | null
  conta: string | null
  tipo: FinTipoContaBancaria
  apelido: string | null
  ativa: boolean
  saldo_inicial: number
  observacoes: string | null
  created_at: string
}

export interface FinSaldoBancario {
  id: string
  empresa_id: string
  conta_bancaria_id: string
  fechamento_id: string | null
  data_saldo: string
  saldo_informado: number
  origem: 'manual' | 'automatico'
  observacoes: string | null
  created_at: string
  conta_bancaria?: { apelido: string | null; banco_nome: string }
}

export interface FinAjuste {
  id: string
  empresa_id: string
  fechamento_id: string
  entidade_tipo: string
  entidade_id: string
  tipo_ajuste: 'valor' | 'status' | 'vinculo' | 'inclusao' | 'exclusao'
  valor_anterior: string | null
  valor_novo: string | null
  motivo: string
  criado_por: string
  criado_em: string
  usuario?: { nome: string }
}

export interface FinConferencia {
  id: string
  empresa_id: string
  fechamento_id: string
  tipo: FinTipoConferencia
  severidade: FinSeveridadeConferencia
  status: FinStatusConferencia
  titulo: string
  descricao: string | null
  entidade_tipo: string | null
  entidade_id: string | null
  resolvido_por: string | null
  resolvido_em: string | null
  created_at: string
  resolvido_por_usuario?: { nome: string }
}

export interface Comissao {
  id: string
  empresa_id: string
  processo_id: string
  comercial_id: string
  valor_bruto: number
  percentual_comercial: number
  valor_comercial: number
  valor_empresa: number
  status: StatusComissao
  data_emissao: string
  data_recebimento: string | null
  competencia_mes: number
  competencia_ano: number
  observacao: string | null
  created_at: string
  updated_at: string
  // Joins
  processo?: { numero_processo: string; nome_imovel: string; banco?: { nome: string; cor: string | null } }
  comercial?: { nome: string }
}

export interface FinanceiroLancamento {
  id: string
  empresa_id: string
  tipo: TipoLancamento
  categoria: string
  descricao: string
  valor: number
  data_lancamento: string
  competencia_mes: number
  competencia_ano: number
  usuario_id: string
  created_at: string
  updated_at: string
  usuario?: { nome: string }
}

export interface KpisFinanceiro {
  receita_mes: number
  a_receber: number
  despesas_mes: number
  resultado_liquido: number
}

export interface RelatorioComercial {
  comercial_id: string
  comercial_nome: string
  num_contratos: number
  valor_emitido: number
  comissao_gerada: number
  comissao_recebida: number
}