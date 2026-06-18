export type RhTipoContrato = 'clt' | 'pj' | 'temporario' | 'estagio'
export type RhStatusFuncionario = 'ativo' | 'ferias' | 'afastado' | 'inativo'
export type RhNivelComissao = 'sem_comissao' | 'junior' | 'pleno' | 'senior' | 'gerente'
export type RhStatusFerias = 'agendado' | 'em_andamento' | 'concluido' | 'cancelado'
export type RhTipoAusencia = 'licenca' | 'atestado' | 'falta_justificada' | 'falta_injustificada' | 'outros'

export const RH_TIPO_CONTRATO_LABELS: Record<RhTipoContrato, string> = {
  clt:        'CLT',
  pj:         'PJ',
  temporario: 'Temporário',
  estagio:    'Estágio',
}

export const RH_STATUS_FUNCIONARIO_LABELS: Record<RhStatusFuncionario, string> = {
  ativo:    'Ativo',
  ferias:   'Em Férias',
  afastado: 'Afastado',
  inativo:  'Inativo',
}

export const RH_STATUS_FUNCIONARIO_CORES: Record<RhStatusFuncionario, string> = {
  ativo:    'bg-green-100 text-green-700',
  ferias:   'bg-blue-100 text-blue-700',
  afastado: 'bg-red-100 text-red-700',
  inativo:  'bg-gray-100 text-gray-500',
}

export const RH_NIVEL_COMISSAO_LABELS: Record<RhNivelComissao, string> = {
  sem_comissao: 'Sem Comissão',
  junior:       'Júnior',
  pleno:        'Pleno',
  senior:       'Sênior',
  gerente:      'Gerente',
}

export const RH_STATUS_FERIAS_LABELS: Record<RhStatusFerias, string> = {
  agendado:    'Agendado',
  em_andamento: 'Em Andamento',
  concluido:   'Concluído',
  cancelado:   'Cancelado',
}

export const RH_STATUS_FERIAS_CORES: Record<RhStatusFerias, string> = {
  agendado:    'bg-blue-100 text-blue-700',
  em_andamento: 'bg-amber-100 text-amber-700',
  concluido:   'bg-green-100 text-green-700',
  cancelado:   'bg-gray-100 text-gray-500',
}

export const RH_TIPO_AUSENCIA_LABELS: Record<RhTipoAusencia, string> = {
  licenca:           'Licença',
  atestado:          'Atestado',
  falta_justificada: 'Falta Justificada',
  falta_injustificada: 'Falta Injustificada',
  outros:            'Outros',
}

export interface RhDepartamento {
  id: string
  empresa_id: string
  nome: string
  descricao: string | null
  ativo: boolean
  created_at: string
}

export interface RhFaixaComissao {
  id: string
  regra_id: string
  valor_minimo: number
  valor_maximo: number
  percentual: number
  created_at: string
}

export interface RhRegraComissao {
  id: string
  empresa_id: string
  nome: string
  descricao: string | null
  data_inicio: string
  data_termino: string | null
  ativa: boolean
  created_at: string
  updated_at: string
  faixas?: RhFaixaComissao[]
}

export interface RhCargo {
  id: string
  empresa_id: string
  nome: string
  descricao: string | null
  departamento_id: string | null
  nivel_comissao: RhNivelComissao
  regra_comissao_id: string | null
  ativo: boolean
  created_at: string
  updated_at: string
  departamento?: RhDepartamento | null
  regra_comissao?: RhRegraComissao | null
}

export interface RhFuncionario {
  id: string
  empresa_id: string
  nome: string
  cpf: string | null
  email: string
  telefone: string | null
  data_nascimento: string | null
  data_admissao: string
  tipo_contrato: RhTipoContrato
  cargo_id: string | null
  status: RhStatusFuncionario
  salario_base: number
  observacoes: string | null
  created_at: string
  updated_at: string
  cargo?: RhCargo | null
}

export interface RhPonto {
  id: string
  empresa_id: string
  funcionario_id: string
  data: string
  entrada: string | null
  inicio_intervalo: string | null
  fim_intervalo: string | null
  saida: string | null
  observacao: string | null
  created_at: string
  updated_at: string
  funcionario?: RhFuncionario | null
}

export interface RhFerias {
  id: string
  empresa_id: string
  funcionario_id: string
  periodo_aq_inicio: string
  periodo_aq_fim: string
  ferias_inicio: string | null
  ferias_fim: string | null
  dias_totais: number
  dias_usados: number
  status: RhStatusFerias
  observacoes: string | null
  created_at: string
  updated_at: string
  funcionario?: RhFuncionario | null
}

export interface RhAusencia {
  id: string
  empresa_id: string
  funcionario_id: string
  data_inicio: string
  data_fim: string
  tipo: RhTipoAusencia
  motivo: string | null
  created_at: string
  funcionario?: RhFuncionario | null
}
