import { type MapaFormulario } from '../engine'
import { type DadosProcesso, type DadosComprador } from '../dados'
import { carregarCamposFlat } from '../flat-template'

export function mapaScrBB(d: DadosProcesso, pessoaAtual?: DadosComprador): MapaFormulario {
  return carregarCamposFlat('BANCO_DO_BRASIL/SCR.json', d, pessoaAtual)
}
