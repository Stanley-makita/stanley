// Bradesco — Declaração de Isenção do IR
import { type MapaFormulario } from '../engine'
import { type DadosProcesso } from '../dados'
import { fmtCpf, fmtDataHoje, anoExercicio, anoCalendario, localPadrao } from '../helpers'

export function mapaIsencaoIr(d: DadosProcesso): MapaFormulario {
  const c1 = d.compradores.find((c) => c.principal) ?? d.compradores[0]

  return [
    { tipo: 'texto', campo: 'Nome',           valor: c1?.nome ?? '' },
    { tipo: 'texto', campo: 'cpf',            valor: fmtCpf(c1?.cpf) },
    { tipo: 'texto', campo: 'exercicio',      valor: anoExercicio() },
    { tipo: 'texto', campo: 'calendario',     valor: anoCalendario() },
    { tipo: 'texto', campo: 'local',          valor: localPadrao() },
    { tipo: 'texto', campo: 'dataAssinatura', valor: fmtDataHoje() },
  ]
}
