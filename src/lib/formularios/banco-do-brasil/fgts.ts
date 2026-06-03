// Banco do Brasil — Autorização FGTS
// Campos com nomes legíveis identificados via inspecionar-campos-pdf.mjs
import { type MapaFormulario } from '../engine'
import { type DadosProcesso } from '../dados'
import { fmtCpf, fmtData, fmtDataHoje, fmtEstadoCivil, localPadrao, anoExercicio, anoCalendario } from '../helpers'

export function mapaFgtsBB(d: DadosProcesso): MapaFormulario {
  const c1 = d.compradores.find((c) => c.principal) ?? d.compradores[0]
  const imovel = d.imovel
  const contas = d.fgts_comprador1.slice(0, 5)
  const temFgts = contas.length > 0

  const endImovel = [imovel?.rua, imovel?.numero, imovel?.bairro, imovel?.cidade].filter(Boolean).join(', ')

  const campos: MapaFormulario = [
    { tipo: 'texto', campo: 'nome do trabalhador titular da conta', valor: c1?.nome ?? '' },
    { tipo: 'texto', campo: 'portador do CPF n',                   valor: fmtCpf(c1?.cpf) },
    { tipo: 'texto', campo: 'e do PISPASEP n',                     valor: temFgts ? (contas[0].pis_pasep ?? '') : '' },

    // Imóvel
    { tipo: 'texto', campo: 'no Estado de',   valor: imovel?.uf ?? '' },

    // Município residência → campo após "no Estado de"
    { tipo: 'texto', campo: 'no Estado de_2', valor: c1?.uf_trabalho ?? '' },

    // Empresa de trabalho
    { tipo: 'texto', campo: 'sendo que eu exerço', valor: c1?.municipio_trabalho ?? '' },

    // Isenção IR
    { tipo: 'texto', campo: 'e não consta em referência ao mesmo período haver declaração para o meu CPF na seção Consulta de Restituição', valor: anoExercicio() },
    { tipo: 'texto', campo: 'do site da Receita Federal', valor: anoCalendario() },

    // Local e Data
    { tipo: 'texto', campo: 'Local e Data', valor: `${localPadrao()}, ${fmtDataHoje()}` },
  ]

  // Contas FGTS (linhas 1-5)
  for (let i = 0; i < 5; i++) {
    const cta = contas[i]
    const row = String(i + 1)
    campos.push({ tipo: 'texto', campo: `Código EstabelecimentoRow${row}`, valor: cta?.cod_empregador ?? '' })
    campos.push({ tipo: 'texto', campo: `Conta FGTSRow${row}`,             valor: cta?.nro_conta_fgts ?? '' })
    campos.push({ tipo: 'texto', campo: `Valor do Saque R aRow${row}`,     valor: cta?.valor_saque ?? (cta ? 'TOTAL' : '') })
  }

  // Valor total (Row6)
  if (d.valor_fgts) {
    campos.push({
      tipo: 'texto', campo: 'Valor do Saque R aRow6',
      valor: new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(d.valor_fgts),
    })
  }

  return campos
}
