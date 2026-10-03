/** Exportação de Negócios › Consórcio (pedido 03/10/2026): grupo, cota, cliente, CPF, tipo de lance. */
import { describe, it, expect } from 'vitest'
import { linhasExportacaoConsorcio } from '../exportarConsorcio'

const comprador = { nome: 'IGOR ROSSI FERMO', cpf: '04975462990', principal: true }

describe('linhasExportacaoConsorcio', () => {
  it('uma linha por cota válida, com o lance da cota ou o padrão do negócio', () => {
    const r = linhasExportacaoConsorcio([{
      tipo_lance: 'fixo',
      compradores: [comprador],
      cotas: [
        { grupo: '40205', cota: '1083\t', tipo_lance: 'livre', status_cota: 'ativo' },
        { grupo: '40205', cota: '1084', tipo_lance: null, status_cota: 'contemplado' },
        { grupo: '40205', cota: '9999', tipo_lance: 'livre', status_cota: 'cancelado' },
      ],
    }])
    expect(r).toEqual([
      { Grupo: '40205', Cota: '1083', Cliente: 'IGOR ROSSI FERMO', CPF: '049.754.629-90', 'Tipo de lance': 'Lance livre' },
      { Grupo: '40205', Cota: '1084', Cliente: 'IGOR ROSSI FERMO', CPF: '049.754.629-90', 'Tipo de lance': 'Lance fixo' },
    ])
  })

  it('negócio sem cota sai com o grupo/cota de Dados da Carta', () => {
    expect(linhasExportacaoConsorcio([{ grupo_consorcio: '0042', cota_consorcio: '015', tipo_lance: null, compradores: [], cotas: [] }]))
      .toEqual([{ Grupo: '0042', Cota: '015', Cliente: '', CPF: '', 'Tipo de lance': '' }])
  })
})
