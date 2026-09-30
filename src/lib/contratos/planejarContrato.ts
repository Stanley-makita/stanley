import type { ResumoNegociacao } from './entenderNegociacao'
import { selecionarTemplate } from './selecionarTemplate'

export interface ClausulaPlano {
  texto: string
  tipo: 'padrao' | 'condicional'
}

export interface PlanoContrato { clausulas: ClausulaPlano[] }

/** A estrutura vem do modelo usado, sem uma chamada à IA para inventar títulos. */
export async function planejarContrato(input: {
  tipoContrato: string
  resumo: ResumoNegociacao
}): Promise<PlanoContrato> {
  const template = selecionarTemplate(input.tipoContrato)
  const clausulas: ClausulaPlano[] = Array.from(template.conteudo.matchAll(/<h3>([\s\S]*?)<\/h3>/g))
    .map((m) => ({ texto: m[1].replace(/<[^>]+>/g, '').trim(), tipo: 'padrao' }))
  if (input.tipoContrato === 'compra_venda' && (input.resumo.valor_financiado ?? 0) > 0) {
    clausulas.push({ texto: 'Condições do financiamento e hipóteses de negativa de crédito', tipo: 'condicional' })
  }
  return { clausulas }
}
