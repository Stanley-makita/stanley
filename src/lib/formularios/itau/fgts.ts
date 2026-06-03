// Itaú — Autorização FGTS
// Campos com nomes legíveis identificados via inspecionar-campos-pdf.mjs
import { type MapaFormulario } from '../engine'
import { type DadosProcesso } from '../dados'
import { fmtCpf, fmtData, fmtDataHoje, fmtEstadoCivil, fmtRegimeCasamento, localPadrao, anoExercicio, anoCalendario } from '../helpers'

export function mapaFgtsItau(d: DadosProcesso): MapaFormulario {
  const c1 = d.compradores.find((c) => c.principal) ?? d.compradores[0]
  const imovel = d.imovel
  const contas = d.fgts_comprador1.slice(0, 5)
  const temFgts = contas.length > 0
  const eCasado = c1?.estado_civil === 'casado' || c1?.estado_civil === 'uniao_estavel'

  const endImovel = [imovel?.rua, imovel?.numero, imovel?.bairro].filter(Boolean).join(', ')

  const campos: MapaFormulario = [
    // Dados pessoais
    { tipo: 'texto',   campo: 'Nome FGTS',   valor: c1?.nome ?? '' },
    { tipo: 'texto',   campo: 'DATA',         valor: fmtData(c1?.data_nascimento) },
    { tipo: 'texto',   campo: 'CPF',          valor: fmtCpf(c1?.cpf) },
    { tipo: 'texto',   campo: 'PIS PASEP',    valor: temFgts ? (contas[0].pis_pasep ?? '') : '' },

    // Imóvel
    { tipo: 'texto',   campo: 'ENDEREÇO',     valor: endImovel },
    { tipo: 'texto',   campo: 'MUNICIPIO 1',  valor: imovel?.cidade ?? '' },
    { tipo: 'texto',   campo: 'ESTADO 1',     valor: imovel?.uf ?? '' },

    // Residência
    { tipo: 'texto',   campo: 'MUNICIPIO 2',  valor: imovel?.cidade ?? '' },
    { tipo: 'texto',   campo: 'ESTADO 2',     valor: imovel?.uf ?? '' },

    // Trabalho
    { tipo: 'texto',   campo: 'EMPRESA',      valor: c1?.empresa_nome ?? '' },
    { tipo: 'texto',   campo: 'MUNICIPIO 3',  valor: c1?.municipio_trabalho ?? '' },
    { tipo: 'texto',   campo: 'ESTADO 3',     valor: c1?.uf_trabalho ?? '' },

    // Estado civil
    { tipo: 'dropdown', campo: 'ESTADO CIVIL',          opcao: fmtEstadoCivil(c1?.estado_civil) },
    { tipo: 'dropdown', campo: 'regime de casamento1',  opcao: fmtRegimeCasamento(c1?.regime_casamento) },

    // Data casamento/união
    ...(eCasado ? [
      { tipo: 'texto' as const, campo: 'data casamento3', valor: fmtData(c1?.data_casamento) },
      { tipo: 'texto' as const, campo: 'data casamento1', valor: fmtData(c1?.data_casamento) },
    ] : []),

    // Isenção IR
    { tipo: 'texto', campo: 'exercício 1',  valor: anoExercicio() },
    { tipo: 'texto', campo: 'exercicio 2',  valor: anoCalendario() },

    // Local/Data
    { tipo: 'texto', campo: 'ENDEREÇOCONT', valor: `${localPadrao()}, ${fmtDataHoje()}` },
  ]

  // Contas FGTS — Text Field 166-180 (5 linhas × 3 colunas)
  // Ordem: CodEmpregador, NroConta, ValorSaque por linha
  const bases = [166, 169, 172, 175, 178]
  for (let i = 0; i < 5; i++) {
    const cta = contas[i]
    const b = bases[i]
    campos.push({ tipo: 'texto', campo: `Text Field ${b}`,   valor: cta?.cod_empregador ?? '' })
    campos.push({ tipo: 'texto', campo: `Text Field ${b+1}`, valor: cta?.nro_conta_fgts ?? '' })
    campos.push({ tipo: 'texto', campo: `Text Field ${b+2}`, valor: cta?.valor_saque ?? (cta ? 'TOTAL' : '') })
  }

  return campos
}
