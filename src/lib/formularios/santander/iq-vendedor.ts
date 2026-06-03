// Santander — Autorização IQ Vendedor (para imóvel com financiamento ativo)
// Campos com nomes legíveis identificados via inspecionar-posicoes.mjs
import { type MapaFormulario } from '../engine'
import { type DadosProcesso } from '../dados'
import { fmtCpf, fmtDataHoje, localPadrao } from '../helpers'

export function mapaIqVendedorSantander(d: DadosProcesso): MapaFormulario {
  const v1 = d.vendedores[0]
  const imovel = d.imovel

  const endImovel = [imovel?.rua, imovel?.numero, imovel?.bairro, imovel?.cidade, imovel?.uf]
    .filter(Boolean).join(', ')

  return [
    { tipo: 'texto', campo: 'Nome do Vendedor', valor: v1?.nome ?? '' },
    { tipo: 'texto', campo: 'CPF',              valor: fmtCpf(v1?.cpf) },
    { tipo: 'texto', campo: 'RG',               valor: '' },
    // Campo endereço do imóvel financiado
    { tipo: 'texto', campo: 'para fins da Proposta do Santander em qu', valor: endImovel },
  ]
}
