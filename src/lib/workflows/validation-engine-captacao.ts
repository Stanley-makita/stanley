/**
 * Validation Engine de Captação — responsabilidade única: decidir se há dados mínimos
 * para acionar o Motor de Crédito.
 *
 * O Motor de Crédito nunca recebe dados incompletos.
 * Esta camada existe para proteger o Motor e para informar ao comercial
 * exatamente quais campos estão faltando.
 *
 * O Workflow cria o Lead e vincula documentos independente do resultado da validação.
 * A validação apenas controla se o Motor será acionado ou não.
 */

import type { DadosCaptacaoNormalizados } from './normalizador-captacao'

export interface ResultadoValidacao {
  valido: boolean
  camposFaltantes: string[]
}

const CAMPOS_OBRIGATORIOS: Array<{
  campo: keyof DadosCaptacaoNormalizados
  label: string
  condicao?: (dados: DadosCaptacaoNormalizados) => boolean
}> = [
  { campo: 'nome',            label: 'Nome completo do cliente' },
  { campo: 'data_nascimento', label: 'Data de nascimento' },
  {
    campo: 'renda_formal',
    label: 'Renda mensal',
    // válido se tem renda_formal OU renda_informal
    condicao: (d) => (d.renda_formal ?? 0) > 0 || (d.renda_informal ?? 0) > 0,
  },
  { campo: 'valor_imovel',   label: 'Valor do imóvel' },
  {
    campo: 'valor_entrada',
    label: 'Entrada ou valor financiado',
    // válido se tem entrada OU financiado
    condicao: (d) => (d.valor_entrada ?? 0) > 0 || (d.valor_financiado ?? 0) > 0,
  },
  {
    campo: 'bancos_ids',
    label: 'Banco(s) para simular',
    // válido se há ao menos um banco
    condicao: (d) => d.bancos_ids.length > 0,
  },
]

export function validarDadosCaptacao(dados: DadosCaptacaoNormalizados): ResultadoValidacao {
  const camposFaltantes: string[] = []

  for (const regra of CAMPOS_OBRIGATORIOS) {
    const valido = regra.condicao
      ? regra.condicao(dados)
      : dados[regra.campo] !== null && dados[regra.campo] !== undefined

    if (!valido) {
      camposFaltantes.push(regra.label)
    }
  }

  return {
    valido: camposFaltantes.length === 0,
    camposFaltantes,
  }
}
