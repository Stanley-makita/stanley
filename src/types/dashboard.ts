export interface DashboardKpis {
  processosAtivos: number
  processosAtivosVariacao: number      // % vs mês anterior
  leadsMes: number
  leadsMesVariacao: number
  taxaConversao: number                // percentual 0-100
  taxaConversaoVariacao: number
  valorCarteira: number                // R$ em centavos
  valoreCarteiraVariacao: number
  membrosAtivos: number
}

export interface ProcessoPorFase {
  faseNome: string
  faseCor: string
  total: number
  percentual: number
}

export interface AtividadeItem {
  id: string
  tipo: 'lead_criado' | 'processo_atualizado' | 'usuario_convidado' | 'fase_mudanca'
  descricao: string
  usuario: string
  criadoEm: string
}

export interface MetaMembro {
  id: string
  nome: string
  meta: number
  realizado: number
  percentual: number
}
