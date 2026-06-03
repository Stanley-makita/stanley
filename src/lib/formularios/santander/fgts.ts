// Santander — Autorização FGTS (5 páginas)
// Campos semi-legíveis identificados via inspecionar-posicoes.mjs
import { type MapaFormulario } from '../engine'
import { type DadosProcesso } from '../dados'
import { fmtCpf, fmtData, fmtMoeda, fmtDataHoje, fmtEstadoCivil, localPadrao, anoExercicio, anoCalendario } from '../helpers'

export function mapaFgtsSantander(d: DadosProcesso): MapaFormulario {
  const c1 = d.compradores.find((c) => c.principal) ?? d.compradores[0]
  const imovel = d.imovel
  const contas = d.fgts_comprador1
  const temFgts = contas.length > 0

  const campos: MapaFormulario = [
    // Página 1 — dados pessoais
    { tipo: 'texto', campo: 'Nome Completo_4',          valor: c1?.nome ?? '' },
    { tipo: 'texto', campo: 'CPF_4',                    valor: fmtCpf(c1?.cpf) },
    { tipo: 'texto', campo: 'Data de Nascimento_3',     valor: fmtData(c1?.data_nascimento) },

    // Empresa
    { tipo: 'texto', campo: 'Empresa na Qual Trabalha_2', valor: c1?.empresa_nome ?? '' },
    { tipo: 'texto', campo: 'CNPJ se proprietário_2',     valor: c1?.empresa_cnpj ?? '' },
    { tipo: 'texto', campo: 'Cargo Atual_2',              valor: c1?.profissao ?? '' },
    { tipo: 'texto', campo: 'Profissão_4',                valor: c1?.profissao ?? '' },

    // Endereço
    { tipo: 'texto', campo: 'Endereço Completo_2', valor: [imovel?.rua, imovel?.numero, imovel?.bairro].filter(Boolean).join(', ') },
    { tipo: 'texto', campo: 'UF_5',                valor: imovel?.uf ?? '' },
    { tipo: 'texto', campo: 'CEP_2',               valor: imovel?.cep ?? '' },

    // Valores
    { tipo: 'texto', campo: 'A Valor de Venda  R',              valor: fmtMoeda(d.valor_imovel) },
    { tipo: 'texto', campo: 'B Valor da Entrada  R',            valor: fmtMoeda(d.valor_entrada) },
    { tipo: 'texto', campo: 'C Valor do FGTS a Ser Utilizado  R', valor: fmtMoeda(d.valor_fgts) },

    // Estado civil (radio)
    { tipo: 'radio', campo: 'Estado Civil', opcao: fmtEstadoCivil(c1?.estado_civil) },
  ]

  // Contas FGTS — campos 1/1a, 2/2a, 3/3a, etc.
  // Estrutura: campo "N" = nº conta, campo "Na" = valor saque
  for (let i = 0; i < Math.min(contas.length, 8); i++) {
    const cta = contas[i]
    const n = String(i + 1)
    campos.push({ tipo: 'texto', campo: n,        valor: cta.nro_conta_fgts ?? '' })
    campos.push({ tipo: 'texto', campo: `${n}a`,  valor: cta.valor_saque ?? 'TOTAL' })
  }

  return campos
}
