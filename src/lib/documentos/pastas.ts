import type { CatalogoPastaProcesso } from '@/types/documentos'

// Árvore de pastas de documentos (Captação e Negócios). Um nível só de
// subpasta: catalogo_pastas_processo.pai_codigo (migration 340). Hoje só
// "01 Comprador" tem subpastas (Documentos Pessoais, Comprovação de Renda, FGTS).

type Pasta = Pick<CatalogoPastaProcesso, 'id' | 'codigo' | 'nome' | 'ordem_exibicao'> & { pai_codigo?: string | null }

/** Pastas que, além de guardar arquivos, têm uma aba própria no sistema. */
export const ABA_DA_PASTA: Record<string, { aba: 'formularios' | 'simulador'; rotulo: string }> = {
  formularios: { aba: 'formularios', rotulo: 'Abrir formulários do sistema' },
  simulacoes:  { aba: 'simulador',   rotulo: 'Abrir simulador' },
}

const porOrdem = (a: Pasta, b: Pasta) => a.ordem_exibicao - b.ordem_exibicao

export function pastasPrincipais<T extends Pasta>(catalogo: T[]): T[] {
  return catalogo.filter((p) => !p.pai_codigo).sort(porOrdem)
}

export function subpastasDe<T extends Pasta>(codigo: string, catalogo: T[]): T[] {
  return catalogo.filter((p) => p.pai_codigo === codigo).sort(porOrdem)
}

/** A pasta e as subpastas dela (para contar arquivos de uma pasta principal). */
export function idsDaArvore(codigo: string, catalogo: Pasta[]): Set<string> {
  return new Set(catalogo.filter((p) => p.codigo === codigo || p.pai_codigo === codigo).map((p) => p.id))
}

/** Código da pasta principal (subpasta → mãe; principal → ela mesma). */
export function codigoRaiz(codigo: string, catalogo: Pasta[]): string {
  return catalogo.find((p) => p.codigo === codigo)?.pai_codigo ?? codigo
}

/** "01 Comprador › 02 Comprovação de Renda" para subpasta; nome puro para principal. */
export function rotuloPasta(pasta: Pasta, catalogo: Pasta[]): string {
  if (!pasta.pai_codigo) return pasta.nome
  const pai = catalogo.find((p) => p.codigo === pasta.pai_codigo)
  return pai ? `${pai.nome} › ${pasta.nome}` : pasta.nome
}

/** Lista para seletores: cada principal seguida das subpastas dela. */
export function pastasParaSelecao<T extends Pasta>(catalogo: T[]): T[] {
  return pastasPrincipais(catalogo).flatMap((p) => [p, ...subpastasDe(p.codigo, catalogo)])
}
