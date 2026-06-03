// Bradesco — DPS (Declaração Pessoal de Saúde)
// Apenas o cabeçalho é preenchido automaticamente.
// As perguntas de saúde são preenchidas pelo cliente via formulário digital (Fase 4).
import { type MapaFormulario } from '../engine'
import { type DadosProcesso } from '../dados'
import { fmtCpf, fmtData, fmtDataHoje, fmtEstadoCivil, localPadrao } from '../helpers'

export function mapaDps(d: DadosProcesso): MapaFormulario {
  const c1 = d.compradores.find((c) => c.principal) ?? d.compradores[0]

  return [
    { tipo: 'texto',    campo: 'Nome',         valor: c1?.nome ?? '' },
    { tipo: 'texto',    campo: 'cpf',          valor: fmtCpf(c1?.cpf) },
    { tipo: 'texto',    campo: 'DataNasc',     valor: fmtData(c1?.data_nascimento) },
    { tipo: 'texto',    campo: 'estadocivil',  valor: fmtEstadoCivil(c1?.estado_civil) },
    { tipo: 'texto',    campo: 'REnda',        valor: c1?.renda_formal ? String(c1.renda_formal) : '' },
    // Sexo: Checkbox "Sexo" = marcar se Feminino (campo parece ser toggle F)
    { tipo: 'checkbox', campo: 'Sexo',         marcar: c1?.sexo === 'F' },
    // Finalidade do imóvel
    { tipo: 'checkbox', campo: 'cca',          marcar: d.imovel?.categoria === 'comercial' },
    { tipo: 'checkbox', campo: 'cch',          marcar: d.imovel?.categoria !== 'comercial' },
    // Local e data
    { tipo: 'texto',    campo: 'local',        valor: localPadrao() },
    { tipo: 'texto',    campo: 'dataAssinatura', valor: fmtDataHoje() },
  ]
}
