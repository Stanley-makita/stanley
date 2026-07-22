import { createHmac, timingSafeEqual } from 'crypto'

// Mecanismo de autenticidade documentado pela ClickSign (API v3, "Segurança de
// Webhooks"): o header `Content-Hmac` traz `sha256=<hash>`, onde <hash> é um
// HMAC-SHA256 verdadeiro — chave = secret, mensagem = corpo bruto da
// requisição (a própria página de segurança linka a documentação da classe
// `crypto.Hmac` do Node.js como exemplo de implementação, não uma simples
// concatenação de string). CORRIGIDO em produção: a primeira versão desta
// função usava SHA256(corpo + secret) — uma leitura equivocada de "soma do
// Body com o Secret" como concatenação — e por isso rejeitava 100% dos
// eventos reais da ClickSign (confirmado com um evento real em produção
// antes desta correção). O corpo usado no cálculo é o texto bruto exatamente
// como recebido, NUNCA o resultado de um JSON.stringify(JSON.parse(...))
// (reformatação muda o hash).

const PREFIXO_HEADER = 'sha256='

export type ResultadoVerificacaoHmac =
  | { valido: true }
  | { valido: false; motivo: 'header_ausente' | 'formato_invalido' | 'hash_nao_confere' }

export function verificarAssinaturaWebhook(
  rawBody: string,
  headerContentHmac: string | null,
  secret: string,
): ResultadoVerificacaoHmac {
  if (!headerContentHmac) {
    return { valido: false, motivo: 'header_ausente' }
  }

  if (!headerContentHmac.startsWith(PREFIXO_HEADER)) {
    return { valido: false, motivo: 'formato_invalido' }
  }

  const hashRecebido = headerContentHmac.slice(PREFIXO_HEADER.length).trim()
  const hashCalculado = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')

  const bufRecebido = Buffer.from(hashRecebido, 'hex')
  const bufCalculado = Buffer.from(hashCalculado, 'hex')

  // timingSafeEqual exige buffers do mesmo tamanho — hash recebido malformado
  // (tamanho errado) não pode ser comparado com segurança, então é inválido
  // diretamente, sem lançar exceção.
  if (bufRecebido.length !== bufCalculado.length) {
    return { valido: false, motivo: 'formato_invalido' }
  }

  if (!timingSafeEqual(bufRecebido, bufCalculado)) {
    return { valido: false, motivo: 'hash_nao_confere' }
  }

  return { valido: true }
}
