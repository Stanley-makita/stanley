/* Banco falso em memória para testes de rota: encadeia filtros e resolve como thenable.
 * Suporta select/insert/upsert(ignoreDuplicates)/delete/update, eq/neq/in/is/not(in|is)/ilike/or(ignorado),
 * order(ignorado)/limit, maybeSingle/single. `unicos` define a chave única por tabela. */
export type Row = Record<string, unknown>

export function criarFakeDb(tabelas: Record<string, Row[]>, opts: { unicos?: Record<string, string[]> } = {}) {
  const from = (tabela: string) => {
    const filtros: Array<(r: Row) => boolean> = []
    let op: 'select' | 'insert' | 'upsert' | 'delete' | 'update' = 'select'
    let linhasNovas: Row[] = []
    let patch: Row = {}
    let ignorar = false
    let limite: number | null = null
    const lista = () => (tabelas[tabela] ??= [])
    const chave = (r: Row) => (opts.unicos?.[tabela] ?? ['id']).map(c => String(r[c])).join('|')
    const executar = () => {
      if (op === 'insert') { lista().push(...linhasNovas); return { data: linhasNovas, error: null } }
      if (op === 'upsert') {
        const inseridas: Row[] = []
        for (const n of linhasNovas) {
          const existente = lista().find(r => chave(r) === chave(n))
          if (existente) { if (!ignorar) Object.assign(existente, n) }
          else { lista().push({ ...n }); inseridas.push(n) }
        }
        return { data: inseridas, error: null }
      }
      let alvo = lista().filter(r => filtros.every(f => f(r)))
      if (op === 'delete') { tabelas[tabela] = lista().filter(r => !alvo.includes(r)); return { data: alvo, error: null } }
      if (op === 'update') alvo.forEach(r => Object.assign(r, patch))
      if (limite != null) alvo = alvo.slice(0, limite)
      return { data: alvo, error: null }
    }
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (r: Row | Row[]) => { op = 'insert'; linhasNovas = Array.isArray(r) ? r : [r]; return b },
      upsert: (r: Row | Row[], o?: { ignoreDuplicates?: boolean }) => { op = 'upsert'; linhasNovas = Array.isArray(r) ? r : [r]; ignorar = !!o?.ignoreDuplicates; return b },
      delete: () => { op = 'delete'; return b },
      update: (p: Row) => { op = 'update'; patch = p; return b },
      eq: (c: string, v: unknown) => { filtros.push(r => r[c] === v); return b },
      neq: (c: string, v: unknown) => { filtros.push(r => r[c] !== v); return b },
      in: (c: string, vs: unknown[]) => { filtros.push(r => vs.includes(r[c])); return b },
      is: (c: string, v: unknown) => { filtros.push(r => (r[c] ?? null) === v); return b },
      not: (c: string, operador: string, v: string | null) => {
        if (operador === 'in') { const vs = String(v).replace(/[()]/g, '').split(','); filtros.push(r => !vs.includes(String(r[c]))) }
        if (operador === 'is') filtros.push(r => (r[c] ?? null) !== null)
        return b
      },
      ilike: (c: string, padrao: string) => { const t = padrao.replace(/%/g, '').toLowerCase(); filtros.push(r => String(r[c] ?? '').toLowerCase().includes(t)); return b },
      or: () => b,
      order: () => b,
      limit: (n: number) => { limite = n; return b },
      abortSignal: () => b,
      maybeSingle: () => Promise.resolve({ data: executar().data?.[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: executar().data?.[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(executar()).then(res, rej),
    }
    return b
  }
  return { from, tabelas }
}
