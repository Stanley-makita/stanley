// Filtro de coluna estilo Excel: cada coluna guarda a lista de valores marcados.
// Lista vazia (ou coluna ausente) = sem filtro. Dentro da coluna vale qualquer
// valor marcado (OU); entre colunas, todas precisam bater (E).

export type FiltrosMultiplos = Record<string, string[]>

export function valorPassaNoFiltro(valor: string, selecionados: string[] | undefined): boolean {
  if (!selecionados || selecionados.length === 0) return true
  return selecionados.includes(valor)
}

export function passaEmTodosOsFiltros(
  filtros: FiltrosMultiplos,
  valorDaColuna: (col: string) => string | null,
): boolean {
  return Object.entries(filtros).every(([col, selecionados]) => {
    if (!selecionados || selecionados.length === 0) return true
    const valor = valorDaColuna(col)
    // Coluna sem extrator conhecido não filtra (mesmo comportamento de antes).
    if (valor === null) return true
    return selecionados.includes(valor)
  })
}

// Marcar todas as opções equivale a não filtrar — guarda vazio, assim um valor
// novo que aparecer depois (ex.: comercial recém-cadastrado) não fica escondido.
export function normalizarSelecao(selecionados: string[], opcoes: string[]): string[] {
  const unicos = Array.from(new Set(selecionados))
  if (opcoes.length > 0 && opcoes.every(o => unicos.includes(o))) return []
  return unicos
}

// Texto do cabeçalho/chip: 1 valor aparece por extenso, vários viram "Rótulo (n)".
export function rotuloDoFiltro(rotulo: string, selecionados: string[] | undefined): string {
  if (!selecionados || selecionados.length === 0) return rotulo
  if (selecionados.length === 1) return selecionados[0] || '—'
  return `${rotulo} (${selecionados.length})`
}

export function alternarItem<T>(lista: T[], item: T): T[] {
  return lista.includes(item) ? lista.filter(i => i !== item) : [...lista, item]
}
