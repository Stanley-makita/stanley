import { substituirVariaveis } from '@/lib/comunicacao/substituirVariaveis'
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

// Envia a mesma mensagem-base pra vários destinatários, um de cada vez -- sequencial de
// propósito (não Promise.all/endpoint de lote): progresso previsível, sem disparar N
// requisições simultâneas contra a Uazapi. Cada destinatário resolve seu próprio placeholder
// (comprador_nome = nome daquele interessado específico) e gera seu próprio envio_id/histórico
// via a rota — esta função só orquestra o loop e coleta o resultado individual de cada um.
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
    const textoResolvido = substituirVariaveis(texto, { comprador_nome: alvo.nome }).trim()
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
          texto:             textoResolvido,
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
