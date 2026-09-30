import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ResumoNegociacao } from '../entenderNegociacao'
import type { Processo } from '@/types/processos'
import { gerarMinutaPorIA } from '../gerarMinutaPorIA'
import { modeloParaRedacao } from '../referenciaCompraVenda'

const mock = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: mock.create } } }))

const pessoa = (nome: string) => ({ nome, cpf: null, rg: null, orgao_emissor_rg: null, cnh: null, estado_civil: null, regime_casamento: null, profissao: null, nacionalidade: null, data_nascimento: null, endereco: null })
const resumo: ResumoNegociacao = {
  compradores: [pessoa('Maria Compradora'), pessoa('Pedro Comprador')], vendedores: [pessoa('Carla Vendedora')],
  imovel: { descricao: null, endereco: null, matricula: null, cartorio: null, area: null, cadastro_prefeitura: null, cidade: null, uf: null },
  valor: 570000, entrada: 250000, saldo: 'financiado', valor_financiado: 320000, banco_financiador: null,
  prazo_posse_dias: null, condicao_posse: null, multa_percentual: 10, cidade: 'Maringá',
  clausula_pagamento_complementar: null, painel_inteligencia: [], testemunhas: [], corretor: null, comissao: null, certidoes: [],
}
const input = { tipoContrato: 'compra_venda', resumo, plano: { clausulas: [] }, instrucoesLivres: null, processo: { id: 'p1', empresa_id: 'e1' } as Processo }
function minuta() {
  return modeloParaRedacao(resumo)
    .replace('{{vendedores_qualificacao}}', '<p>Carla Vendedora</p>')
    .replace('{{compradores_qualificacao}}', '<p>Maria Compradora e Pedro Comprador</p>')
    .replace('{{vendedores_assinaturas}}', '<p>Carla Vendedora — assinatura</p>')
    .replace('{{compradores_assinaturas}}', '<p>Maria Compradora — assinatura</p><p>Pedro Comprador — assinatura</p>')
    .replace('{{valor_total}}', 'R$ 570.000,00').replace('{{valor_entrada}}', 'R$ 250.000,00').replace('{{valor_financiado}}', 'R$ 320.000,00')
    .replace(/\{\{(?!PROTEGIDA:)[^}]+\}\}/g, '')
}
function responder(html: string) { mock.create.mockResolvedValue({ content: [{ type: 'text', text: html }], stop_reason: 'end_turn' }) }
beforeEach(() => { mock.create.mockReset() })

describe('geração com referência e sem substituição silenciosa', () => {
  it('envia o modelo completo, faz uma chamada e devolve referência identificada', async () => {
    responder(minuta())
    const resultado = await gerarMinutaPorIA(input)
    expect(resultado.origem).toBe('ia')
    expect(resultado.referencia.versao).toBe('2026-09-29')
    expect(resultado.html).toContain('não será constituída inadimplência')
    expect(resultado.html).not.toContain('{{PROTEGIDA:')
    expect(resultado.html).toContain('multa de 2% (dois por cento) sobre o débito inadimplido')
    expect(resultado.html).toContain('excetuadas as hipóteses do Parágrafo Primeiro da Cláusula Segunda')
    expect(mock.create).toHaveBeenCalledTimes(1)
    const [pedido, opcoes] = mock.create.mock.calls[0]
    expect(pedido.messages[0].content).toContain('MODELO DE REFERÊNCIA COMPLETO')
    expect(pedido.messages[0].content).toContain('negativa do agente financeiro')
    expect(opcoes).toMatchObject({ timeout: 75000, maxRetries: 0 })
  })
  it('comprador omitido causa erro; não gera fallback nem outra chamada oculta', async () => {
    responder(minuta().replaceAll('Pedro Comprador', ''))
    await expect(gerarMinutaPorIA(input)).rejects.toThrow('não passou na conferência')
    expect(mock.create).toHaveBeenCalledTimes(1)
  })
  it('proteção omitida reprova mesmo se a IA escrever um título de sanção penal', async () => {
    responder(minuta().replace('{{PROTEGIDA:SANCAO_PENAL}}', '<h3>CLÁUSULA QUARTA — DA SANÇÃO PENAL</h3><p>Sem multa.</p>'))
    await expect(gerarMinutaPorIA(input)).rejects.toThrow('SANCAO_PENAL')
  })
  it('supressão de cláusula não protegida também reprova', async () => {
    responder(minuta().replace('<h3>CLÁUSULA NONA — DA SUCESSÃO</h3>', ''))
    await expect(gerarMinutaPorIA(input)).rejects.toThrow('SUCESSÃO')
  })
  it('erro técnico não devolve modelo alternativo incompleto', async () => {
    mock.create.mockRejectedValue(Object.assign(new Error('timeout'), { name: 'APIConnectionTimeoutError' }))
    await expect(gerarMinutaPorIA(input)).rejects.toThrow('timeout')
    expect(mock.create).toHaveBeenCalledTimes(1)
  })
  it('e-mail explícito nas instruções não pode ser perdido no resumo', async () => {
    responder(minuta())
    await expect(gerarMinutaPorIA({ ...input, instrucoesLivres: 'Email da compradora: maria@example.com' })).rejects.toThrow('maria@example.com')
  })
  it('insere literalmente a condição de posse confirmada, sem depender de paráfrase', async () => {
    const condicao = 'imediatamente após entrada e assinatura'
    responder(minuta().replace('ficará imitido(a) na posse do imóvel ', 'ficará imitido(a) na posse do imóvel {{DADO:CONDICAO_POSSE}} '))
    const resultado = await gerarMinutaPorIA({ ...input, resumo: { ...resumo, condicao_posse: condicao } })
    expect(resultado.html).toContain(condicao)
    expect(resultado.html).not.toContain('{{DADO:')
  })
  it('campo de certidão faltante identificado fica visível como pendência', async () => {
    responder(minuta().replace('{{PROTEGIDA:FORO}}', '<p>Certidão cível: [A PREENCHER: número da certidão cível]</p>{{PROTEGIDA:FORO}}'))
    const resultado = await gerarMinutaPorIA(input)
    expect(resultado.avisos).toEqual(['Complete antes de assinar: [A PREENCHER: número da certidão cível]'])
  })
})
