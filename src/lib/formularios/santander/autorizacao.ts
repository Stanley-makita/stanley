// Santander — Autorização dos Compradores (1 página)
// PDF com nomes de campos garbled — preenchimento via posição
// Os 4 campos de texto legíveis foram descobertos via inspecionar-posicoes:
// Não há campos de texto legíveis neste form — apenas nomes e CPFs via posição
// Estratégia: preencher pelo índice de campo de texto (TextField)
import { type MapaFormulario } from '../engine'
import { type DadosProcesso } from '../dados'
import { fmtCpf, fmtDataHoje, localPadrao } from '../helpers'

export function mapaAutorizacaoSantander(d: DadosProcesso): MapaFormulario {
  const c1 = d.compradores[0]
  const c2 = d.compradores[1]

  // A autorização Santander tem apenas: Nome 1º Comprador, CPF, Nome 2º Comprador, CPF
  // e campos de Local e Data. Os campos de texto (K¢ŁX...) aparecem na ordem visual.
  // Infelizmente os nomes são binários — não é possível mapear por nome.
  // O preenchimento será feito via overlay de texto na Fase 2b (coordenadas).
  // Por ora retornamos array vazio para que o template seja incluído sem preenchimento.
  return []
}
