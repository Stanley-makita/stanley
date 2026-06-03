// Bradesco — Autorização FGTS
import { type MapaFormulario } from '../engine'
import { type DadosProcesso } from '../dados'
import { fmtCpf, fmtData, fmtDataHoje, fmtEstadoCivil, fmtRegimeCasamento, localPadrao } from '../helpers'

export function mapaFgts(d: DadosProcesso): MapaFormulario {
  const c1 = d.compradores.find((c) => c.principal) ?? d.compradores[0]
  const imovel = d.imovel
  const contas = d.fgts_comprador1.slice(0, 10)

  const endImovel = [imovel?.rua, imovel?.numero, imovel?.bairro].filter(Boolean).join(', ')
  const temFgts = contas.length > 0

  const campos: MapaFormulario = [
    // Identificação
    { tipo: 'texto', campo: 'CPF.1',   valor: fmtCpf(c1?.cpf) },
    { tipo: 'texto', campo: 'pis',     valor: temFgts ? (contas[0].pis_pasep ?? '') : '' },

    // Imóvel
    { tipo: 'texto', campo: 'edrec',   valor: endImovel },
    { tipo: 'texto', campo: 'mu',      valor: imovel?.cidade ?? '' },
    { tipo: 'texto', campo: 'uf',      valor: imovel?.uf ?? '' },

    // Município de trabalho
    { tipo: 'texto', campo: 'mu2',     valor: c1?.municipio_trabalho ?? '' },
    { tipo: 'texto', campo: 'uf2',     valor: c1?.uf_trabalho ?? '' },

    // Empresa
    { tipo: 'texto', campo: 'razaoSocial',   valor: c1?.empresa_nome ?? '' },
    { tipo: 'texto', campo: 'razaoSocial11', valor: c1?.empresa_cnpj ?? '' },

    // Estado civil e casamento
    { tipo: 'texto', campo: 'estado civil',   valor: fmtEstadoCivil(c1?.estado_civil) },
    { tipo: 'texto', campo: 'casamento',      valor: fmtRegimeCasamento(c1?.regime_casamento) },
    { tipo: 'texto', campo: 'DATA_casamento', valor: fmtData(c1?.data_casamento) },

    // Checkbox: imóvel localizado no município onde trabalha (Sim = check)
    { tipo: 'checkbox', campo: 'comp',   marcar: true },
    // Checkbox: 36 meses FGTS
    { tipo: 'checkbox', campo: 'Props',  marcar: temFgts },

    // Local e data
    { tipo: 'texto', campo: 'local',   valor: localPadrao() },
    { tipo: 'texto', campo: 'data 13', valor: fmtDataHoje() },
  ]

  // Contas FGTS (linhas 1-10)
  const codsEmp  = ['cod emp1','cod emp2','cod emp3','cod emp4','cod emp5','cod emp6','cod emp7','cod emp8','cod emp9','cod emp10']
  const ctaFgts  = ['cpf conj 1','cpf conj 2','cpf conj 3','cpf conj 4','cpf conj 5','cpf conj 6','cpf conj 7','cpf conj 8','cpf conj 9','cpf conj 10']
  const valores  = ['v1','v2','v3','v4','v5','v6','v7','v8','v9','v10']

  for (let i = 0; i < contas.length; i++) {
    const cta = contas[i]
    campos.push({ tipo: 'texto', campo: codsEmp[i], valor: cta.cod_empregador ?? '' })
    campos.push({ tipo: 'texto', campo: ctaFgts[i], valor: cta.nro_conta_fgts ?? '' })
    campos.push({ tipo: 'texto', campo: valores[i],  valor: cta.valor_saque ?? 'TOTAL' })
  }

  // Valor total FGTS
  if (d.valor_fgts) {
    campos.push({
      tipo: 'texto', campo: 'vlTotal',
      valor: new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(d.valor_fgts),
    })
  }

  return campos
}
