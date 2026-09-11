import type { SupabaseClient } from '@supabase/supabase-js'

export type TipoRelacionamentoProducao = 'corretor' | 'parceiro' | 'imobiliaria'

interface Entidade {
  id: string
  nome: string
}

export interface ProcessoProducaoRelacionamentos {
  id: string
  valor_financiado: number | string | null
  corretores: { corretor: Entidade | null }[] | null
  parceiros: { parceiro: Entidade | null }[] | null
  parceiro: Entidade | null
  imobiliarias: { papel: string; imobiliaria: Entidade | null }[] | null
}

export interface ProducaoRelacionamento {
  id: string
  nome: string
  contratos: number
  valorEmitido: number
  ticketMedio: number
}

const SEM_VINCULO: Record<TipoRelacionamentoProducao, string> = {
  corretor: 'Sem corretor vinculado',
  parceiro: 'Sem parceiro vinculado',
  imobiliaria: 'Sem imobiliária vinculada',
}

/** Um negócio é atribuído integralmente a cada entidade, uma vez por ID. */
export function agruparProducaoRelacionamentos(
  processos: ProcessoProducaoRelacionamentos[],
  tipo: TipoRelacionamentoProducao,
): ProducaoRelacionamento[] {
  const grupos = new Map<string, ProducaoRelacionamento>()
  const vistos = new Set<string>()

  for (const processo of processos) {
    if (vistos.has(processo.id)) continue
    vistos.add(processo.id)

    const entidades = tipo === 'corretor'
      ? (processo.corretores ?? []).map((v) => v.corretor)
      : tipo === 'parceiro'
        ? [...(processo.parceiros ?? []).map((v) => v.parceiro), processo.parceiro]
        : (processo.imobiliarias ?? [])
          .filter((v) => v.papel === 'imobiliaria')
          .map((v) => v.imobiliaria)

    const unicas = new Map<string, Entidade>()
    for (const entidade of entidades) {
      if (entidade) unicas.set(entidade.id, entidade)
    }
    if (unicas.size === 0) {
      unicas.set('sem-vinculo', { id: 'sem-vinculo', nome: SEM_VINCULO[tipo] })
    }

    const valor = Number(processo.valor_financiado ?? 0)
    for (const entidade of Array.from(unicas.values())) {
      const grupo = grupos.get(entidade.id) ?? {
        ...entidade, contratos: 0, valorEmitido: 0, ticketMedio: 0,
      }
      grupo.contratos += 1
      grupo.valorEmitido += Number.isFinite(valor) ? valor : 0
      grupos.set(entidade.id, grupo)
    }
  }

  return Array.from(grupos.values())
    .map((g) => ({ ...g, ticketMedio: g.valorEmitido / g.contratos }))
    .sort((a, b) => b.valorEmitido - a.valorEmitido || a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id))
}

/** Consulta autenticada: mantém RLS e pagina para não truncar períodos extensos. */
export async function carregarProducaoRelacionamentos(
  supabase: SupabaseClient,
  empresaId: string,
  dataInicio: string,
  dataFim: string,
  signal?: AbortSignal,
): Promise<ProcessoProducaoRelacionamentos[]> {
  const processos: ProcessoProducaoRelacionamentos[] = []
  const tamanhoPagina = 500

  for (let inicio = 0; ; inicio += tamanhoPagina) {
    let query = supabase.from('processos').select(`
      id, valor_financiado,
      corretores:processo_corretores(corretor:corretores(id, nome)),
      parceiros:processo_parceiros(parceiro:parceiros(id, nome)),
      parceiro:parceiros!parceiro_id(id, nome),
      imobiliarias:processo_imobiliarias(papel, imobiliaria:imobiliarias(id, nome))
    `)
      .eq('empresa_id', empresaId)
      .is('deleted_at', null)
      .eq('status_emissao', 'emitido')
      .gte('data_emissao', dataInicio)
      .lte('data_emissao', dataFim)
      .order('id', { ascending: true })
      .range(inicio, inicio + tamanhoPagina - 1)
    if (signal) query = query.abortSignal(signal)
    const { data, error } = await query
    if (error) throw error
    const pagina = (data ?? []) as unknown as ProcessoProducaoRelacionamentos[]
    processos.push(...pagina)
    if (pagina.length < tamanhoPagina) return processos
  }
}
