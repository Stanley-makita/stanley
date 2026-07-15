// Central de Comunicação com o Cliente (Fase 1). Substituição de {{variavel}} independente e
// deliberadamente mais simples que src/lib/contratos/substituirVariaveis.ts — aquela função é
// acoplada ao domínio de contrato (~90 variáveis fixas de comprador/vendedor/imóvel/fiador),
// não é um bom ponto de reaproveitamento para mensagens de comunicação com o cliente.

export interface DadosSubstituicaoComunicacao {
  comprador_nome: string
  banco?: string | null
  valor_financiamento?: number | null
  fase_atual?: string | null
  responsavel_nome?: string | null
}

function formatarMoeda(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export function substituirVariaveis(corpo: string, dados: DadosSubstituicaoComunicacao): string {
  const variaveis: Record<string, string> = {
    comprador_nome:       dados.comprador_nome,
    banco:                dados.banco ?? '',
    valor_financiamento:  dados.valor_financiamento != null ? formatarMoeda(dados.valor_financiamento) : '',
    fase_atual:           dados.fase_atual ?? '',
    responsavel_nome:     dados.responsavel_nome ?? '',
  }

  return corpo.replace(/\{\{(\w+)\}\}/g, (_match, chave: string) => {
    const valor = variaveis[chave]
    return valor && valor.trim() ? valor : '[A PREENCHER]'
  })
}
