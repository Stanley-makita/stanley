/**
 * Adapta o Resumo Estruturado da Negociação (já confirmado pelo usuário) pro
 * formato que substituirVariaveis já espera (Processo/ProcessoComprador/
 * ProcessoVendedor) — usado na construção da minuta via template
 * determinístico (etapa "Construir contrato").
 */

import type { Processo, ProcessoComprador, ProcessoVendedor, PessoaDetalhes } from '@/types/processos'
import type { ResumoNegociacao, PessoaResumo } from './entenderNegociacao'
import { percentualTexto, valorPorExtenso, type ExtrasResumoNegociacao } from './substituirVariaveis'

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

function certidaoTexto(c: ResumoNegociacao['certidoes'][number]): string {
  const partes = [
    c.tipo ?? 'Certidão',
    c.numero ? `nº ${c.numero}` : null,
    c.orgao_emissor ? `emitida por ${c.orgao_emissor}` : null,
    c.data_emissao ? `em ${c.data_emissao}` : null,
    c.validade ? `válida até ${c.validade}` : null,
  ].filter(Boolean)
  return partes.join(', ')
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
      // condicao_posse (texto livre) tem prioridade — cobre condições
      // compostas que um número de dias não representa (ver comentário no
      // schema em entenderNegociacao.ts).
      // "em" fica embutido aqui (não no template) porque só o prazo em dias
      // precisa dele — condicao_posse já vem pronto pra encaixar direto
      // (ex: "no dia da assinatura do financiamento...").
      dataPosse: resumo.condicao_posse
        ?? (resumo.prazo_posse_dias != null ? `em ${resumo.prazo_posse_dias} dias após a assinatura` : null),
      condicaoPosseComposta: resumo.condicao_posse != null,
      valorMultaTotal,
      multaPercentualTexto: resumo.multa_percentual != null ? percentualTexto(resumo.multa_percentual) : null,
      cidade: resumo.cidade,
      observacoesPagamento: resumo.observacoes_adicionais,
      listaCertidoes: resumo.certidoes.length > 0 ? resumo.certidoes.map(certidaoTexto).join('; ') : null,
      corretorNome: resumo.corretor?.nome ?? null,
      corretorCpf: resumo.corretor?.cpf ?? null,
      corretorCreci: resumo.corretor?.creci ?? null,
      valorComissao: resumo.comissao?.valor != null
        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resumo.comissao.valor)
        : null,
      valorComissaoExtenso: resumo.comissao?.valor != null ? valorPorExtenso(resumo.comissao.valor) : null,
      corretagemResponsavel: resumo.comissao?.responsavel === 'comprador'
        ? 'do(a) COMPROMISSÁRIO(A) COMPRADOR(A)'
        : resumo.comissao?.responsavel === 'vendedor'
          ? 'do(a) COMPROMITENTE VENDEDOR(A)'
          : null,
      corretagemMomentoPagamento: resumo.comissao?.momento_pagamento ? `, devida ${resumo.comissao.momento_pagamento}` : null,
      testemunha1Nome: resumo.testemunhas[0]?.nome ?? null,
      testemunha1Cpf: resumo.testemunhas[0]?.cpf ?? null,
      testemunha2Nome: resumo.testemunhas[1]?.nome ?? null,
      testemunha2Cpf: resumo.testemunhas[1]?.cpf ?? null,
    },
  }
}
