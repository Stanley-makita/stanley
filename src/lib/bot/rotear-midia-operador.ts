// Decide o que fazer com uma mensagem de USUÁRIO INTERNO (comercial) no webhook do
// WhatsApp, antes das pendências de workflow (*simula/*custas/*consorcio) e do portão
// de conversa "humano".
//
// Incidente real (2026-09-25): com um *simula pendente aberto, todo PDF que o comercial
// mandava caía em processarRespostaPendente com texto vazio — o arquivo era descartado
// sem erro nem resposta (e ainda renovava a validade da pendência). Mesmo depois de um
// *inicio, porque a pendência era checada antes da sessão. Resultado: *salva respondia
// "nenhum documento encontrado" na frente da equipe.
//
// Regras:
// - Sessão *fonti inicio aberta + arquivo baixado → sempre salva na sessão. A sessão é o
//   sinal explícito de "documentos do cliente vêm a seguir" e tem prioridade sobre
//   pendência e sobre o status 'humano' da conversa do próprio operador (que o fluxo de
//   documentos grava como âncora técnica, não é atendimento humano de verdade).
// - Mídia sem legenda nunca é resposta de pendência: não tem dado nenhum pro parser.
// - O resto (texto, ou mídia com legenda sem sessão) segue o fluxo de sempre.
export type RotaMidiaOperador = 'salvar_na_sessao' | 'ignorar_pendencias' | 'fluxo_normal'

export function rotearMidiaOperador(p: {
  isMidia: boolean
  temArquivo: boolean
  texto: string
  temSessaoFonti: boolean
}): RotaMidiaOperador {
  if (!p.isMidia) return 'fluxo_normal'
  if (p.temArquivo && p.temSessaoFonti) return 'salvar_na_sessao'
  if (!p.texto.trim()) return 'ignorar_pendencias'
  return 'fluxo_normal'
}
