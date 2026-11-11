// Aviso de negócio parado na fase (pedido da equipe, 11/11/2026). Regra por fase em
// Configurações > Fases (`fases.alerta_parado_dias`); o cron /api/processos/alerta-parados
// roda 1x/dia e usa esta decisão. Avisa 1x quando passa do prazo e lembra a cada 5 dias
// enquanto o negócio continuar na mesma fase.

export const INTERVALO_LEMBRETE_DIAS = 5

const DIA_MS = 86_400_000

export function diasCompletos(desdeIso: string, agora: Date): number {
  return Math.floor((agora.getTime() - new Date(desdeIso).getTime()) / DIA_MS)
}

export function decidirAvisoParado(p: {
  limiteDias: number | null | undefined
  /** Quando o negócio entrou na fase atual. */
  entrouEm: string
  faseAtualId: string
  ultimoAviso: { faseId: string; avisadoEm: string } | null
  agora: Date
}): 'primeiro' | 'lembrete' | null {
  if (!p.limiteDias || p.limiteDias <= 0) return null
  // "Parado há MAIS de X dias": com X = 5, avisa a partir do 6º dia.
  if (diasCompletos(p.entrouEm, p.agora) <= p.limiteDias) return null

  const aviso = p.ultimoAviso
  const avisoDestaPassagem =
    aviso && aviso.faseId === p.faseAtualId && new Date(aviso.avisadoEm).getTime() >= new Date(p.entrouEm).getTime()
  if (!avisoDestaPassagem) return 'primeiro'

  return diasCompletos(aviso.avisadoEm, p.agora) >= INTERVALO_LEMBRETE_DIAS ? 'lembrete' : null
}
