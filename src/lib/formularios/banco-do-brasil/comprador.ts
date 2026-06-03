// Banco do Brasil — Proposta Comprador (9 páginas)
// Campos com nomes genéricos "Campo formatado N" mapeados por posição
// Posições identificadas via inspecionar-posicoes.mjs
import { type MapaFormulario } from '../engine'
import { type DadosProcesso } from '../dados'
import { fmtCpf, fmtMoeda, fmtEstadoCivil, fmtDataHoje, localPadrao } from '../helpers'

export function mapaCompradorBB(d: DadosProcesso): MapaFormulario {
  const compradores = d.compradores.slice(0, 3)
  const c1 = compradores[0]
  const c2 = compradores[1]
  const c3 = compradores[2]

  // Mapeamento por nome de campo (posição p0 y=742 wide = nome comprador 1)
  // Referência: inspecionar-posicoes — campos na sequência top→bottom, page 0
  const campos: MapaFormulario = [
    // Página 1 — Comprador 1
    { tipo: 'texto', campo: 'Campo formatado 1',    valor: c1?.nome ?? '' },
    { tipo: 'texto', campo: 'Campo formatado 1_2',  valor: fmtCpf(c1?.cpf) },
    { tipo: 'texto', campo: 'Campo formatado 1_14', valor: c1?.telefone ?? '' },
    { tipo: 'texto', campo: 'Campo formatado 1_13', valor: c1?.email ?? '' },

    // Comprador 2
    { tipo: 'texto', campo: 'Campo formatado 1_3',  valor: c2?.nome ?? '' },
    { tipo: 'texto', campo: 'Campo formatado 1_8',  valor: fmtCpf(c2?.cpf) },

    // Comprador 3
    { tipo: 'texto', campo: 'Campo formatado 1_4',  valor: c3?.nome ?? '' },
    { tipo: 'texto', campo: 'Campo formatado 1_9',  valor: fmtCpf(c3?.cpf) },

    // Cônjuge Comprador 1 (campos na faixa 1_5 a 1_12)
    { tipo: 'texto', campo: 'Campo formatado 1_5',  valor: c1?.conjuge_nome ?? '' },
    { tipo: 'texto', campo: 'Campo formatado 1_10', valor: fmtCpf(c1?.conjuge_cpf) },

    // Imóvel
    { tipo: 'texto', campo: 'Campo formatado 8',  valor: d.imovel ? [d.imovel.rua, d.imovel.numero].filter(Boolean).join(', ') : '' },
    { tipo: 'texto', campo: 'Campo formatado 12', valor: d.imovel?.bairro ?? '' },
    { tipo: 'texto', campo: 'Campo formatado 11', valor: d.imovel?.cidade ?? '' },
    { tipo: 'texto', campo: 'Campo formatado 10', valor: d.imovel?.uf ?? '' },

    // Financiamento (página 2)
    { tipo: 'texto', campo: 'Campo formatado 9',  valor: fmtMoeda(d.valor_imovel) },

    // Conta corrente débito (página 5)
    { tipo: 'texto', campo: 'Campo formatado 3',  valor: c1?.nome ?? '' },
    { tipo: 'texto', campo: 'Campo formatado 3_2', valor: c1?.conta_bancaria_agencia ?? '' },
    { tipo: 'texto', campo: 'Campo formatado 3_3', valor: c1?.conta_bancaria_numero ?? '' },
  ]

  return campos
}
