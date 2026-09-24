# Pastas de documentos na Captação + "Organizar arquivos" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aba Documentos da Captação ganha a grade de pastas de Negócios, uma pasta virtual "Sem pasta" e o botão "Organizar arquivos" (IA sugere, operador confirma); a pasta escolhida no lead vira a primeira sugestão ao converter em negócio.

**Architecture:** A pasta do documento no lead mora em `documento_vinculos.pasta_id` do vínculo `entidade_tipo='lead'` (mesmo modelo de Negócios). Duas rotas novas de servidor (service role) — `classificar` (roda só a fase 1 do OCR, Haiku) e `aplicar` (upsert do vínculo com a pasta) — com a lógica de decisão em funções puras testáveis em `src/lib/documentos/organizarPastas.ts`. `AbaDocumentos` passa a tratar `lead` como contexto com pastas; um modal novo faz a revisão.

**Tech Stack:** Next.js 14 (App Router, route handlers), Supabase (supabase-js, service role), TanStack Query, `@anthropic-ai/sdk` (Haiku 4.5), Vitest, Tailwind + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-09-24-pastas-documentos-captacao-design.md`

## Global Constraints

- Mesmas 13 posições de Negócios (`catalogo_pastas_processo` + atalhos 04 Formulários / 13 Simulações); nada de catálogo novo.
- IA só roda quando o operador clica em "Organizar arquivos" — nunca no webhook do WhatsApp.
- Nada muda de pasta sem o operador confirmar na lista de revisão.
- Modelo de classificação: o mesmo `MODELO_CLASSIFICACAO` (`claude-haiku-4-5-20251001`) já usado em `src/lib/documentos/ocr.ts`, `max_tokens: 120`, timeout 45s.
- Nunca alterar `documentos.pessoa_id` ao organizar (invariante 2 do CLAUDE.md: dono do documento é a Pessoa).
- Sem migration: usa `documento_vinculos.pasta_id` e `documentos.classificacao_legado` existentes.
- Todo UPDATE de servidor confere linhas afetadas (`.select('...')`) — CLAUDE.md "UPDATE bloqueado pela RLS não gera erro".
- Toda chamada externa com timeout explícito (CLAUDE.md "Timeout obrigatório").
- Tipo `'outro'` resultante da classificação é gravado como `'outro'` (não `null`) pelo fluxo de organizar, para não pagar a IA de novo.

## Review Focus

- **Documento da Pessoa sem vínculo com o lead** (chegou por `*salva`/WhatsApp e só aparece pela `pessoa_id`) — organizar deve CRIAR o vínculo com a pasta, não falhar em silêncio. Teste na Task 1 (`planejarGravacaoPastas`) e Task 4.
- **Documento de outro lead/empresa enviado no payload** (id adulterado) — servidor ignora. Teste na Task 3 (`filtrarDocumentosDoLead`).
- **Arquivo não suportado** (áudio `audio/ogg`, figurinha `image/webp` animada funciona como imagem, vídeo `video/mp4`) — sem chamada à IA, volta sem sugestão. Teste na Task 2 (`classificarDocumentoPorId` com mime de áudio).
- **IA devolve JSON inválido ou dá timeout em um arquivo** — só aquela linha fica sem sugestão. Teste na Task 2.
- **Clique repetido em "Organizar"** — arquivo com tipo já conhecido (inclusive `'outro'`) não chama a IA de novo. Teste na Task 1 (`precisaClassificar`) e Task 2.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/documentos.ts` (modificar) | `inferirPastaSugerida` ganha `pastaDoLeadCodigo` (prioridade 0) |
| `src/lib/documentos/organizarPastas.ts` (criar) | Funções puras: `precisaClassificar`, `tipoPermitePularClassificacao`, `planejarGravacaoPastas`, `filtrarDocumentosDoLead` |
| `src/lib/documentos/ocr.ts` (modificar) | Extrai `classificarTipoDocumento`/`classificarDocumentoPorId`; `processarOcrDocumento` pula fase 1 com tipo conhecido e preenche pasta de vínculo de lead sem pasta |
| `src/lib/documentos/contextoLeadServidor.ts` (criar) | `resolverUsuarioELead(request, leadId)` + `carregarDocumentosDoLead` para as rotas |
| `src/app/api/leads/[id]/organizar-documentos/classificar/route.ts` (criar) | Rota classificar |
| `src/app/api/leads/[id]/organizar-documentos/aplicar/route.ts` (criar) | Rota aplicar (também usada pelo "mover de pasta" manual no lead) |
| `src/components/documentos/OrganizarArquivosModal.tsx` (criar) | Modal de revisão |
| `src/components/documentos/AbaDocumentos.tsx` (modificar) | Grade de pastas + "Sem pasta" + upload com pasta + mover, também para `lead` |
| `src/components/leads/LeadDetalheModal.tsx` (modificar) | Passa `onNavegarParaAba` pro atalho 04/13 |
| `src/components/leads/NovoProcessoModal.tsx` (modificar) | Pasta do vínculo com o lead como 1ª sugestão |

---

### Task 1: Regras puras (pasta do lead + decisões de classificação e gravação)

**Files:**
- Modify: `src/lib/documentos.ts:121-135`
- Create: `src/lib/documentos/organizarPastas.ts`
- Test: `src/lib/documentos/__tests__/organizarPastas.test.ts`

**Interfaces:**
- Produces:
  - `inferirPastaSugerida(input: { documentoPessoaId: string | null; pastaSugeridaCodigoDoTipo: string | null; pessoasCompradorasIds: string[]; pessoasVendedorasIds: string[]; pastaDoLeadCodigo?: string | null }): string | null`
  - `TIPOS_CLASSIFICACAO: ReadonlySet<string>` (rg, cnh, cpf, comprovante_endereco, comprovante_renda, extrato_fgts, extrato_bancario, certidao_casamento, certidao_nascimento, outro)
  - `precisaClassificar(classificacao: string | null | undefined): boolean`
  - `tipoPermitePularClassificacao(classificacao: string | null | undefined): boolean`
  - `planejarGravacaoPastas(itens: { documento_id: string; pasta_id: string | null }[], idsComVinculoLead: Set<string>): { atualizar: { documento_id: string; pasta_id: string | null }[]; criar: { documento_id: string; pasta_id: string }[] }`
  - `filtrarDocumentosDoLead<T extends { id: string }>(pedidos: string[], permitidos: T[]): T[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/documentos/__tests__/organizarPastas.test.ts
import { describe, it, expect } from 'vitest'
import { inferirPastaSugerida } from '@/lib/documentos'
import {
  precisaClassificar, tipoPermitePularClassificacao,
  planejarGravacaoPastas, filtrarDocumentosDoLead,
} from '../organizarPastas'

describe('inferirPastaSugerida com pastaDoLeadCodigo', () => {
  it('pasta escolhida no lead vence papel e tipo', () => {
    expect(inferirPastaSugerida({
      documentoPessoaId: 'p1', pastaSugeridaCodigoDoTipo: 'comprador',
      pessoasCompradorasIds: ['p1'], pessoasVendedorasIds: [],
      pastaDoLeadCodigo: 'extra',
    })).toBe('extra')
  })
  it('sem pasta do lead, mantém a regra antiga (papel > tipo)', () => {
    expect(inferirPastaSugerida({
      documentoPessoaId: 'v1', pastaSugeridaCodigoDoTipo: 'comprador',
      pessoasCompradorasIds: [], pessoasVendedorasIds: ['v1'], pastaDoLeadCodigo: null,
    })).toBe('vendedor')
  })
})

describe('precisaClassificar', () => {
  it('nulo, vazio e auto precisam', () => {
    expect(precisaClassificar(null)).toBe(true)
    expect(precisaClassificar('')).toBe(true)
    expect(precisaClassificar('auto')).toBe(true)
  })
  it('tipo já conhecido (inclusive outro) não chama a IA de novo', () => {
    expect(precisaClassificar('rg')).toBe(false)
    expect(precisaClassificar('outro')).toBe(false)
    expect(precisaClassificar('matricula')).toBe(false)
  })
})

describe('tipoPermitePularClassificacao (Extrair dados)', () => {
  it('pula só com tipo que a classificação reconhece e não é outro', () => {
    expect(tipoPermitePularClassificacao('cnh')).toBe(true)
    expect(tipoPermitePularClassificacao('extrato_bancario')).toBe(true)
    expect(tipoPermitePularClassificacao('outro')).toBe(false)
    expect(tipoPermitePularClassificacao('auto')).toBe(false)
    expect(tipoPermitePularClassificacao('matricula')).toBe(false)
    expect(tipoPermitePularClassificacao(null)).toBe(false)
  })
})

describe('planejarGravacaoPastas', () => {
  it('atualiza quem já tem vínculo com o lead e cria vínculo pra doc só da Pessoa', () => {
    const r = planejarGravacaoPastas(
      [{ documento_id: 'd1', pasta_id: 'pA' }, { documento_id: 'd2', pasta_id: 'pB' }],
      new Set(['d1']),
    )
    expect(r.atualizar).toEqual([{ documento_id: 'd1', pasta_id: 'pA' }])
    expect(r.criar).toEqual([{ documento_id: 'd2', pasta_id: 'pB' }])
  })
  it('doc só da Pessoa com pasta nula não cria vínculo vazio', () => {
    const r = planejarGravacaoPastas([{ documento_id: 'd2', pasta_id: null }], new Set())
    expect(r.criar).toEqual([])
    expect(r.atualizar).toEqual([])
  })
  it('doc com vínculo pode voltar pra Sem pasta (pasta nula)', () => {
    const r = planejarGravacaoPastas([{ documento_id: 'd1', pasta_id: null }], new Set(['d1']))
    expect(r.atualizar).toEqual([{ documento_id: 'd1', pasta_id: null }])
  })
})

describe('filtrarDocumentosDoLead', () => {
  it('ignora id que não pertence ao lead (payload adulterado)', () => {
    const permitidos = [{ id: 'd1' }, { id: 'd2' }]
    expect(filtrarDocumentosDoLead(['d1', 'x-de-outro-lead'], permitidos)).toEqual([{ id: 'd1' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/documentos/__tests__/organizarPastas.test.ts --exclude ".claude/**" --exclude "output/**"`
Expected: FAIL — `Cannot find module '../organizarPastas'`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/documentos.ts`, replace the whole `inferirPastaSugerida` function (lines 121-135) with:

```ts
export function inferirPastaSugerida(input: {
  documentoPessoaId: string | null
  pastaSugeridaCodigoDoTipo: string | null
  pessoasCompradorasIds: string[]
  pessoasVendedorasIds: string[]
  /** Pasta já escolhida pelo operador na Captação (vínculo com o lead de origem).
   * Prioridade máxima: é uma decisão humana, vale mais que papel ou tipo. */
  pastaDoLeadCodigo?: string | null
}): string | null {
  const { documentoPessoaId, pastaSugeridaCodigoDoTipo, pessoasCompradorasIds, pessoasVendedorasIds, pastaDoLeadCodigo } = input

  if (pastaDoLeadCodigo) return pastaDoLeadCodigo

  if (documentoPessoaId) {
    if (pessoasCompradorasIds.includes(documentoPessoaId)) return 'comprador'
    if (pessoasVendedorasIds.includes(documentoPessoaId))  return 'vendedor'
  }

  return pastaSugeridaCodigoDoTipo ?? null
}
```

Create `src/lib/documentos/organizarPastas.ts`:

```ts
/**
 * Regras puras do "Organizar arquivos" da Captação (spec
 * docs/superpowers/specs/2026-09-24-pastas-documentos-captacao-design.md).
 * Sem I/O — as rotas de servidor só buscam dados e aplicam o que estas
 * funções decidem.
 */

/** Tipos que a fase 1 do OCR (classificação Haiku) sabe devolver. */
export const TIPOS_CLASSIFICACAO: ReadonlySet<string> = new Set([
  'rg', 'cnh', 'cpf', 'comprovante_endereco', 'comprovante_renda', 'extrato_fgts',
  'extrato_bancario', 'certidao_casamento', 'certidao_nascimento', 'outro',
])

/** Sem tipo ainda (nulo/vazio/'auto') → vale chamar a IA. Qualquer outro valor,
 * inclusive 'outro' ou um tipo escolhido no upload, já é conhecido. */
export function precisaClassificar(classificacao: string | null | undefined): boolean {
  return !classificacao || classificacao === 'auto'
}

/** "Extrair dados" pode pular a fase 1 quando o tipo já é um que a própria
 * classificação reconheceria (e não é 'outro', que ela ignora). */
export function tipoPermitePularClassificacao(classificacao: string | null | undefined): boolean {
  return !!classificacao && classificacao !== 'outro' && TIPOS_CLASSIFICACAO.has(classificacao)
}

export function planejarGravacaoPastas(
  itens: { documento_id: string; pasta_id: string | null }[],
  idsComVinculoLead: Set<string>,
): { atualizar: { documento_id: string; pasta_id: string | null }[]; criar: { documento_id: string; pasta_id: string }[] } {
  const atualizar: { documento_id: string; pasta_id: string | null }[] = []
  const criar: { documento_id: string; pasta_id: string }[] = []
  for (const item of itens) {
    if (idsComVinculoLead.has(item.documento_id)) {
      atualizar.push({ documento_id: item.documento_id, pasta_id: item.pasta_id })
    } else if (item.pasta_id) {
      // Documento só da Pessoa: sem pasta escolhida, não há o que gravar.
      criar.push({ documento_id: item.documento_id, pasta_id: item.pasta_id })
    }
  }
  return { atualizar, criar }
}

/** Mantém só os documentos que o servidor confirmou pertencerem ao lead. */
export function filtrarDocumentosDoLead<T extends { id: string }>(pedidos: string[], permitidos: T[]): T[] {
  const pedidosSet = new Set(pedidos)
  return permitidos.filter(d => pedidosSet.has(d.id))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/documentos/__tests__/organizarPastas.test.ts --exclude ".claude/**" --exclude "output/**"`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/documentos.ts src/lib/documentos/organizarPastas.ts src/lib/documentos/__tests__/organizarPastas.test.ts
git commit -m "feat(documentos): regras puras de organizar pastas + pasta do lead como 1ª sugestão"
```

---

### Task 2: Classificação reaproveitável no OCR

**Files:**
- Modify: `src/lib/documentos/ocr.ts` (bloco de download + fase 1 dentro de `processarOcrDocumento`, ~linhas 312-374)
- Test: `src/lib/documentos/__tests__/classificarDocumento.test.ts`

**Interfaces:**
- Consumes: `precisaClassificar`, `tipoPermitePularClassificacao` (Task 1)
- Produces:
  - `classificarTipoDocumento(contentBlock: Anthropic.Messages.ContentBlockParam): Promise<{ tipo_documento: string; confianca: string }>` (lança em falha)
  - `classificarDocumentoPorId(documentoId: string, empresaId: string): Promise<{ tipo: string | null; motivo?: 'nao_suportado' | 'erro' }>` — baixa, classifica e grava `classificacao_legado` (inclusive `'outro'`); não chama IA se `precisaClassificar` for falso (devolve o tipo já gravado).
  - `preencherPastaDeVinculosLeadSemPasta(documentoId: string, tipo: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/documentos/__tests__/classificarDocumento.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const estado = vi.hoisted(() => ({
  respostasIA: [] as Array<string | Error>,
  chamadasIA: 0,
  doc: null as null | Record<string, unknown>,
  updatesDocumentos: [] as Array<Record<string, unknown>>,
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class AnthropicMock {
    messages = {
      create: async () => {
        estado.chamadasIA++
        const r = estado.respostasIA.shift()
        if (r instanceof Error || r === undefined) throw r ?? new Error('sem resposta')
        return { content: [{ type: 'text', text: r }], stop_reason: 'end_turn' }
      },
    }
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    storage: {
      from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://x/arquivo' } }) }),
    },
    from(tabela: string) {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.is = () => q
      q.maybeSingle = () => Promise.resolve({ data: tabela === 'documentos' ? estado.doc : null, error: null })
      q.update = (v: Record<string, unknown>) => { if (tabela === 'documentos') estado.updatesDocumentos.push(v); return q }
      return q
    },
  },
}))

beforeEach(() => {
  estado.respostasIA = []
  estado.chamadasIA = 0
  estado.updatesDocumentos = []
  estado.doc = { id: 'd1', storage_path: 'a/b.jpg', storage_bucket: 'documentos-clientes', mime_type: 'image/jpeg', classificacao_legado: null }
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))))
})

describe('classificarDocumentoPorId', () => {
  it('classifica e grava o tipo', async () => {
    estado.respostasIA = ['{"tipo_documento":"cnh","confianca":"alta"}']
    const { classificarDocumentoPorId } = await import('../ocr')
    const r = await classificarDocumentoPorId('d1', 'empresa-1')
    expect(r).toEqual({ tipo: 'cnh' })
    expect(estado.updatesDocumentos).toContainEqual({ classificacao_legado: 'cnh' })
  })

  it("grava 'outro' (não null) pra não pagar de novo", async () => {
    estado.respostasIA = ['{"tipo_documento":"outro","confianca":"media"}']
    const { classificarDocumentoPorId } = await import('../ocr')
    await classificarDocumentoPorId('d1', 'empresa-1')
    expect(estado.updatesDocumentos).toContainEqual({ classificacao_legado: 'outro' })
  })

  it('tipo já conhecido não chama a IA', async () => {
    estado.doc = { ...estado.doc!, classificacao_legado: 'outro' }
    const { classificarDocumentoPorId } = await import('../ocr')
    const r = await classificarDocumentoPorId('d1', 'empresa-1')
    expect(r).toEqual({ tipo: 'outro' })
    expect(estado.chamadasIA).toBe(0)
  })

  it('áudio não vai pra IA', async () => {
    estado.doc = { ...estado.doc!, mime_type: 'audio/ogg' }
    const { classificarDocumentoPorId } = await import('../ocr')
    const r = await classificarDocumentoPorId('d1', 'empresa-1')
    expect(r).toEqual({ tipo: null, motivo: 'nao_suportado' })
    expect(estado.chamadasIA).toBe(0)
  })

  it('JSON inválido da IA vira erro isolado, sem lançar', async () => {
    estado.respostasIA = ['isto não é json']
    const { classificarDocumentoPorId } = await import('../ocr')
    const r = await classificarDocumentoPorId('d1', 'empresa-1')
    expect(r).toEqual({ tipo: null, motivo: 'erro' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/documentos/__tests__/classificarDocumento.test.ts --exclude ".claude/**" --exclude "output/**"`
Expected: FAIL — `classificarDocumentoPorId is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/documentos/ocr.ts`, add the import at the top (after the existing imports):

```ts
import { precisaClassificar, tipoPermitePularClassificacao } from './organizarPastas'
```

Add these exported functions right after `const VERSAO_PROMPT = 'v2'`:

```ts
/** Fase 1 do OCR isolada: só identifica o tipo (Haiku, barato). Lança em falha. */
export async function classificarTipoDocumento(
  contentBlock: Anthropic.Messages.ContentBlockParam,
): Promise<{ tipo_documento: string; confianca: string }> {
  const res = await anthropic.messages.create(
    {
      model: MODELO_CLASSIFICACAO,
      max_tokens: 120,
      system: SYSTEM_PROMPT_CLASSIFICAR,
      messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: 'Que tipo de documento é este?' }] }],
    },
    { signal: AbortSignal.timeout(45000) },
  )
  const bloco = res.content[0]
  if (bloco?.type !== 'text') throw new Error('Resposta inesperada na classificação')
  return JSON.parse(limparJson(bloco.text)) as { tipo_documento: string; confianca: string }
}

/** Baixa o arquivo do storage e monta o bloco pra IA; null se o mime não é suportado. */
async function baixarContentBlock(doc: { storage_path: string; storage_bucket: string | null; mime_type: string | null }) {
  const supabase = serviceSupabase()
  const { data: urlData } = await supabase.storage
    .from(doc.storage_bucket ?? 'documentos-clientes')
    .createSignedUrl(doc.storage_path, 120)
  if (!urlData?.signedUrl) throw new Error('Não foi possível gerar URL do documento')
  const resp = await fetch(urlData.signedUrl, { signal: AbortSignal.timeout(30000) })
  if (!resp.ok) throw new Error(`Download falhou: ${resp.status}`)
  const base64 = Buffer.from(await resp.arrayBuffer()).toString('base64')
  const rawMime = doc.mime_type ?? 'image/jpeg'
  const mimeType = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime
  return { contentBlock: montarContentBlock(base64, mimeType), mimeType }
}

/**
 * "Organizar arquivos": classifica um documento e grava o tipo em
 * classificacao_legado — inclusive 'outro', pra um novo clique não pagar a IA
 * de novo. Nunca lança: falha vira { tipo: null, motivo }.
 */
export async function classificarDocumentoPorId(
  documentoId: string,
  empresaId: string,
): Promise<{ tipo: string | null; motivo?: 'nao_suportado' | 'erro' }> {
  const supabase = serviceSupabase()
  const { data: doc } = await supabase
    .from('documentos')
    .select('id, storage_path, storage_bucket, mime_type, classificacao_legado')
    .eq('id', documentoId)
    .eq('empresa_id', empresaId)
    .maybeSingle()
  if (!doc) return { tipo: null, motivo: 'erro' }
  if (!precisaClassificar(doc.classificacao_legado)) return { tipo: doc.classificacao_legado as string }

  try {
    const { contentBlock } = await baixarContentBlock(doc)
    if (!contentBlock) return { tipo: null, motivo: 'nao_suportado' }
    const { tipo_documento } = await classificarTipoDocumento(contentBlock)
    await supabase.from('documentos').update({ classificacao_legado: tipo_documento }).eq('id', documentoId)
    return { tipo: tipo_documento }
  } catch (err) {
    console.error('[ocr] Falha ao classificar documento:', documentoId, err instanceof Error ? err.message : err)
    return { tipo: null, motivo: 'erro' }
  }
}

/**
 * Depois do "Extrair dados": vínculos de lead SEM pasta recebem a pasta sugerida
 * pelo tipo (catalogo_tipos_documento.pasta_sugerida_codigo). Nunca sobrescreve
 * pasta já escolhida pelo operador.
 */
export async function preencherPastaDeVinculosLeadSemPasta(documentoId: string, tipo: string): Promise<void> {
  const supabase = serviceSupabase()
  const { data: tipoCat } = await supabase
    .from('catalogo_tipos_documento')
    .select('pasta_sugerida_codigo')
    .eq('codigo', tipo)
    .maybeSingle()
  const codigo = tipoCat?.pasta_sugerida_codigo as string | null | undefined
  if (!codigo) return
  const { data: pasta } = await supabase
    .from('catalogo_pastas_processo')
    .select('id')
    .eq('codigo', codigo)
    .maybeSingle()
  if (!pasta?.id) return
  await supabase
    .from('documento_vinculos')
    .update({ pasta_id: pasta.id })
    .eq('documento_id', documentoId)
    .eq('entidade_tipo', 'lead')
    .is('pasta_id', null)
}
```

Inside `processarOcrDocumento`:

1. Change the initial select to also bring the known type:

```ts
    .select('id, storage_path, storage_bucket, mime_type, ocr_status:status_ocr, classificacao_legado')
```

2. Replace the block from `// Download único — reutilizado nas duas fases` down to (and including) `const tipo = classificacao.tipo_documento` with:

```ts
    // Download único — reutilizado nas duas fases
    const { contentBlock, mimeType } = await baixarContentBlock(doc)
    if (!contentBlock) {
      await supabase.from('documentos').update({ status_ocr: 'ignorado' }).eq('id', documentoId)
      await finalizarExtracao({ status: 'ignorado', erro_mensagem: `mime_type não suportado: ${mimeType}` })
      console.log('[ocr] mime_type não suportado, ignorado:', documentoId, '| mime:', mimeType)
      return {}
    }

    // ── Fase 1: classificação rápida ──────────────────────────────
    // Pulada quando o tipo já é conhecido (ex.: "Organizar arquivos" já
    // classificou) — economiza a chamada ao Haiku.
    const classificacao = tipoPermitePularClassificacao(doc.classificacao_legado)
      ? { tipo_documento: doc.classificacao_legado as string, confianca: 'alta' }
      : await classificarTipoDocumento(contentBlock)
    const tipo = classificacao.tipo_documento
```

3. In the "não-essencial" branch, keep `classificacao_legado: tipo === 'outro' ? null : tipo` unchanged (comportamento do Extrair dados atual).

4. After the successful extraction update (right before `await finalizarExtracao({ status: 'concluido', ...})`), add:

```ts
    await preencherPastaDeVinculosLeadSemPasta(documentoId, resultado.tipo_documento)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/documentos --exclude ".claude/**" --exclude "output/**"`
Expected: PASS (Task 1 + 5 new tests).

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "^src/lib/documentos"` — Expected: no output.

```bash
git add src/lib/documentos/ocr.ts src/lib/documentos/__tests__/classificarDocumento.test.ts
git commit -m "feat(ocr): classificação reaproveitável, pula fase 1 com tipo conhecido e preenche pasta do lead"
```

---

### Task 3: Contexto de lead no servidor + rota "classificar"

**Files:**
- Create: `src/lib/documentos/contextoLeadServidor.ts`
- Create: `src/app/api/leads/[id]/organizar-documentos/classificar/route.ts`
- Test: `src/app/api/leads/[id]/organizar-documentos/__tests__/classificar.test.ts`

**Interfaces:**
- Consumes: `classificarDocumentoPorId` (Task 2), `inferirPastaSugerida` (Task 1), `precisaClassificar`, `filtrarDocumentosDoLead` (Task 1)
- Produces:
  - `resolverUsuarioELead(request: NextRequest, leadId: string): Promise<{ usuario: { id: string; empresa_id: string }; lead: { id: string; pessoa_id: string | null } } | NextResponse>`
  - `carregarDocumentosDoLead(leadId: string, pessoaId: string | null, empresaId: string): Promise<{ docs: { id: string; pessoa_id: string | null; classificacao_legado: string | null }[]; idsComVinculoLead: Set<string> }>`
  - `POST /api/leads/[id]/organizar-documentos/classificar` body `{ documento_ids: string[] }` → `{ itens: { documento_id: string; tipo: string | null; pasta_sugerida_codigo: string | null; motivo?: 'nao_suportado' | 'erro' }[] }`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/leads/[id]/organizar-documentos/__tests__/classificar.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const estado = vi.hoisted(() => ({
  classificados: [] as string[],
  tipos: {} as Record<string, string | null>,
}))

vi.mock('@/lib/documentos/contextoLeadServidor', () => ({
  resolverUsuarioELead: async () => ({
    usuario: { id: 'u1', empresa_id: 'e1' },
    lead: { id: 'lead-1', pessoa_id: 'pessoa-1' },
  }),
  carregarDocumentosDoLead: async () => ({
    docs: [
      { id: 'd1', pessoa_id: 'pessoa-1', classificacao_legado: null },
      { id: 'd2', pessoa_id: 'vend-1', classificacao_legado: null },
    ],
    idsComVinculoLead: new Set(['d1', 'd2']),
  }),
  carregarVendedoresDoLead: async () => ['vend-1'],
  carregarPastaSugeridaPorTipo: async () => new Map([['cnh', 'comprador'], ['rg', 'comprador']]),
}))

vi.mock('@/lib/documentos/ocr', () => ({
  classificarDocumentoPorId: async (id: string) => {
    estado.classificados.push(id)
    const tipo = estado.tipos[id] ?? null
    return tipo ? { tipo } : { tipo: null, motivo: 'erro' }
  },
}))

function req(body: unknown) {
  return new NextRequest('http://localhost/api/leads/lead-1/organizar-documentos/classificar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => { estado.classificados = []; estado.tipos = {} })

describe('POST organizar-documentos/classificar', () => {
  it('sugere Comprador pelo tipo e Vendedor pelo dono do documento', async () => {
    estado.tipos = { d1: 'cnh', d2: 'rg' }
    const { POST } = await import('../classificar/route')
    const res = await POST(req({ documento_ids: ['d1', 'd2'] }), { params: { id: 'lead-1' } })
    const json = await res.json()
    expect(json.itens).toEqual([
      { documento_id: 'd1', tipo: 'cnh', pasta_sugerida_codigo: 'comprador' },
      { documento_id: 'd2', tipo: 'rg', pasta_sugerida_codigo: 'vendedor' },
    ])
  })

  it('ignora documento que não é do lead', async () => {
    estado.tipos = { d1: 'cnh' }
    const { POST } = await import('../classificar/route')
    await POST(req({ documento_ids: ['d1', 'de-outro-lead'] }), { params: { id: 'lead-1' } })
    expect(estado.classificados).toEqual(['d1'])
  })

  it('falha em um documento não derruba os outros', async () => {
    estado.tipos = { d1: 'cnh', d2: null }
    const { POST } = await import('../classificar/route')
    const json = await (await POST(req({ documento_ids: ['d1', 'd2'] }), { params: { id: 'lead-1' } })).json()
    expect(json.itens[1]).toEqual({ documento_id: 'd2', tipo: null, pasta_sugerida_codigo: null, motivo: 'erro' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/leads/\[id\]/organizar-documentos" --exclude ".claude/**" --exclude "output/**"`
Expected: FAIL — cannot find `../classificar/route`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/documentos/contextoLeadServidor.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

/** Autentica pelo Bearer e confere que o lead é da empresa do usuário. */
export async function resolverUsuarioELead(request: NextRequest, leadId: string) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { data: usuario } = await supabase
    .from('usuarios').select('id, empresa_id').eq('auth_user_id', user.id).single()
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { data: lead } = await supabase
    .from('leads').select('id, pessoa_id')
    .eq('id', leadId).eq('empresa_id', usuario.empresa_id).is('deleted_at', null)
    .maybeSingle()
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
  return { usuario: usuario as { id: string; empresa_id: string }, lead: lead as { id: string; pessoa_id: string | null } }
}

/**
 * Mesmo universo que a aba Documentos do lead mostra (AbaDocumentos): vínculo
 * direto com o lead + documentos do acervo da Pessoa do lead sem vínculo com
 * lead/lead_historico.
 */
export async function carregarDocumentosDoLead(leadId: string, pessoaId: string | null, empresaId: string) {
  const { data: vinculos } = await supabase
    .from('documento_vinculos').select('documento_id')
    .eq('entidade_tipo', 'lead').eq('entidade_id', leadId).eq('empresa_id', empresaId)
  const idsComVinculoLead = new Set((vinculos ?? []).map(v => v.documento_id as string))

  let idsPessoaSemVinculo: string[] = []
  if (pessoaId) {
    const { data: docsPessoa } = await supabase
      .from('documentos').select('id')
      .eq('dominio', 'acervo_documental').eq('pessoa_id', pessoaId)
      .eq('empresa_id', empresaId).is('deleted_at', null)
    const idsPessoa = (docsPessoa ?? []).map(d => d.id as string)
    if (idsPessoa.length > 0) {
      const { data: comLead } = await supabase
        .from('documento_vinculos').select('documento_id')
        .in('entidade_tipo', ['lead', 'lead_historico']).in('documento_id', idsPessoa)
      const set = new Set((comLead ?? []).map(v => v.documento_id as string))
      idsPessoaSemVinculo = idsPessoa.filter(id => !set.has(id))
    }
  }

  const ids = Array.from(new Set([...Array.from(idsComVinculoLead), ...idsPessoaSemVinculo]))
  if (ids.length === 0) return { docs: [], idsComVinculoLead }
  const { data: docs } = await supabase
    .from('documentos').select('id, pessoa_id, classificacao_legado')
    .in('id', ids).eq('empresa_id', empresaId).is('deleted_at', null)
  return {
    docs: (docs ?? []) as { id: string; pessoa_id: string | null; classificacao_legado: string | null }[],
    idsComVinculoLead,
  }
}

export async function carregarVendedoresDoLead(leadId: string): Promise<string[]> {
  const { data } = await supabase.from('lead_vendedores').select('pessoa_id').eq('lead_id', leadId)
  return (data ?? []).map(v => v.pessoa_id as string)
}

/** codigo do tipo → codigo da pasta sugerida (catalogo_tipos_documento). */
export async function carregarPastaSugeridaPorTipo(): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('catalogo_tipos_documento').select('codigo, pasta_sugerida_codigo')
    .not('pasta_sugerida_codigo', 'is', null)
  return new Map((data ?? []).map(t => [t.codigo as string, t.pasta_sugerida_codigo as string]))
}
```

Create `src/app/api/leads/[id]/organizar-documentos/classificar/route.ts`:

```ts
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

/** "Organizar arquivos" passo 1: classifica (Haiku) e sugere pasta. Não grava pasta. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolverUsuarioELead(request, params.id)
  if (ctx instanceof NextResponse) return ctx
  const { usuario, lead } = ctx

  const body = await request.json().catch(() => ({})) as { documento_ids?: string[] }
  const pedidos = Array.isArray(body.documento_ids) ? body.documento_ids : []

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
```

Note: `pessoasCompradorasIds: []` de propósito — documento da Pessoa do lead cai na pasta pelo tipo (RG/CNH/comprovantes → `comprador` pelo catálogo); forçar `comprador` por dono mandaria até foto da casa pra 01 Comprador.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/api/leads/\[id\]/organizar-documentos" --exclude ".claude/**" --exclude "output/**"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/documentos/contextoLeadServidor.ts "src/app/api/leads/[id]/organizar-documentos"
git commit -m "feat(api): rota classificar do Organizar arquivos da Captação"
```

---

### Task 4: Rota "aplicar"

**Files:**
- Create: `src/app/api/leads/[id]/organizar-documentos/aplicar/route.ts`
- Test: `src/app/api/leads/[id]/organizar-documentos/__tests__/aplicar.test.ts`

**Interfaces:**
- Consumes: `resolverUsuarioELead`, `carregarDocumentosDoLead` (Task 3), `planejarGravacaoPastas`, `filtrarDocumentosDoLead` (Task 1)
- Produces: `POST /api/leads/[id]/organizar-documentos/aplicar` body `{ itens: { documento_id: string; pasta_id: string | null }[] }` → `{ ok: true, atualizados: number, criados: number }` ou `{ error }` 500 quando alguma gravação não afetou linha.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/leads/[id]/organizar-documentos/__tests__/aplicar.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const estado = vi.hoisted(() => ({
  updates: [] as Array<{ valores: unknown; filtros: Record<string, unknown> }>,
  inserts: [] as unknown[],
  tocouDocumentos: false,
  linhasAfetadasUpdate: 1,
}))

vi.mock('@/lib/documentos/contextoLeadServidor', () => ({
  resolverUsuarioELead: async () => ({
    usuario: { id: 'u1', empresa_id: 'e1' },
    lead: { id: 'lead-1', pessoa_id: 'pessoa-1' },
  }),
  carregarDocumentosDoLead: async () => ({
    docs: [{ id: 'd1', pessoa_id: 'pessoa-1', classificacao_legado: 'cnh' }, { id: 'd2', pessoa_id: 'pessoa-1', classificacao_legado: 'rg' }],
    idsComVinculoLead: new Set(['d1']),
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from(tabela: string) {
      if (tabela === 'documentos') { estado.tocouDocumentos = true }
      const filtros: Record<string, unknown> = {}
      const q: Record<string, unknown> = {}
      q.eq = (k: string, v: unknown) => { filtros[k] = v; return q }
      q.update = (valores: unknown) => { estado.updates.push({ valores, filtros }); return q }
      q.select = () => Promise.resolve({ data: Array(estado.linhasAfetadasUpdate).fill({ id: 'v' }), error: null })
      q.insert = (rows: unknown) => { estado.inserts.push(rows); return { select: () => Promise.resolve({ data: [{ id: 'novo' }], error: null }) } }
      return q
    },
  },
}))

function req(body: unknown) {
  return new NextRequest('http://localhost/api/leads/lead-1/organizar-documentos/aplicar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => { estado.updates = []; estado.inserts = []; estado.tocouDocumentos = false; estado.linhasAfetadasUpdate = 1 })

describe('POST organizar-documentos/aplicar', () => {
  it('atualiza vínculo existente e cria vínculo pra doc só da Pessoa, sem tocar em documentos', async () => {
    const { POST } = await import('../aplicar/route')
    const res = await POST(req({ itens: [{ documento_id: 'd1', pasta_id: 'pA' }, { documento_id: 'd2', pasta_id: 'pB' }] }), { params: { id: 'lead-1' } })
    expect(await res.json()).toEqual({ ok: true, atualizados: 1, criados: 1 })
    expect(estado.updates[0].valores).toEqual({ pasta_id: 'pA' })
    expect(estado.inserts[0]).toEqual([expect.objectContaining({
      documento_id: 'd2', entidade_tipo: 'lead', entidade_id: 'lead-1', pasta_id: 'pB', empresa_id: 'e1', vinculado_por: 'u1',
    })])
    expect(estado.tocouDocumentos).toBe(false)
  })

  it('ignora documento que não é do lead', async () => {
    const { POST } = await import('../aplicar/route')
    await POST(req({ itens: [{ documento_id: 'de-outro', pasta_id: 'pA' }] }), { params: { id: 'lead-1' } })
    expect(estado.updates).toHaveLength(0)
    expect(estado.inserts).toHaveLength(0)
  })

  it('UPDATE sem linha afetada vira erro, não sucesso', async () => {
    estado.linhasAfetadasUpdate = 0
    const { POST } = await import('../aplicar/route')
    const res = await POST(req({ itens: [{ documento_id: 'd1', pasta_id: 'pA' }] }), { params: { id: 'lead-1' } })
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/leads/\[id\]/organizar-documentos" --exclude ".claude/**" --exclude "output/**"`
Expected: FAIL — cannot find `../aplicar/route`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/api/leads/[id]/organizar-documentos/aplicar/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { resolverUsuarioELead, carregarDocumentosDoLead } from '@/lib/documentos/contextoLeadServidor'
import { planejarGravacaoPastas, filtrarDocumentosDoLead } from '@/lib/documentos/organizarPastas'

/**
 * Grava a pasta dos documentos no vínculo com o lead (documento_vinculos,
 * entidade_tipo='lead'). Documento só da Pessoa ganha o vínculo. Nunca toca
 * em `documentos` — o dono continua sendo a Pessoa (CLAUDE.md, invariante 2).
 * Usada pelo "Organizar arquivos" e pelo "mover de pasta" manual na Captação.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolverUsuarioELead(request, params.id)
  if (ctx instanceof NextResponse) return ctx
  const { usuario, lead } = ctx

  const body = await request.json().catch(() => ({})) as { itens?: { documento_id: string; pasta_id: string | null }[] }
  const itens = Array.isArray(body.itens) ? body.itens : []

  const { docs, idsComVinculoLead } = await carregarDocumentosDoLead(lead.id, lead.pessoa_id, usuario.empresa_id)
  const permitidos = new Set(filtrarDocumentosDoLead(itens.map(i => i.documento_id), docs).map(d => d.id))
  const validos = itens.filter(i => permitidos.has(i.documento_id))
  const { atualizar, criar } = planejarGravacaoPastas(validos, idsComVinculoLead)

  for (const item of atualizar) {
    const { data, error } = await supabase
      .from('documento_vinculos')
      .update({ pasta_id: item.pasta_id })
      .eq('documento_id', item.documento_id)
      .eq('entidade_tipo', 'lead')
      .eq('entidade_id', lead.id)
      .eq('empresa_id', usuario.empresa_id)
      .select('id')
    if (error || !data || data.length === 0) {
      console.error('[organizar-documentos/aplicar] vínculo não atualizado:', item.documento_id, error?.message)
      return NextResponse.json({ error: 'Não foi possível mover um dos documentos. Recarregue e tente de novo.' }, { status: 500 })
    }
  }

  if (criar.length > 0) {
    const { data, error } = await supabase
      .from('documento_vinculos')
      .insert(criar.map(c => ({
        empresa_id:    usuario.empresa_id,
        documento_id:  c.documento_id,
        entidade_tipo: 'lead',
        entidade_id:   lead.id,
        vinculado_por: usuario.id,
        pasta_id:      c.pasta_id,
      })))
      .select('id')
    if (error || !data || data.length !== criar.length) {
      console.error('[organizar-documentos/aplicar] vínculo não criado:', error?.message)
      return NextResponse.json({ error: 'Não foi possível mover um dos documentos. Recarregue e tente de novo.' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, atualizados: atualizar.length, criados: criar.length })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/api/leads/\[id\]/organizar-documentos" --exclude ".claude/**" --exclude "output/**"`
Expected: PASS (6 tests: 3 classificar + 3 aplicar).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/leads/[id]/organizar-documentos"
git commit -m "feat(api): rota aplicar pastas no vínculo do lead"
```

---

### Task 5: Modal "Organizar arquivos"

**Files:**
- Create: `src/components/documentos/OrganizarArquivosModal.tsx`

**Interfaces:**
- Consumes: rotas das Tasks 3 e 4; `useCatalogoPastasProcesso()` (retorna `{ id, codigo, nome, ordem_exibicao }[]`)
- Produces: `<OrganizarArquivosModal leadId: string; documentos: { id: string; nome_original: string; nome_exibicao: string | null; storage_path: string; mime_type: string | null }[]; onFechar: () => void; onConcluido: () => void />`

- [ ] **Step 1: Implement the component**

```tsx
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

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const paths = documentos.map(d => d.storage_path)
      const { data: urls } = await supabase.storage.from('documentos-clientes').createSignedUrls(paths, 3600)
      if (!cancelado && urls) {
        const m: Record<string, string> = {}
        urls.forEach((u, i) => { if (u.signedUrl) m[documentos[i].id] = u.signedUrl })
        setMiniaturas(m)
      }
      try {
        const res = await fetch(`/api/leads/${leadId}/organizar-documentos/classificar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
          body: JSON.stringify({ documento_ids: documentos.map(d => d.id) }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Erro ao identificar os arquivos.')
        if (cancelado) return
        const l: Record<string, Linha> = {}
        for (const it of json.itens as { documento_id: string; tipo: string | null; pasta_sugerida_codigo: string | null; motivo?: string }[]) {
          l[it.documento_id] = { tipo: it.tipo, motivo: it.motivo, pastaCodigo: it.pasta_sugerida_codigo ?? '' }
        }
        setLinhas(l)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao identificar os arquivos.')
      } finally {
        if (!cancelado) setClassificando(false)
      }
    })()
    return () => { cancelado = true }
  }, [leadId, documentos])

  async function confirmar() {
    const itens = documentos
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
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Erro ao organizar.'); return }
      toast.success(`${itens.length} arquivo${itens.length !== 1 ? 's' : ''} organizado${itens.length !== 1 ? 's' : ''}.`)
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
              <Loader2 className="h-4 w-4 animate-spin" /> Identificando {documentos.length} arquivo{documentos.length !== 1 ? 's' : ''}…
            </div>
          )}
          {!classificando && documentos.map(d => {
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "^src/components/documentos/OrganizarArquivosModal"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/documentos/OrganizarArquivosModal.tsx
git commit -m "feat(documentos): modal de revisão do Organizar arquivos"
```

---

### Task 6: `AbaDocumentos` com pastas na Captação

**Files:**
- Modify: `src/components/documentos/AbaDocumentos.tsx`
- Modify: `src/components/leads/LeadDetalheModal.tsx:537-541`

**Interfaces:**
- Consumes: `OrganizarArquivosModal` (Task 5), rota aplicar (Task 4)

- [ ] **Step 1: Add the `usaPastas` flag and lead folder mapping**

After `const entidadeId = ...` (line 124) add:

```ts
  // Pastas existem em Negócios e, desde 2026-09-24, na Captação (mesmo catálogo).
  const usaPastas = contexto === 'processo' || contexto === 'lead'
```

In the query `.map(d => ({ ... }))`, replace the `pasta_id:` expression with:

```ts
          pasta_id: contexto === 'processo'
            ? (d.dominio === 'processo_trabalho' ? d.pasta_id : (pastaPorVinculo.get(d.id) ?? null))
            : contexto === 'lead'
              ? (pastaPorVinculo.get(d.id) ?? null)
              : null,
```

- [ ] **Step 2: Enable grid, counters, filter and upload folder for lead**

Replace these gates (`contexto === 'processo'` → `usaPastas`, `contexto !== 'processo'` → `!usaPastas`):
- `pastaSugeridaPorTipo`: `if (!usaPastas) return null`
- `uploadArquivo`: `const pastaId = usaPastas && pastaCodigoArquivo ? ... : null`
- `pastasGrid` useMemo: `if (!usaPastas) return []` and deps `[usaPastas, catalogoPastas]`
- `documentosExibidos`: add the virtual folder and use the flag:

```ts
  const documentosExibidos = useMemo(() => {
    if (!usaPastas || !pastaAtiva) return documentos
    if (pastaAtiva === 'todos') return documentos
    if (pastaAtiva === 'sem_pasta') return documentos.filter(d => !d.pasta_id)
    return documentos.filter(d => d.pasta_id === (pastaAtivaInfo?.id ?? '__nunca__'))
  }, [usaPastas, pastaAtiva, pastaAtivaInfo, documentos])

  const documentosSemPasta = useMemo(() => documentos.filter(d => !d.pasta_id), [documentos])
```

- JSX grid `{contexto === 'processo' && !pastaAtiva && (` → `{usaPastas && !pastaAtiva && (`
- Breadcrumb `{contexto === 'processo' && pastaAtiva && (` → `{usaPastas && pastaAtiva && (` and label: `{pastaAtiva === 'todos' ? 'Todos' : pastaAtiva === 'sem_pasta' ? 'Sem pasta' : pastaAtivaInfo?.nome ?? pastaAtiva}`
- List visibility `{(contexto !== 'processo' || !!pastaAtiva) && (` → `{(!usaPastas || !!pastaAtiva) && (`
- Upload modal folder select `{contexto === 'processo' && (` (≈ line 1072) → `{usaPastas && (`

In `handleArquivoSelecionado`, preselect the open folder:

```ts
      pastas[chaveArquivo(f)] = pastaAtivaInfo?.codigo ?? pastaSugeridaPorTipo('auto') ?? ''
```

- [ ] **Step 3: "Sem pasta" tile + "Organizar arquivos" banner (lead only)**

Inside the grid, right after the "Todos" `<button>`, add:

```tsx
          {contexto === 'lead' && (
            <button
              onClick={() => setPastaAtiva('sem_pasta')}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-center transition-colors ${
                documentosSemPasta.length > 0 ? 'border-amber-200 bg-amber-50 hover:bg-amber-100' : 'border-gray-100 bg-white hover:bg-gray-50'
              }`}
            >
              <FolderOpen className={`h-6 w-6 ${documentosSemPasta.length > 0 ? 'text-amber-500' : 'text-gray-400'}`} />
              <span className="text-xs font-medium text-gray-700">Sem pasta</span>
              <span className="text-[10px] text-gray-400">{documentosSemPasta.length} arquivo{documentosSemPasta.length !== 1 ? 's' : ''}</span>
            </button>
          )}
```

Add state `const [organizarAberto, setOrganizarAberto] = useState(false)` next to the other modal states, and right before the `OcrEnriquecimentoCard` line add:

```tsx
      {contexto === 'lead' && documentosSemPasta.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-medium text-amber-800">
            {documentosSemPasta.length} arquivo{documentosSemPasta.length !== 1 ? 's' : ''} sem pasta
          </span>
          <Button size="sm" variant="outline" className="h-8 w-full shrink-0 border-amber-200 text-xs text-amber-700 hover:bg-amber-100 sm:h-7 sm:w-auto" onClick={() => setOrganizarAberto(true)}>
            <Sparkles className="h-3 w-3 mr-1" />
            Organizar arquivos
          </Button>
        </div>
      )}
```

Near the other modals at the bottom (after the `DocumentoOcrRevisaoModal` block) add:

```tsx
      {organizarAberto && contexto === 'lead' && leadId && (
        <OrganizarArquivosModal
          leadId={leadId}
          documentos={documentosSemPasta}
          onFechar={() => setOrganizarAberto(false)}
          onConcluido={() => { setOrganizarAberto(false); queryClient.invalidateQueries({ queryKey }) }}
        />
      )}
```

and the import `import { OrganizarArquivosModal } from '@/components/documentos/OrganizarArquivosModal'`.

- [ ] **Step 4: Manual "mover de pasta" in lead**

Add a helper next to `moverParaPasta`:

```ts
  // Captação: pasta mora no vínculo com o lead, que pode ainda não existir
  // (documento só da Pessoa) — por isso passa pela rota de servidor, não pelo
  // useMoverDocumentoParaPasta (que só faz UPDATE).
  async function moverDocumentoNoLead(documentoId: string, novaPastaId: string | null) {
    const { data: session } = await supabase.auth.getSession()
    const res = await fetch(`/api/leads/${leadId}/organizar-documentos/aplicar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session?.access_token ?? ''}` },
      body: JSON.stringify({ itens: [{ documento_id: documentoId, pasta_id: novaPastaId }] }),
    })
    if (!res.ok) { toast.error('Não foi possível mover o documento.'); return }
    queryClient.invalidateQueries({ queryKey })
  }
```

In the per-document `<Select>` (≈ line 910): change the gate to `{usaPastas && (` and `onValueChange` to:

```tsx
                    onValueChange={(v) => {
                      const novaPastaId = v === '__nenhuma__' ? null : (catalogoPastas.find(p => p.codigo === v)?.id ?? null)
                      if (contexto === 'lead') { void moverDocumentoNoLead(doc.id, novaPastaId); return }
                      moverParaPasta.mutate({
                        documentoId: doc.id,
                        dominio: doc.dominio ?? 'acervo_documental',
                        processoId: processoId,
                        novaPastaId,
                      })
                    }}
```

(The "Sem pasta · sugestão" chip at ≈ line 887 stays processo-only.)

- [ ] **Step 5: Wire 04/13 shortcuts in the lead modal**

In `src/components/leads/LeadDetalheModal.tsx`, change the `<AbaDocumentos contexto="lead" ... />` to:

```tsx
                    <AbaDocumentos
                      contexto="lead"
                      leadId={lead.id}
                      pessoaId={lead.pessoa_id}
                      onNavegarParaAba={(aba) => setAbaAtiva(aba)}
                    />
```

- [ ] **Step 6: Typecheck + existing tests**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "^src/components/(documentos|leads)"` — Expected: no output.
Run: `npx vitest run src/components src/lib/documentos "src/app/api/leads" --exclude ".claude/**" --exclude "output/**"` — Expected: only the pre-existing `atualizar-cliente` failures (mock sem `rpc`, fora deste plano).

- [ ] **Step 7: Commit**

```bash
git add src/components/documentos/AbaDocumentos.tsx src/components/leads/LeadDetalheModal.tsx
git commit -m "feat(captacao): grade de pastas, Sem pasta e Organizar arquivos na aba Documentos"
```

---

### Task 7: Pasta do lead acompanha a conversão em negócio

**Files:**
- Modify: `src/components/leads/NovoProcessoModal.tsx` (`handleProcessoCriado` ~336, `VincularStep.handleVincular` ~1763)

**Interfaces:**
- Consumes: `inferirPastaSugerida({ ..., pastaDoLeadCodigo })` (Task 1)

- [ ] **Step 1: Carry the lead folder into the docs list**

Add `pasta_lead_id: string | null` to `interface DocumentoParaVincular`. In `handleProcessoCriado`, after the `docs` query and before `setVinculacao`, add:

```ts
      // Pasta escolhida na Captação (vínculo com o lead) vira a 1ª sugestão no negócio.
      let pastaPorDoc = new Map<string, string | null>()
      if (lead?.id && docs && docs.length > 0) {
        const { data: vincLead } = await supabase
          .from('documento_vinculos')
          .select('documento_id, pasta_id')
          .eq('entidade_tipo', 'lead')
          .eq('entidade_id', lead.id)
          .in('documento_id', docs.map(d => d.id))
        pastaPorDoc = new Map((vincLead ?? []).map(v => [v.documento_id as string, v.pasta_id as string | null]))
      }
```

and change the `setVinculacao` line to:

```ts
        setVinculacao({ ...payload, docs: docs.map(d => ({ ...d, pasta_lead_id: pastaPorDoc.get(d.id) ?? null })) as DocumentoParaVincular[] })
```

- [ ] **Step 2: Use it as priority 0**

In `VincularStep.handleVincular`, inside `rows = Array.from(ids).map(...)`, pass the lead folder:

```ts
      const pastaDoLeadCodigo = doc?.pasta_lead_id
        ? catalogoPastas.find(p => p.id === doc.pasta_lead_id)?.codigo ?? null
        : null
      const codigoPasta = doc ? inferirPastaSugerida({
        documentoPessoaId: doc.pessoa_id,
        pastaSugeridaCodigoDoTipo: codigoDoTipo,
        pessoasCompradorasIds: compradorasIds,
        pessoasVendedorasIds: vendedorasIds,
        pastaDoLeadCodigo,
      }) : null
```

- [ ] **Step 3: Typecheck + tests**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "^src/components/leads/NovoProcessoModal"` — Expected: no output.
Run: `npx vitest run src/lib/documentos --exclude ".claude/**" --exclude "output/**"` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/leads/NovoProcessoModal.tsx
git commit -m "feat(negocios): pasta escolhida na Captação é a 1ª sugestão ao vincular documentos"
```

---

### Task 8: Documentação, verificação e PR

**Files:**
- Modify: `CLAUDE.md` (append section)

- [ ] **Step 1: Append to CLAUDE.md**

```markdown
## Pastas de documentos na Captação (2026-09-24)

A aba Documentos do lead usa o mesmo catálogo de pastas de Negócios. A pasta de um documento no
lead mora em `documento_vinculos.pasta_id` do vínculo `entidade_tipo='lead'`; documento que só
pertence à Pessoa (sem vínculo) é "Sem pasta" e ganha o vínculo ao ser organizado — sempre pela
rota `POST /api/leads/[id]/organizar-documentos/aplicar`, nunca por UPDATE direto no cliente
(`useMoverDocumentoParaPasta` só faz UPDATE e não criaria o vínculo). "Organizar arquivos" chama
`/classificar`, que roda só a fase 1 do OCR (Haiku) e grava o tipo em `classificacao_legado`,
inclusive `'outro'`, pra não pagar de novo; `processarOcrDocumento` pula a fase 1 quando o tipo já
é conhecido. Na conversão lead → negócio, a pasta do lead é a 1ª prioridade de
`inferirPastaSugerida` (`pastaDoLeadCodigo`).
```

- [ ] **Step 2: Full verification**

Run: `npx vitest run src --exclude ".claude/**" --exclude "output/**"`
Expected: only pre-existing failures (`atualizar-cliente` x2 arquivos, `criteria-migracao-fase4-caixa`, `mensagem-imovel-acima-teto`, `prazo-idade-renda-maxima`).
Run: `npx tsc --noEmit -p . 2>&1 | grep -E "^src/"` — Expected: no output.

- [ ] **Step 3: Commit, push, PR, merge (autorização permanente do usuário)**

```bash
git add CLAUDE.md
git commit -m "docs: pastas de documentos na Captação"
git push -u origin feat/pastas-documentos-captacao
gh pr create --title "feat(captacao): pastas de documentos + Organizar arquivos" --body "<resumo + teste manual + 🤖 Generated with [Claude Code](https://claude.com/claude-code)>"
gh pr merge --squash --delete-branch
```

- [ ] **Step 4: Manual check in production (usuário)**

Lead com 5+ arquivos do WhatsApp → aba Documentos mostra "N sem pasta" → Organizar arquivos → confere sugestões (RG/CNH → 01 Comprador; foto da casa → sem sugestão) → Confirmar → contadores das pastas atualizam → converter em negócio → na etapa "Vincular documentos" e no negócio, arquivos nas mesmas pastas.
