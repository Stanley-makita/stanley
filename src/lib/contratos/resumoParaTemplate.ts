/**
 * Adapta o Resumo Estruturado da Negociação (já confirmado pelo usuário) pro
 * formato que substituirVariaveis já espera (Processo/ProcessoComprador/
 * ProcessoVendedor) — usado na construção da minuta via template
 * determinístico (etapa "Construir contrato").
 */

import type { Processo, ProcessoComprador, ProcessoVendedor, PessoaDetalhes } from '@/types/processos'
import type { ResumoNegociacao, PessoaResumo } from './entenderNegociacao'
import type { ExtrasResumoNegociacao } from './substituirVariaveis'

function pessoaDetalhes(p: PessoaResumo | undefined): PessoaDetalhes | null {
  if (!p) return null
  return {
    rg: p.rg,
    registro_cnh: p.cnh,
    profissao: p.profissao,
    nacionalidade: p.nacionalidade,
    data_nascimento: p.data_nascimento,
    data_emissao: null,
    orgao_emissor: p.orgao_emissor_rg,
    estado_civil: p.estado_civil,
    regime_casamento: p.regime_casamento,
    data_casamento: null,
    conjuge_nome: null,
    conjuge_cpf: null,
    conjuge_data_nascimento: null,
    // Endereço vem só do comprovante anexado na pasta da própria pessoa
    // (comprador/vendedor) — nunca do endereço do imóvel (ver instrução
    // dedicada no SYSTEM_PROMPT de entenderNegociacao.ts).
    endereco_rua: p.endereco,
    endereco_numero: null,
    endereco_bairro: null,
    endereco_cidade: null,
    endereco_uf: null,
    endereco_cep: null,
  }
}

function comprador(p: PessoaResumo, processoId: string, empresaId: string): ProcessoComprador {
  return {
    id: '', processo_id: processoId, empresa_id: empresaId,
    nome: p.nome ?? '', cpf: p.cpf, email: null, telefone: null,
    renda_mensal: null, principal: true, created_at: '',
    pessoa: pessoaDetalhes(p),
  }
}

function vendedor(p: PessoaResumo, processoId: string, empresaId: string): ProcessoVendedor {
  return {
    id: '', processo_id: processoId, empresa_id: empresaId,
    nome: p.nome ?? '', cpf: p.cpf, email: null, telefone: null,
    banco: null, agencia: null, conta: null,
    estado_civil: p.estado_civil, conjuge_nome: null, conjuge_cpf: null,
    conjuge_rg: null, conjuge_data_nasc: null, conjuge_papel: null,
    created_at: '', pessoa: pessoaDetalhes(p),
  }
}

export function construirDadosTemplate(resumo: ResumoNegociacao, processo: Processo): {
  processoAdaptado: Processo
  compradoresAdaptados: ProcessoComprador[]
  vendedoresAdaptados: ProcessoVendedor[]
  extras: ExtrasResumoNegociacao
} {
  const processoAdaptado: Processo = {
    ...processo,
    valor_imovel: resumo.valor ?? processo.valor_imovel,
    valor_entrada: resumo.entrada ?? processo.valor_entrada,
    // Nunca "valor - entrada": pode haver parcelas intermediárias pagas com
    // recursos próprios além da entrada (ver observacoes_adicionais/extras
    // abaixo) — só usa o valor financiado que a IA extraiu explicitamente.
    valor_financiado: resumo.valor_financiado ?? processo.valor_financiado,
  }

  const valorMultaTotal = (resumo.multa_percentual != null && resumo.valor != null)
    ? `${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resumo.valor * resumo.multa_percentual / 100)} (${resumo.multa_percentual}%)`
    : null

  return {
    processoAdaptado,
    compradoresAdaptados: resumo.compradores.map((p) => comprador(p, processo.id, processo.empresa_id)),
    vendedoresAdaptados: resumo.vendedores.map((p) => vendedor(p, processo.id, processo.empresa_id)),
    extras: {
      imovelDescricao: resumo.imovel.descricao,
      imovelMatricula: resumo.imovel.matricula,
      imovelCartorio: resumo.imovel.cartorio,
      imovelArea: resumo.imovel.area,
      imovelCadastroPrefeitura: resumo.imovel.cadastro_prefeitura,
      imovelEndereco: [resumo.imovel.endereco, resumo.imovel.cidade, resumo.imovel.uf].filter(Boolean).join(', ') || null,
      bancoFinanciador: resumo.banco_financiador,
      dataPosse: resumo.prazo_posse_dias != null ? `${resumo.prazo_posse_dias} dias após a assinatura` : null,
      valorMultaTotal,
      cidade: resumo.cidade,
      observacoesPagamento: resumo.observacoes_adicionais,
    },
  }
}
