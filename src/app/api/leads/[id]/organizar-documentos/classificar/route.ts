import { NextRequest, NextResponse } from 'next/server'
import {
  resolverUsuarioELead, carregarDocumentosDoLead,
  carregarVendedoresDoLead, carregarPastaSugeridaPorTipo,
} from '@/lib/documentos/contextoLeadServidor'
import { classificarDocumentoPorId } from '@/lib/documentos/ocr'
import { filtrarDocumentosDoLead } from '@/lib/documentos/organizarPastas'
import { inferirPastaSugerida } from '@/lib/documentos'

export const maxDuration = 60

const CONCORRENCIA = 4
// maxDuration=60 + timeout de 45s por chamada de IA: mais que 4 documentos
// por requisição arrisca estourar o limite da função. O modal já manda em
// lotes de 4 (ver OrganizarArquivosModal.tsx), então isto é só uma trava de
// segurança contra um chamador que mande mais.
const MAX_DOCUMENTOS_POR_REQUISICAO = 4

/** "Organizar arquivos" passo 1: classifica (Haiku) e sugere pasta. Não grava pasta. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolverUsuarioELead(request, params.id)
  if (ctx instanceof NextResponse) return ctx
  const { usuario, lead } = ctx

  const body = await request.json().catch(() => ({})) as { documento_ids?: string[] }
  const pedidos = (Array.isArray(body.documento_ids) ? body.documento_ids : []).slice(0, MAX_DOCUMENTOS_POR_REQUISICAO)

  const [{ docs }, vendedores, pastaPorTipo] = await Promise.all([
    carregarDocumentosDoLead(lead.id, lead.pessoa_id, usuario.empresa_id),
    carregarVendedoresDoLead(lead.id),
    carregarPastaSugeridaPorTipo(),
  ])
  const alvo = filtrarDocumentosDoLead(pedidos, docs)
  const ordem = new Map(pedidos.map((id, i) => [id, i]))
  alvo.sort((a, b) => (ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0))

  const itens: { documento_id: string; tipo: string | null; pasta_sugerida_codigo: string | null; motivo?: 'nao_suportado' | 'erro' }[] = []
  for (let i = 0; i < alvo.length; i += CONCORRENCIA) {
    const lote = alvo.slice(i, i + CONCORRENCIA)
    const resultados = await Promise.all(lote.map(d => classificarDocumentoPorId(d.id, usuario.empresa_id)))
    lote.forEach((d, j) => {
      const r = resultados[j]
      const sugestao = r.tipo
        ? inferirPastaSugerida({
            documentoPessoaId: d.pessoa_id,
            pastaSugeridaCodigoDoTipo: pastaPorTipo.get(r.tipo) ?? null,
            pessoasCompradorasIds: [],
            pessoasVendedorasIds: vendedores,
          })
        : null
      itens.push({
        documento_id: d.id,
        tipo: r.tipo,
        pasta_sugerida_codigo: sugestao,
        ...(r.motivo ? { motivo: r.motivo } : {}),
      })
    })
  }

  return NextResponse.json({ itens })
}
