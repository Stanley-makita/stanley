import type { ResumoNegociacao } from './entenderNegociacao'
import type { TipoContrato } from '@/types/processos'

// Tipos onde o contrato não tem uma "outra parte" vendedora/imóvel de fato —
// prestação de serviço é só Fontinhas + cliente; confissão de dívida/aditivo
// costumam se referir a um contrato já existente, não a uma nova negociação
// comprador↔vendedor+imóvel.
const TIPOS_SEM_VENDEDOR_IMOVEL = new Set<TipoContrato>(['prestacao_servico', 'confissao_divida', 'aditivo', 'outros'])

export interface PendenciaResumo {
  texto: string
}

/**
 * Segunda camada de validação além do painel_inteligencia que a IA já devolve
 * — campo preenchido não é o mesmo que campo validado. Só quando esta função
 * devolve lista vazia o Construtor de Contratos segue direto pra construção
 * da minuta sem interromper o operador.
 */
export function validarResumo(resumo: ResumoNegociacao, tipoContrato: TipoContrato | ''): PendenciaResumo[] {
  const pendencias: PendenciaResumo[] = []

  for (const item of resumo.painel_inteligencia) {
    if (item.status === 'atencao') pendencias.push({ texto: item.texto })
  }

  if (resumo.compradores.length === 0 || !resumo.compradores.some((c) => c.nome)) {
    pendencias.push({ texto: 'Nenhum comprador/contratante identificado.' })
  }

  const exigeVendedorImovel = tipoContrato !== '' && !TIPOS_SEM_VENDEDOR_IMOVEL.has(tipoContrato)
  if (exigeVendedorImovel) {
    if (resumo.vendedores.length === 0 || !resumo.vendedores.some((v) => v.nome)) {
      pendencias.push({ texto: 'Nenhum vendedor identificado — obrigatório para este tipo de contrato.' })
    }
    if (!resumo.imovel.endereco && !resumo.imovel.matricula) {
      pendencias.push({ texto: 'Imóvel não identificado — obrigatório para este tipo de contrato.' })
    }
  }

  if (resumo.valor != null && resumo.entrada != null && resumo.entrada > resumo.valor) {
    pendencias.push({ texto: 'Entrada informada é maior que o valor total — verifique os valores.' })
  }

  const vistos = new Set<string>()
  return pendencias.filter((p) => (vistos.has(p.texto) ? false : (vistos.add(p.texto), true)))
}
