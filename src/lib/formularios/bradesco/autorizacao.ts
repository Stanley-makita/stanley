// Bradesco — Form 1: Autorização Análises de Crédito e Avaliação
// Campos mapeados via inspecionar-campos-pdf.mjs
import { type MapaFormulario } from '../engine'
import { type DadosProcesso } from '../dados'
import { fmtData, fmtDataHoje, fmtCpf, localPadrao } from '../helpers'

export function mapaAutorizacao(d: DadosProcesso): MapaFormulario {
  const c1 = d.compradores[0]
  const c2 = d.compradores[1]
  const imovel = d.imovel

  const endImovel = [imovel?.rua, imovel?.numero].filter(Boolean).join(', ')

  const temFgts = d.fgts_comprador1.length > 0

  return [
    // Comprador 1
    { tipo: 'texto',    campo: 'NomeComprador1',           valor: c1?.nome ?? '' },
    { tipo: 'texto',    campo: 'comprador1.cpfcnpj',       valor: fmtCpf(c1?.cpf) },
    { tipo: 'texto',    campo: 'NascimentoComprador1',     valor: fmtData(c1?.data_nascimento) },
    { tipo: 'radio',    campo: 'comprador1.cpfcnpjradio',  opcao: 'CPF' },

    // Cônjuge comprador 1
    { tipo: 'texto',    campo: 'CJ-NomeComprador1',        valor: c1?.conjuge_nome ?? '' },
    { tipo: 'texto',    campo: 'CJ-CPF_CNPJ_Comprador1',  valor: fmtCpf(c1?.conjuge_cpf) },
    { tipo: 'texto',    campo: 'CJ-NascimentoComprador1',  valor: fmtData(c1?.conjuge_data_nascimento) },
    {
      tipo: 'radio', campo: 'ComporRenda1',
      opcao: (c1?.conjuge_renda_formal ?? 0) > 0 ? 'Sim' : 'Não',
    },

    // Comprador 2 (se houver)
    ...(c2 ? [
      { tipo: 'texto' as const, campo: 'NomeComprador2',          valor: c2.nome ?? '' },
      { tipo: 'texto' as const, campo: 'comprador2.cpfcnpj',      valor: fmtCpf(c2.cpf) },
      { tipo: 'texto' as const, campo: 'NascimentoComprador2',    valor: fmtData(c2.data_nascimento) },
      { tipo: 'radio' as const, campo: 'comprador2.cpfcnpjradio', opcao: 'CPF' },
      { tipo: 'texto' as const, campo: 'CJ-NomeComprador2',       valor: c2.conjuge_nome ?? '' },
      { tipo: 'texto' as const, campo: 'CJ-CPF_CNPJ_Comprador2', valor: fmtCpf(c2.conjuge_cpf) },
      { tipo: 'texto' as const, campo: 'CJ-NascimentoComprador2', valor: fmtData(c2.conjuge_data_nascimento) },
      {
        tipo: 'radio' as const, campo: 'ComporRenda2',
        opcao: (c2.conjuge_renda_formal ?? 0) > 0 ? 'Sim' : 'Não',
      },
    ] : []),

    // Dados bancários (para débito da tarifa de avaliação)
    { tipo: 'texto', campo: 'Agência',       valor: c1?.conta_bancaria_agencia ?? '' },
    { tipo: 'texto', campo: 'Conta Corrente', valor: c1?.conta_bancaria_numero ?? '' },
    { tipo: 'texto', campo: 'Dígito',         valor: c1?.conta_bancaria_digito ?? '' },

    // Imóvel
    {
      tipo: 'radio', campo: 'Imovel',
      opcao: imovel?.categoria === 'comercial' ? 'Comercial'
           : imovel?.categoria === 'industrial' ? 'Lote Urbano'
           : 'Residencial',
    },
    { tipo: 'texto', campo: 'Endereço',         valor: endImovel },
    { tipo: 'texto', campo: 'Número Endereço',  valor: imovel?.numero ?? '' },
    { tipo: 'texto', campo: 'Complemento',      valor: imovel?.apto_unidade ?? '' },

    // FGTS
    { tipo: 'radio', campo: 'FGTS', opcao: temFgts ? 'Sim' : 'Não' },

    // Vaga autônoma — padrão Não
    { tipo: 'radio', campo: 'Autonoma', opcao: 'Não' },

    // Contato para avaliação — usa dados do comprador 1
    { tipo: 'texto', campo: 'NomeAvaliacao.0',  valor: c1?.nome ?? '' },
    { tipo: 'texto', campo: 'Telefone01.0',     valor: c1?.telefone ?? '' },

    // Local e data
    { tipo: 'texto', campo: 'Local', valor: localPadrao() },
    { tipo: 'texto', campo: 'Data',  valor: fmtDataHoje() },
  ]
}
