/**
 * Tipo de imóvel pretendido e despesas financiadas (pedido da equipe, 10/11/2026).
 *
 * Tipo PRETENDIDO (`leads.tipo_imovel` / `processos.tipo_imovel`) = o que o cliente quer financiar — existe antes
 * de haver imóvel escolhido e muda regra de banco (comercial). É independente do tipo do imóvel CADASTRADO
 * (`imoveis.tipo`, copiado em `imovel_tipo`: apartamento/casa/sobrado/terreno/barracão), que é dado de registro.
 * Quando um imóvel cadastrado é vinculado e o pretendido está vazio, o pretendido é sugerido a partir dele.
 *
 * Despesas financiadas: o cliente pode financiar junto até 5% do valor do imóvel para as custas. A tela sugere
 * 5% e deixa editar; quando o valor é outro, mostra que percentual ele representa.
 */

export const TIPOS_IMOVEL_PRETENDIDO = ['casa', 'apartamento', 'comercial', 'terreno', 'rural'] as const
export type TipoImovelPretendido = (typeof TIPOS_IMOVEL_PRETENDIDO)[number]

export const TIPO_IMOVEL_PRETENDIDO_LABELS: Record<TipoImovelPretendido, string> = {
  casa: 'Casa',
  apartamento: 'Apartamento',
  comercial: 'Comercial',
  terreno: 'Terreno',
  rural: 'Rural',
}

export function rotuloTipoImovelPretendido(tipo: string | null | undefined): string | null {
  if (!tipo) return null
  return TIPO_IMOVEL_PRETENDIDO_LABELS[tipo as TipoImovelPretendido] ?? tipo
}

/** Tipo do imóvel cadastrado (módulo Imóveis) → tipo pretendido sugerido. */
export function tipoPretendidoDoImovelCadastrado(tipoCadastro: string | null | undefined): TipoImovelPretendido | null {
  switch (tipoCadastro) {
    case 'casa':
    case 'sobrado': return 'casa'
    case 'apartamento': return 'apartamento'
    case 'terreno': return 'terreno'
    case 'barracao': return 'comercial'
    default: return null
  }
}

export const PERCENTUAL_MAX_DESPESAS = 5

/** 5% do valor do imóvel, em reais com centavos. */
export function sugerirValorDespesas(valorImovel: number | null | undefined): number | null {
  if (!valorImovel || valorImovel <= 0) return null
  return Math.round(valorImovel * PERCENTUAL_MAX_DESPESAS) / 100
}

/** Quanto o valor representa do imóvel, em % com até 2 casas. */
export function percentualDespesas(valor: number | null | undefined, valorImovel: number | null | undefined): number | null {
  if (valor == null || !valorImovel || valorImovel <= 0) return null
  return Math.round((valor / valorImovel) * 10000) / 100
}

export function formatarPercentual(p: number): string {
  return `${p.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
}

/** Texto de apoio do campo: percentual quando difere de 5% e aviso acima do limite. */
export function descreverValorDespesas(
  valor: number | null | undefined, valorImovel: number | null | undefined,
): { texto: string; acimaDoLimite: boolean } | null {
  const p = percentualDespesas(valor, valorImovel)
  if (p == null) return null
  if (p === PERCENTUAL_MAX_DESPESAS) return { texto: `${formatarPercentual(p)} do valor do imóvel`, acimaDoLimite: false }
  const acima = p > PERCENTUAL_MAX_DESPESAS
  return {
    texto: `Este valor é ${formatarPercentual(p)} do valor do imóvel${acima ? ` — acima do limite de ${PERCENTUAL_MAX_DESPESAS}%` : ''}`,
    acimaDoLimite: acima,
  }
}

/** Linha do Resumo (lead e negócio): "Vai financiar — R$ 17.000,00 (5%)", "Não vai financiar", "Não definido". */
export function descreverDespesasResumo(
  financiar: boolean | null | undefined, valor: number | null | undefined, valorImovel: number | null | undefined,
): string {
  if (financiar == null) return 'Não definido'
  if (!financiar) return 'Não vai financiar'
  if (valor == null) return 'Vai financiar — valor não informado'
  const p = percentualDespesas(valor, valorImovel)
  const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
  return `Vai financiar — ${reais}${p != null ? ` (${formatarPercentual(p)} do imóvel)` : ''}`
}

/**
 * Ao vincular/editar o imóvel cadastrado: se o tipo pretendido ainda está vazio, sugere a partir do tipo do
 * imóvel (decisão do usuário, 10/11/2026). Nunca sobrescreve um tipo já escolhido.
 */
export function comTipoPretendidoSugerido<T extends { imovel_tipo?: string | null }>(
  patch: T, tipoPretendidoAtual: string | null | undefined,
): T & { tipo_imovel?: TipoImovelPretendido } {
  if (tipoPretendidoAtual) return patch
  const sugerido = tipoPretendidoDoImovelCadastrado(patch.imovel_tipo)
  return sugerido ? { ...patch, tipo_imovel: sugerido } : patch
}
