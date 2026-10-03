// A chamada à IA (Anthropic) falhou — sem crédito, fora do ar, tempo esgotado. Diferente de "o texto
// não tem esse dado": o bot precisa dizer isso claramente em vez de culpar o texto do comercial
// (caso real 02/10/2026: créditos esgotados → "*cria cliente" respondia "não consegui identificar o nome").
// Módulo sem dependências de propósito: testes que fazem mock do parser continuam reconhecendo o erro.
export class IaIndisponivelError extends Error {
  constructor(causa: unknown) {
    super(`IA indisponível: ${causa instanceof Error ? causa.message : String(causa)}`)
    this.name = 'IaIndisponivelError'
  }
}

export function ehIaIndisponivel(err: unknown): boolean {
  return err instanceof Error && err.name === 'IaIndisponivelError'
}

export const MSG_IA_INDISPONIVEL =
  '⚠️ A leitura automática de texto está indisponível agora (problema no serviço de IA, não no seu texto).\n\n' +
  'Avise o administrador do Fonti. Assim que voltar, envie a mesma mensagem de novo.'
