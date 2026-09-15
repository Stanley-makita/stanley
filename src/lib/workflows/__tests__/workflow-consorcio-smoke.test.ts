import { describe, it, expect } from 'vitest'
import { iniciarFluxoConsorcio, processarRespostaConsorcio, type WorkflowConsorcioContexto } from '../workflow-consorcio'
import type { ConsorcioPendente } from '../consorcio-pendente'

// Stub mínimo de SupabaseClient — só o suficiente pra salvar/ler o estado
// pendente (mesma tabela `conversas`) e o insert final em `simulacoes_central`,
// sem bater em rede nenhuma. Sem instancia_token/telefone_destino no ctx, o
// envio de PDF é pulado (mesmo comportamento de produção quando ausente), então
// este teste não depende de credenciais reais do Uazapi.
//
// leitura/escrita do pendente resolvem a conversa via RPC obter_ou_criar_conversa
// (garantirConversaOperador) — .rpc() aqui devolve sempre o mesmo id fixo, e o
// .select() encadeado depois devolve o pendente salvo por último no `estado`
// (mutável, simula a persistência real entre chamadas dentro do mesmo teste).
function criarSupabaseStub() {
  const estado: Record<string, unknown> = {}
  const chain: any = {
    update: (valores: Record<string, unknown>) => { Object.assign(estado, valores); return chain },
    insert: () => chain,
    eq: () => chain,
    in: () => chain,
    ilike: () => chain,
    select: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: { id: 'conversa-teste', ...estado } }),
    single: async () => ({ data: { id: 'conversa-teste' }, error: null }),
  }
  return {
    from: () => chain,
    rpc: async () => ({ data: 'conversa-teste', error: null }),
  } as any
}

const ctx: WorkflowConsorcioContexto = {
  empresa_id: 'empresa-teste',
  usuario_id: 'usuario-teste',
  usuario_nome: 'Operador Teste',
  supabase: criarSupabaseStub(),
  telefone_operador: '5544999999999',
}

describe('workflow-consorcio — fluxo completo (smoke)', () => {
  it('percorre as 10 perguntas, aceita as duas sugestões e finaliza com resumo', async () => {
    const inicio = await iniciarFluxoConsorcio(ctx)
    expect(inicio).toContain('Simulador de Consórcio')
    expect(inicio).toContain('Imóvel')

    let pendente: ConsorcioPendente = { passo: 'tipo_bem', dados: {} }

    const r0 = await processarRespostaConsorcio('1', pendente, ctx) // Imóvel
    expect(r0).toContain('valor do bem')
    pendente = { passo: 'valor_bem', dados: { tipoBem: 'imovel' } }

    const r1 = await processarRespostaConsorcio('900000', pendente, ctx)
    expect(r1).toContain('valor da carta')
    expect(r1).toContain('Sugestão')
    pendente = { ...pendente, passo: 'valor_carta', dados: { ...pendente.dados, valorBem: 900000 } }

    const r2 = await processarRespostaConsorcio('sim', pendente, ctx) // aceita a sugestão
    expect(r2).toContain('mês')
    pendente = { ...pendente, passo: 'mes_contemplacao', dados: { ...pendente.dados, valorCarta: 900000 / 0.7 } }

    const r3 = await processarRespostaConsorcio('14', pendente, ctx)
    expect(r3).toContain('prazo em meses')
    pendente = { ...pendente, passo: 'prazo_meses', dados: { ...pendente.dados, mesLanceContemplacao: 14 } }

    const r4 = await processarRespostaConsorcio('236', pendente, ctx)
    expect(r4).toContain('Taxa de Adm')
    pendente = { ...pendente, passo: 'taxa_adm', dados: { ...pendente.dados, prazoMeses: 236 } }

    const r5 = await processarRespostaConsorcio('20', pendente, ctx)
    expect(r5).toContain('correção')
    pendente = { ...pendente, passo: 'indice_correcao', dados: { ...pendente.dados, taxaAdmPercentual: 0.20 } }

    const r6 = await processarRespostaConsorcio('3', pendente, ctx)
    expect(r6).toContain('Indexador')
    pendente = { ...pendente, passo: 'indexador_fixo', dados: { ...pendente.dados, indiceCorrecaoAnual: 0.03 } }

    const r7 = await processarRespostaConsorcio('1', pendente, ctx) // Fixo
    expect(r7).toContain('parcela reduzida')
    expect(r7).toContain('Sugestão')
    pendente = { ...pendente, passo: 'parcela_reduzida', dados: { ...pendente.dados, indexadorFixo: true } }

    const r8 = await processarRespostaConsorcio('sim', pendente, ctx) // aceita a sugestão (70%)
    expect(r8).toContain('Fundo de reserva')
    pendente = { ...pendente, passo: 'fundo_reserva', dados: { ...pendente.dados, percentualParcelaReduzida: 0.70 } }

    const final = await processarRespostaConsorcio('3', pendente, ctx)
    expect(final).toContain('Simulação de Consórcio')
    expect(final).toContain('Valor do lance')
    expect(final).toContain('Valor Líquido')
    expect(final).toContain('CET a.a')
    // Sem instancia_token/telefone_destino no ctx — PDF é pulado conforme
    // esperado (mesmo comportamento de produção sem credenciais).
    expect(final).toContain('PDFs indisponíveis')
  })

  it('cancela a qualquer momento com "cancelar"', async () => {
    const pendente: ConsorcioPendente = { passo: 'prazo_meses', dados: { valorBem: 900000 } }
    const resposta = await processarRespostaConsorcio('cancelar', pendente, ctx)
    expect(resposta).toContain('cancelada')
  })

  it('cancela a qualquer momento com "sair" — mesma resposta de "cancelar"', async () => {
    const pendente: ConsorcioPendente = { passo: 'taxa_adm', dados: { valorBem: 900000 } }
    const resposta = await processarRespostaConsorcio('sair', pendente, ctx)
    expect(resposta).toContain('cancelada')
    expect(resposta).toContain('*consorcio')
  })

  it('toda pergunta mostra a dica de como sair', async () => {
    const inicio = await iniciarFluxoConsorcio(ctx)
    expect(inicio).toContain('*sair*')

    const pendente: ConsorcioPendente = { passo: 'valor_bem', dados: {} }
    const resposta = await processarRespostaConsorcio('900000', pendente, ctx)
    expect(resposta).toContain('*sair*')
  })

  it('repete a pergunta quando a resposta não é entendida', async () => {
    const pendente: ConsorcioPendente = { passo: 'mes_contemplacao', dados: { valorBem: 900000, valorCarta: 1000000 } }
    const resposta = await processarRespostaConsorcio('não sei', pendente, ctx)
    expect(resposta).toContain('❓')
    expect(resposta).toContain('mês')
  })
})
