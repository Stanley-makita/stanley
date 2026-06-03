// Bradesco — Form 3: Proposta de Financiamento Imobiliário
import { type MapaFormulario } from '../engine'
import { type DadosProcesso } from '../dados'
import { fmtMoeda, fmtEstadoCivil, fmtDataHoje, localPadrao } from '../helpers'

export function mapaProposta(d: DadosProcesso): MapaFormulario {
  const compradores = d.compradores.slice(0, 4)
  const vendedores  = d.vendedores.slice(0, 2)
  const c1 = compradores[0]

  const campos: MapaFormulario = []

  // Compradores 1-4
  const nomes   = ['NomeComprador1',        'NomeComprador2',        'NomeComprador3',        'NomeComprador4']
  const profs   = ['ProfissãoComprador1',   'ProfissãoComprador2',   'ProfissãoComprador3',   'ProfissãoComprador4']
  const emails  = ['EmailComprador1',       'EmailComprador2',       'EmailComprador3',       'EmailComprador4']
  const ecivil  = ['Estado CivilComprador1','Estado CivilComprador2','Estado CivilComprador3','Estado CivilComprador4']
  const uniao   = ['uniaoEstavel1',         'uniaoEstavel2',         'uniaoEstavel3',         'uniaoEstavel4']

  for (let i = 0; i < 4; i++) {
    const c = compradores[i]
    if (!c) break
    campos.push({ tipo: 'texto',    campo: nomes[i],  valor: c.nome ?? '' })
    campos.push({ tipo: 'texto',    campo: profs[i],  valor: c.profissao ?? '' })
    campos.push({ tipo: 'texto',    campo: emails[i], valor: c.email ?? '' })
    campos.push({ tipo: 'texto',    campo: ecivil[i], valor: fmtEstadoCivil(c.estado_civil) })
    campos.push({
      tipo: 'checkbox', campo: uniao[i],
      marcar: c.estado_civil === 'uniao_estavel',
    })
  }

  // Conta débito parcelas (titular = comprador principal)
  campos.push({ tipo: 'texto', campo: 'Nome',                  valor: c1?.nome ?? '' })
  campos.push({ tipo: 'texto', campo: 'Agência Débito Parcela', valor: c1?.conta_bancaria_agencia ?? '' })
  campos.push({ tipo: 'texto', campo: 'Conta Débito Parcela',   valor: c1?.conta_bancaria_numero ?? '' })
  campos.push({ tipo: 'texto', campo: 'Dígito Conta',           valor: c1?.conta_bancaria_digito ?? '' })

  // Vendedores
  const vnomes = ['nomeVendedor1',    'nomeVendedor2']
  const vprofs = ['profissaoVendedor1','profissaoVendedor2']
  const vemails = ['emailVendedor1',  'emailVendedor2']
  const vbancos = ['BancoV1',         'BancoV2']
  const vagencias = ['AgênciaV1',     'AgênciaV2']
  const vdigitos = ['DígitoV1',       'DígitoV2']
  const vcontas  = ['ContaV1',        'ContaV2']
  const vdigitosC = ['DígitoContaV1', 'DígitoContaV2']

  for (let i = 0; i < 2; i++) {
    const v = vendedores[i]
    if (!v) break
    campos.push({ tipo: 'texto', campo: vnomes[i],   valor: v.nome ?? '' })
    campos.push({ tipo: 'texto', campo: vprofs[i],   valor: v.profissao ?? '' })
    campos.push({ tipo: 'texto', campo: vemails[i],  valor: v.email ?? '' })
    campos.push({ tipo: 'texto', campo: vbancos[i],  valor: v.banco ?? '' })
    campos.push({ tipo: 'texto', campo: vagencias[i],valor: v.agencia ?? '' })
    campos.push({ tipo: 'texto', campo: vdigitos[i], valor: v.digito ?? '' })
    campos.push({ tipo: 'texto', campo: vcontas[i],  valor: v.conta ?? '' })
    campos.push({ tipo: 'texto', campo: vdigitosC[i],valor: '' })
  }

  // Condições do financiamento
  campos.push({
    tipo: 'texto', campo: 'ValorCompra',
    valor: fmtMoeda(d.valor_imovel),
  })
  campos.push({
    tipo: 'texto', campo: 'ValorFinanciamento',
    valor: fmtMoeda(d.valor_financiado),
  })
  campos.push({
    tipo: 'texto', campo: 'prazoAmortizacao',
    valor: d.prazo_amortizacao_meses ? String(d.prazo_amortizacao_meses) : '',
  })
  campos.push({
    tipo: 'texto', campo: 'DiaVencimento',
    valor: d.dia_vencimento_parcela ? String(d.dia_vencimento_parcela) : '',
  })
  campos.push({
    tipo: 'radio', campo: 'Sistema',
    opcao: d.sistema_amortizacao === 'PRICE' ? 'Price' : 'SAC',
  })
  campos.push({
    tipo: 'radio', campo: 'Despesas',
    opcao: d.financiar_despesas_cartorariais ? 'Sim' : 'Não',
  })
  // Débito em conta corrente (radio)
  campos.push({ tipo: 'radio', campo: 'debContaBoleto', opcao: 'Débito em conta corrente Bradesco' })

  // Local e data
  campos.push({ tipo: 'texto', campo: 'Local', valor: localPadrao() })
  campos.push({ tipo: 'texto', campo: 'Data',  valor: fmtDataHoje() })

  return campos
}
