import { describe, it, expect } from 'vitest'
import {
  ESPERA_AVISO_MS, decidirAvisoSolicitacao, destinatariosDoAviso, montarMensagemAvisoSolicitacao,
} from '../avisoWhatsapp'

const agora = new Date('2026-10-20T15:00:00Z').getTime()
const ha = (ms: number) => new Date(agora - ms).toISOString()
const msg = (autor_id: string, created_at: string, texto = 'ok') => ({ autor_id, created_at, texto })

describe('decidirAvisoSolicitacao', () => {
  it('avisa quando a última mensagem nova tem 1 minuto', () => {
    expect(decidirAvisoSolicitacao({ mensagensNovas: [msg('op', ha(ESPERA_AVISO_MS))], statusAvisado: 'pendente', agora }))
      .toEqual({ acao: 'avisar' })
  })

  it('não avisa se chegou mensagem durante a espera (o pedido dela avisa tudo junto)', () => {
    const mensagensNovas = [msg('op', ha(ESPERA_AVISO_MS)), msg('op', ha(20_000))]
    expect(decidirAvisoSolicitacao({ mensagensNovas, statusAvisado: 'pendente', agora }))
      .toEqual({ acao: 'ignorar', motivo: 'ainda_movimentando' })
  })

  it('não avisa sem mensagem nova (outro pedido já avisou)', () => {
    expect(decidirAvisoSolicitacao({ mensagensNovas: [], statusAvisado: 'em_andamento', agora }))
      .toEqual({ acao: 'ignorar', motivo: 'sem_novidade' })
  })

  it('para depois de avisar a conclusão', () => {
    expect(decidirAvisoSolicitacao({ mensagensNovas: [msg('op', ha(ESPERA_AVISO_MS))], statusAvisado: 'concluido', agora }))
      .toEqual({ acao: 'ignorar', motivo: 'ja_encerrada' })
  })
})

describe('destinatariosDoAviso', () => {
  const mensagens = [msg('fabricia', ha(1)), msg('andresa', ha(1))]

  it('solicitante e comercial iguais recebem uma vez só', () => {
    const r = destinatariosDoAviso(['andresa', 'andresa'], mensagens)
    expect(r).toHaveLength(1)
    expect(r[0].mensagens.map(m => m.autor_id)).toEqual(['fabricia'])
  })

  it('cada um recebe só o que não escreveu; quem só escreveu não recebe', () => {
    const r = destinatariosDoAviso(['gerente', 'andresa'], [msg('gerente', ha(1))])
    expect(r.map(d => d.usuarioId)).toEqual(['andresa'])
  })

  it('ignora destinatário vazio (lead sem comercial)', () => {
    expect(destinatariosDoAviso(['andresa', null, undefined], mensagens).map(d => d.usuarioId)).toEqual(['andresa'])
  })
})

describe('montarMensagemAvisoSolicitacao', () => {
  const base = {
    tipoRotulo: 'Análise de Crédito',
    clienteNome: 'Kassia Carolina Muniz',
    solicitanteNome: 'Andresa',
    responsavelNome: 'Fabricia',
    statusRotulo: 'Aguardando resposta',
    encerrada: false,
  }

  it('mostra cliente, quem pediu para quem, status e as mensagens', () => {
    const texto = montarMensagemAvisoSolicitacao({
      ...base,
      mensagens: [{ autorNome: 'Fabricia', texto: 'Aprovado no Itaú', hora: '15:42' }],
    })
    expect(texto).toContain('*Análise de Crédito — Kassia Carolina Muniz*')
    expect(texto).toContain('Pedido por Andresa · Para Fabricia')
    expect(texto).toContain('Status: *Aguardando resposta*')
    expect(texto).toContain('💬 *Fabricia* (15:42):\nAprovado no Itaú')
  })

  it('pula retorno sem texto e resume quando há mais de 5 mensagens', () => {
    const mensagens = Array.from({ length: 7 }, (_, i) => ({ autorNome: 'F', texto: `m${i}`, hora: '10:00' }))
    const texto = montarMensagemAvisoSolicitacao({ ...base, mensagens: [...mensagens, { autorNome: 'F', texto: ' ', hora: '10:01' }] })
    expect(texto).toContain('(+2 mensagens anteriores no Fonti)')
    expect(texto).not.toContain('m1\n')
    expect(texto).toContain('m6')
  })

  it('marca a conclusão', () => {
    expect(montarMensagemAvisoSolicitacao({ ...base, statusRotulo: 'Concluído', encerrada: true, mensagens: [] }))
      .toContain('Status: ✅ *Concluído*')
  })
})
