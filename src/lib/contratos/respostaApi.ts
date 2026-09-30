/** A hospedagem pode devolver texto/HTML em um 504, antes de a rota responder. */
export async function lerRespostaContrato<T>(resposta: Response, etapa: string): Promise<T> {
  const texto = await resposta.text()
  let dados: unknown
  try { dados = JSON.parse(texto) } catch { dados = null }
  if (!resposta.ok) {
    if (resposta.status === 504 || resposta.status === 408) {
      throw new Error(`O tempo de espera para ${etapa} foi excedido. Suas instruções foram mantidas; tente novamente.`)
    }
    if (resposta.status === 401) throw new Error('Sua sessão expirou. Entre novamente para continuar.')
    if (resposta.status === 403) throw new Error('Sua conta não tem acesso a esta operação. Consulte o administrador.')
    const mensagem = dados && typeof dados === 'object' && 'error' in dados ? dados.error : null
    throw new Error(typeof mensagem === 'string' ? mensagem : `Não foi possível ${etapa} (HTTP ${resposta.status}). Tente novamente.`)
  }
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new Error(`O servidor devolveu uma resposta inválida ao ${etapa}. Tente novamente.`)
  }
  return dados as T
}
