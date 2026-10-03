import { tipoLanceDaCota, LABEL_TIPO_LANCE } from '@/types/consorcio'

// Exportação de Negócios › Consórcio (pedido 03/10/2026): uma linha por cota válida (ativa/contemplada)
// com grupo, cota, cliente, CPF e tipo de lance (o da cota; sem ele, o padrão do negócio).
// Negócio sem cota válida sai numa linha com o grupo/cota de "Dados da Carta".
type CotaExport = { grupo?: string | null; cota?: string | null; tipo_lance?: string | null; status_cota?: string | null }
type NegocioExport = {
  grupo_consorcio?: string | null
  cota_consorcio?: string | null
  tipo_lance?: string | null
  cotas?: CotaExport[] | null
  compradores?: { nome?: string | null; cpf?: string | null; principal?: boolean }[] | null
}

function formatarCpf(v: string | null | undefined): string {
  const d = (v ?? '').replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (v ?? '')
}

const limpar = (v: string | null | undefined) => (v ?? '').trim()  // tira tab/espaço colado junto do número

export function linhasExportacaoConsorcio(negocios: NegocioExport[]): Record<string, string>[] {
  const linhas: Record<string, string>[] = []
  for (const n of negocios) {
    const cliente = n.compradores?.find(c => c.principal) ?? n.compradores?.[0] ?? null
    const base = { Cliente: cliente?.nome ?? '', CPF: formatarCpf(cliente?.cpf) }
    const validas = (n.cotas ?? []).filter(c => c.status_cota !== 'cancelado' && c.status_cota !== 'substituido')
    const cotas: CotaExport[] = validas.length > 0 ? validas : [{ grupo: n.grupo_consorcio, cota: n.cota_consorcio, tipo_lance: null }]
    for (const c of cotas) {
      const lance = tipoLanceDaCota(c, n)
      linhas.push({
        Grupo: limpar(c.grupo),
        Cota: limpar(c.cota),
        ...base,
        'Tipo de lance': lance ? LABEL_TIPO_LANCE[lance] : '',
      })
    }
  }
  return linhas
}
