// Decide o que fazer com uma mensagem de USUÁRIO INTERNO (comercial) no webhook do
// WhatsApp, antes das pendências de workflow (*simula/*custas/*consorcio) e do portão
// de conversa "humano".
//
// Incidentes reais (2026-09-25, na frente da equipe):
// - com um *simula pendente aberto, todo PDF do comercial caía em processarRespostaPendente
//   com texto vazio e era descartado sem erro — mesmo depois de *inicio;
// - sem *inicio, o PDF era descartado, ou (conversa do operador em 'humano') gravado na
//   pessoa achada pelo telefone dele — um cliente qualquer. *salva fulano não achava nada.
//
// Regras:
// - Arquivo de comercial → sempre salva na sessão de documentos (garantirSessaoMidiaOperador
//   abre uma se não houver *inicio). Tem prioridade sobre pendência e sobre o status
//   'humano' da conversa do próprio operador.
// - Mídia sem arquivo (download falhou) e sem legenda nunca é resposta de pendência.
// - O resto (texto) segue o fluxo de sempre. A legenda de um arquivo também segue, depois
//   de o arquivo ter sido salvo (o webhook zera fileUrl pra não salvar duas vezes).
export type RotaMidiaOperador = 'salvar_na_sessao' | 'ignorar_pendencias' | 'fluxo_normal'

export function rotearMidiaOperador(p: {
  isMidia: boolean
  temArquivo: boolean
  texto: string
}): RotaMidiaOperador {
  if (!p.isMidia) return 'fluxo_normal'
  if (p.temArquivo) return 'salvar_na_sessao'
  if (!p.texto.trim()) return 'ignorar_pendencias'
  return 'fluxo_normal'
}
