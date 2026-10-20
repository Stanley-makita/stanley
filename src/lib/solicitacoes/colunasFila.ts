import type { StatusSolicitacao } from '@/types/solicitacoes-operacionais'

// Colunas do Kanban da Fila Operacional. Cada coluna é definida pelo STATUS da
// solicitação; o nome e a cor vêm das fases de Configurações (módulo
// fila_operacional), casadas pelo NOME da fase — nunca pela posição. Casar por
// posição deslocava os títulos quando o cadastro tinha uma fase a mais
// (ex.: "Novo"), e a ordem das fases pode estar empatada.

export interface ColunaFila {
  chave: string
  label: string
  cor: string
  statuses: StatusSolicitacao[]
  /** Coluna de concluídas: mostra só as concluídas hoje. */
  concluidas: boolean
}

interface FaseConfig {
  nome: string
  cor: string | null
}

const COLUNAS_BASE: (Omit<ColunaFila, 'label' | 'cor'> & { padrao: string; corPadrao: string; nomes: string[] })[] = [
  { chave: 'novo',                statuses: ['pendente'],            concluidas: false, padrao: 'Novo',                corPadrao: '#64748B', nomes: ['novo', 'nova', 'pendente'] },
  { chave: 'em_andamento',        statuses: ['em_andamento'],        concluidas: false, padrao: 'Em andamento',        corPadrao: '#3B82F6', nomes: ['em andamento'] },
  { chave: 'aguardando_resposta', statuses: ['aguardando_resposta'], concluidas: false, padrao: 'Aguardando resposta', corPadrao: '#A855F7', nomes: ['aguardando resposta'] },
  { chave: 'aguardando_cliente',  statuses: ['aguardando_cliente'],  concluidas: false, padrao: 'Aguardando cliente',  corPadrao: '#F97316', nomes: ['aguardando cliente'] },
  { chave: 'concluido',           statuses: ['concluido', 'cancelado'], concluidas: true, padrao: 'Concluído',         corPadrao: '#22C55E', nomes: ['concluido', 'concluida', 'concluidos', 'concluidas'] },
]

function normalizar(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function montarColunasFila(fases: FaseConfig[]): ColunaFila[] {
  return COLUNAS_BASE.map(({ padrao, corPadrao, nomes, ...base }) => {
    const fase = fases.find((f) => nomes.includes(normalizar(f.nome)))
    const nome = fase?.nome.trim() || padrao
    return {
      ...base,
      label: base.concluidas ? `${nome} (hoje)` : nome,
      cor: fase?.cor || corPadrao,
    }
  })
}
