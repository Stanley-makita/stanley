// Entrada e FGTS na confirmação de valores (e-mail dos 5 bancos + página /confirmar/[token]).
// Sem dependência de servidor: a página do cliente (client component) importa daqui.

function fmtMoeda(v: number | null | undefined): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

/**
 * Recursos próprios do cliente: o valor do negócio (Dados do Negócio) quando houver;
 * senão entrada − FGTS. Sem FGTS, é a própria entrada.
 */
export function calcularRecursosProprios(p: {
  recursosProprios: number | null | undefined
  entrada: number | null | undefined
  fgts: number | null | undefined
}): number | null {
  if (p.recursosProprios != null) return p.recursosProprios
  if (p.entrada == null) return null
  return Math.round((p.entrada - (p.fgts ?? 0)) * 100) / 100
}

/**
 * Linhas "Entrada" e "FGTS" da tabela. Decisão da equipe (11/11/2026): o cliente leigo lia a
 * entrada total (recursos próprios + FGTS) e o FGTS logo abaixo como se fosse dinheiro a mais.
 * Agora a entrada mostra só os recursos próprios e o FGTS aparece à parte, só quando houver.
 * Confirmações enviadas antes (sem `recursos_proprios` no dados_json) continuam como foram enviadas.
 */
export function linhasEntradaFgts(d: {
  entrada?: number | null
  fgts?: number | null
  recursos_proprios?: number | null
}): [string, string][] {
  if (!('recursos_proprios' in d)) {
    return [['Entrada', fmtMoeda(d.entrada)], ['FGTS', fmtMoeda(d.fgts)]]
  }
  const linhas: [string, string][] = [['Entrada (recursos próprios)', fmtMoeda(d.recursos_proprios)]]
  if (d.fgts) linhas.push(['FGTS', fmtMoeda(d.fgts)])
  return linhas
}
