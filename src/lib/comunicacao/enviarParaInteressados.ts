import { type Interessado, type ResultadoEnvio } from '@/types/comunicacao'

export function chaveInteressado(i: Interessado): string {
  return `${i.tipo_interessado}:${i.interessado_id}`
}

interface EnviarParaInteressadosParams {
  /** Rota de envio do contexto (Lead ou Processo) — ex: `/api/leads/${id}/atualizar-cliente`. */
  endpoint: string
  interessados: Interessado[]
  /** Corpo bruto da mensagem, com placeholders ainda não substituídos (ex: `{{comprador_nome}}`). */
  texto: string
  accessToken: string | undefined
}

// Envia a mesma mensagem-base (ainda com os placeholders {{...}} intactos) pra vários
// destinatários, um de cada vez -- sequencial de propósito (não Promise.all/endpoint de lote):
// progresso previsível, sem disparar N requisições simultâneas contra a Uazapi. A substituição
// de variáveis roda inteiramente no servidor (ver substituirVariaveis em cada rota
// atualizar-cliente) — só lá dá pra resolver fase_atual/responsavel_nome com dado autoritativo
// (o client não tem acesso à fase do Negócio nem precisa: o servidor já busca usuário e
// destinatário do banco de qualquer forma). Esta função só orquestra o loop e coleta o
// resultado individual de cada um.
//
// Extraída do componente de UI de propósito: qualquer reuso futuro fora de um modal React (ex:
// ação em lote a partir de uma tela de lista, ou uma automação) só precisa chamar esta função,
// sem duplicar o loop de envio.
export async function enviarParaInteressados({
  endpoint,
  interessados,
  texto,
  accessToken,
}: EnviarParaInteressadosParams): Promise<ResultadoEnvio[]> {
  const resultados: ResultadoEnvio[] = []

  for (const alvo of interessados) {
    const envio_id = crypto.randomUUID()

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          tipo_interessado: alvo.tipo_interessado,
          interessado_id:   alvo.interessado_id,
          texto,
          envio_id,
        }),
      })
      const body = await res.json()
      resultados.push({
        chave: chaveInteressado(alvo),
        tipo:  alvo.tipo_interessado,
        nome:  alvo.nome,
        ok:    res.ok,
        erro:  res.ok ? undefined : (body?.error ?? 'Falha ao enviar mensagem.'),
      })
    } catch (err) {
      resultados.push({
        chave: chaveInteressado(alvo),
        tipo:  alvo.tipo_interessado,
        nome:  alvo.nome,
        ok:    false,
        erro:  err instanceof Error ? err.message : 'Falha ao enviar mensagem.',
      })
    }
  }

  return resultados
}
