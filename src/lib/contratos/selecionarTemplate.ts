import {
  TEMPLATE_COMPRA_VENDA, TEMPLATE_DISTRATO_LOCACAO, TEMPLATE_LOCACAO_IMOVEL, TEMPLATE_PRESTACAO_SERVICOS,
} from './templates'
import type { TipoContrato } from '@/types/processos'

// Tipos sem modelo dedicado ainda (permuta, cessão de direitos, confissão de
// dívida, aditivo, outros) caem num esqueleto genérico — melhor um ponto de
// partida honesto no editor do que fingir equivalência com um tipo diferente.
const TEMPLATE_GENERICO = {
  id: 'generico',
  titulo: 'Contrato (modelo genérico)',
  descricao: 'Este tipo de contrato ainda não tem um modelo dedicado — a minuta abaixo é só um ponto de partida.',
  conteudo: `<h2 style="text-align:center">INSTRUMENTO PARTICULAR</h2>
<p style="text-align:center">{{cidade_comarca}}, {{data_extenso}}</p>
<p><em>Este tipo de contrato ainda não tem um modelo próprio no Construtor — os dados já identificados foram preenchidos abaixo, mas as cláusulas precisam ser redigidas manualmente no editor.</em></p>
<p><strong>Parte 1 (comprador/contratante):</strong> {{comprador_nome}}, CPF {{comprador_cpf}}, RG {{comprador_rg}}, {{comprador_estado_civil}}, {{comprador_profissao}}, residente em {{comprador_endereco}}.</p>
<p><strong>Parte 2 (vendedor/contratado):</strong> {{vendedor_nome}}, CPF {{vendedor_cpf}}, RG {{vendedor_rg}}, {{vendedor_estado_civil}}, {{vendedor_profissao}}, residente em {{vendedor_endereco}}.</p>
<p><strong>Imóvel:</strong> {{imovel_endereco}}, matrícula {{imovel_matricula}}.</p>
<p><strong>Valor:</strong> {{valor_total}}. <strong>Entrada:</strong> {{valor_entrada}}.</p>
<p>[A PREENCHER — cláusulas específicas deste tipo de contrato]</p>`,
}

export function selecionarTemplate(tipoContrato: TipoContrato | string) {
  switch (tipoContrato) {
    case 'compra_venda':       return TEMPLATE_COMPRA_VENDA
    case 'locacao':            return TEMPLATE_LOCACAO_IMOVEL
    case 'distrato':           return TEMPLATE_DISTRATO_LOCACAO
    case 'prestacao_servico':  return TEMPLATE_PRESTACAO_SERVICOS
    default:                   return TEMPLATE_GENERICO
  }
}
