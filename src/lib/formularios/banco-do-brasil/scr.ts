import { type MapaFormulario } from '../engine'
import { type DadosProcesso } from '../dados'
import { carregarCamposFlat } from '../flat-template'

export function mapaScrBB(d: DadosProcesso): MapaFormulario {
  return carregarCamposFlat('BANCO_DO_BRASIL/SCR.json', d)
}
