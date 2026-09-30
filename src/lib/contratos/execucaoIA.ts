// A rota tem 120s. Reserva tempo para autenticação, consultas, validação e resposta.
// Sem retries automáticos do SDK: duas tentativas podem ultrapassar o teto da rota.
export const OPCOES_IA_CONTRATO = { timeout: 75_000, maxRetries: 0 } as const

export function mensagemErroContrato(erro: unknown, etapa: string): { error: string; status: number } {
  const nome = erro instanceof Error ? erro.name : ''
  if (nome === 'ValidacaoContratoError' && erro instanceof Error) {
    return { status: 422, error: erro.message }
  }
  if (/timeout|abort/i.test(nome)) {
    return { status: 504, error: `O tempo de espera para ${etapa} foi excedido. Tente novamente; a minuta anterior foi preservada.` }
  }
  // Não expor mensagens do provedor (podem conter dados da requisição).
  return { status: 500, error: `Não foi possível ${etapa}. Tente novamente; a minuta anterior foi preservada.` }
}
