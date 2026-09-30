import { NextResponse } from 'next/server'
import { mensagemErroContrato } from './execucaoIA'

/** Margem antes do limite de 120s da hospedagem, inclusive para falhas de autenticação/BD. */
export async function executarEtapaContrato(etapa: string, executar: () => Promise<Response>): Promise<Response> {
  const inicio = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const limite = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const erro = new Error('Prazo da etapa excedido')
        erro.name = 'TimeoutError'
        reject(erro)
      }, 105_000)
    })
    const resposta = await Promise.race([executar(), limite])
    console.info('[contratos/etapa]', { etapa, duracao_ms: Date.now() - inicio, status: resposta.status })
    return resposta
  } catch (erro) {
    const resultado = mensagemErroContrato(erro, etapa)
    console.error('[contratos/etapa]', { etapa, duracao_ms: Date.now() - inicio, status: resultado.status, tipo: erro instanceof Error ? erro.name : 'desconhecido' })
    return NextResponse.json({ error: resultado.error }, { status: resultado.status })
  } finally {
    clearTimeout(timer)
  }
}
