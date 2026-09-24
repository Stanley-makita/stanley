'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useCatalogoPastasProcesso } from '@/hooks/documentos/useCatalogoPastasProcesso'

interface DocParaOrganizar {
  id: string
  nome_original: string
  nome_exibicao: string | null
  storage_path: string
  mime_type: string | null
}

interface Props {
  leadId: string
  documentos: DocParaOrganizar[]
  onFechar: () => void
  onConcluido: () => void
}

const LABEL_TIPO: Record<string, string> = {
  rg: 'RG', cnh: 'CNH', cpf: 'CPF', comprovante_endereco: 'Comprovante de endereço',
  comprovante_renda: 'Comprovante de renda', extrato_fgts: 'Extrato FGTS', extrato_bancario: 'Extrato bancário',
  certidao_casamento: 'Certidão de casamento', certidao_nascimento: 'Certidão de nascimento', outro: 'Outro',
}

type Linha = { tipo: string | null; motivo?: string; pastaCodigo: string }

// Tamanho do lote de classificação: precisa bater com CONCORRENCIA da rota
// /classificar (route.ts) — a rota já processa os ids do request em
// sub-lotes sequenciais de CONCORRENCIA=4 (cada chamada à IA pode levar até
// ~45s, sob maxDuration=60 da function). Se mandássemos mais que 4 ids por
// request, a rota faria 2+ sub-lotes sequenciais numa única invocação e
// poderia estourar o limite de 60s da Vercel.
const TAMANHO_LOTE_CLASSIFICAR = 4

async function token() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
}

export function OrganizarArquivosModal({ leadId, documentos, onFechar, onConcluido }: Props) {
  const { data: catalogoPastas = [] } = useCatalogoPastasProcesso()
  const [classificando, setClassificando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [linhas, setLinhas] = useState<Record<string, Linha>>({})
  const [miniaturas, setMiniaturas] = useState<Record<string, string>>({})

  // Congela a lista de documentos no momento em que o modal abre. O pai
  // recalcula `documentos` a cada refetch em segundo plano (foco na janela,
  // polling enquanto o OCR está 'processando'), e usar a prop diretamente
  // nas deps do efeito reiniciaria a classificação e apagaria as pastas já
  // escolhidas pelo operador (mesmo anti-padrão do CLAUDE.md: "Formulário de
  // edição não pode resetar por refetch em segundo plano").
  const [docsModal] = useState(() => documentos)

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const paths = docsModal.map(d => d.storage_path)
      const { data: urls } = await supabase.storage.from('documentos-clientes').createSignedUrls(paths, 3600)
      if (!cancelado && urls) {
        const m: Record<string, string> = {}
        urls.forEach((u, i) => { if (u.signedUrl) m[docsModal[i].id] = u.signedUrl })
        setMiniaturas(m)
      }

      // Classifica em lotes de TAMANHO_LOTE_CLASSIFICAR ids por request, em
      // sequência, mesclando os itens de cada lote no estado conforme chegam.
      // Se um lote falhar, mostra um único toast de erro e mantém os itens
      // dos lotes que deram certo (os documentos do lote com falha ficam sem
      // sugestão em vez de travar o modal inteiro).
      const authToken = await token()
      let algumLoteFalhou = false
      for (let i = 0; i < docsModal.length; i += TAMANHO_LOTE_CLASSIFICAR) {
        if (cancelado) return
        const lote = docsModal.slice(i, i + TAMANHO_LOTE_CLASSIFICAR)
        try {
          const res = await fetch(`/api/leads/${leadId}/organizar-documentos/classificar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ documento_ids: lote.map(d => d.id) }),
          })
          const json = await res.json()
          if (!res.ok) throw new Error(json.error ?? 'Erro ao identificar os arquivos.')
          if (cancelado) return
          const l: Record<string, Linha> = {}
          for (const it of json.itens as { documento_id: string; tipo: string | null; pasta_sugerida_codigo: string | null; motivo?: string }[]) {
            l[it.documento_id] = { tipo: it.tipo, motivo: it.motivo, pastaCodigo: it.pasta_sugerida_codigo ?? '' }
          }
          setLinhas(prev => ({ ...prev, ...l }))
        } catch {
          algumLoteFalhou = true
        }
      }
      if (algumLoteFalhou && !cancelado) {
        toast.error('Não foi possível identificar alguns arquivos.')
      }
      if (!cancelado) setClassificando(false)
    })()
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- docsModal é congelado na abertura de propósito (ver comentário acima); não deve disparar o efeito de novo
  }, [leadId])

  async function confirmar() {
    const itens = docsModal
      .map(d => ({ documento_id: d.id, codigo: linhas[d.id]?.pastaCodigo ?? '' }))
      .filter(i => i.codigo)
      .map(i => ({ documento_id: i.documento_id, pasta_id: catalogoPastas.find(p => p.codigo === i.codigo)?.id ?? null }))
      .filter(i => i.pasta_id)
    if (itens.length === 0) { onFechar(); return }
    setSalvando(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/organizar-documentos/aplicar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ itens }),
      })
      // res.json() pode falhar (erro de rede já lançou antes, ou 5xx sem corpo JSON).
      const json = await res.json().catch(() => null) as { error?: string } | null
      if (!res.ok) {
        toast.error(json?.error ?? 'Erro ao organizar.')
        // Pode ter havido gravação parcial no servidor (alguns vínculos
        // atualizados antes do erro) — recarrega a lista real em vez de
        // deixar a tela mostrar um estado que já não é verdade.
        onConcluido()
        return
      }
      toast.success(`${itens.length} arquivo${itens.length !== 1 ? 's' : ''} organizado${itens.length !== 1 ? 's' : ''}.`)
      onConcluido()
    } catch {
      // Erro de rede — mesma lógica: pode ter havido gravação parcial.
      toast.error('Erro ao organizar.')
      onConcluido()
    } finally {
      setSalvando(false)
    }
  }

  function descricaoTipo(l: Linha | undefined) {
    if (!l) return '—'
    if (l.motivo === 'nao_suportado') return 'Formato não suportado'
    if (l.motivo === 'erro') return 'Não identificado'
    return LABEL_TIPO[l.tipo ?? ''] ?? l.tipo ?? '—'
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !salvando) onFechar() }}>
      <DialogContent className="flex max-h-[92svh] w-[calc(100vw-1rem)] max-w-3xl flex-col overflow-hidden p-0 sm:w-full">
        <div className="shrink-0 border-b border-gray-100 px-4 pb-4 pt-5 sm:px-6">
          <h2 className="text-base font-semibold text-fonti-primary">Organizar arquivos</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Confira a pasta sugerida de cada arquivo. Nada é movido até você confirmar.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6">
          {classificando && (
            <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Identificando {docsModal.length} arquivo{docsModal.length !== 1 ? 's' : ''}…
            </div>
          )}
          {!classificando && docsModal.map(d => {
            const l = linhas[d.id]
            const url = miniaturas[d.id]
            const ehImagem = (d.mime_type ?? '').startsWith('image/')
            return (
              <div key={d.id} className="flex flex-col gap-2 border-b border-gray-50 py-3 sm:flex-row sm:items-center">
                <a href={url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
                  {ehImagem && url
                    ? <img src={url} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-gray-100 object-cover" />
                    : <FileText className="h-12 w-12 shrink-0 rounded-lg border border-gray-100 p-3 text-gray-300" />}
                  <div className="min-w-0">
                    <p className="truncate text-sm text-gray-800">{d.nome_exibicao ?? d.nome_original}</p>
                    <p className="text-xs text-gray-400">{descricaoTipo(l)}</p>
                  </div>
                </a>
                <Select
                  value={l?.pastaCodigo || '__nenhuma__'}
                  onValueChange={(v) => setLinhas(prev => ({ ...prev, [d.id]: { ...(prev[d.id] ?? { tipo: null }), pastaCodigo: v === '__nenhuma__' ? '' : v } }))}
                  disabled={salvando}
                >
                  <SelectTrigger className="h-8 w-full text-xs sm:w-56"><SelectValue placeholder="Pasta" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__nenhuma__" className="text-xs">Deixar sem pasta</SelectItem>
                    {catalogoPastas.map(p => <SelectItem key={p.codigo} value={p.codigo} className="text-xs">{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )
          })}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-gray-100 px-4 py-3 sm:flex-row sm:justify-end sm:px-6">
          <Button variant="outline" size="sm" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button size="sm" onClick={confirmar} disabled={classificando || salvando} className="bg-fonti-primary text-white hover:bg-fonti-primary-hover">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
