import { describe, it, expect, beforeEach } from 'vitest'
import { reivindicarEvento, marcarEventoConcluido } from '../idempotenciaWebhook'

// Fake mínimo do client Supabase, modelando só o que `fonti_events` precisa: um INSERT
// atômico que respeita a constraint UNIQUE (messageid, instancia_id, tipo_evento) — a
// atomicidade real é garantida pelo Postgres (a constraint em si), não pelo código da
// aplicação; este fake simula esse comportamento de banco pra validar que
// `reivindicarEvento` traduz corretamente um conflito (23505) em `reivindicado: false`,
// sem nunca fazer um SELECT-depois-INSERT (que teria janela de corrida real).
function criarFakeSupabase() {
  const linhas = new Map<string, { id: string; status: string }>()
  let proximoId = 1
  const updates: Array<{ id: string; status: string }> = []

  const client = {
    from(tabela: string) {
      if (tabela !== 'fonti_events') throw new Error(`tabela inesperada no fake: ${tabela}`)
      return {
        insert(row: { messageid: string; instancia_id: string; tipo_evento: string; empresa_id: string; status: string }) {
          const chave = `${row.messageid}|${row.instancia_id}|${row.tipo_evento}`
          return {
            select() {
              return {
                async single() {
                  // Checagem + escrita em um único passo síncrono, sem await entre elas —
                  // é exatamente essa ausência de janela que uma constraint UNIQUE real
                  // garante no Postgres, e que este fake precisa preservar pra ser um
                  // substituto honesto do comportamento real.
                  if (linhas.has(chave)) {
                    return { data: null, error: { code: '23505', message: 'duplicate key' } }
                  }
                  const id = `evt-${proximoId++}`
                  linhas.set(chave, { id, status: row.status })
                  return { data: { id }, error: null }
                },
              }
            },
          }
        },
        update(valores: { status: string }) {
          return {
            eq(_coluna: string, id: string) {
              updates.push({ id, status: valores.status })
              for (const linha of Array.from(linhas.values())) {
                if (linha.id === id) linha.status = valores.status
              }
              return Promise.resolve({ error: null })
            },
          }
        },
      }
    },
  }

  return { client, linhas, updates }
}

describe('reivindicarEvento', () => {
  let fake: ReturnType<typeof criarFakeSupabase>

  beforeEach(() => {
    fake = criarFakeSupabase()
  })

  it('reivindica um evento novo com sucesso', async () => {
    const r = await reivindicarEvento({
      supabase: fake.client as any,
      messageid: 'msg-1',
      instanciaId: 'inst-a',
      tipoEvento: 'messages',
      empresaId: 'empresa-1',
    })
    expect(r.reivindicado).toBe(true)
    expect(r.eventoId).toBeDefined()
  })

  it('rejeita reprocessamento do mesmo evento (messageid + instancia + tipo repetidos)', async () => {
    const primeira = await reivindicarEvento({
      supabase: fake.client as any,
      messageid: 'msg-dup',
      instanciaId: 'inst-a',
      tipoEvento: 'messages',
      empresaId: 'empresa-1',
    })
    const segunda = await reivindicarEvento({
      supabase: fake.client as any,
      messageid: 'msg-dup',
      instanciaId: 'inst-a',
      tipoEvento: 'messages',
      empresaId: 'empresa-1',
    })
    expect(primeira.reivindicado).toBe(true)
    expect(segunda.reivindicado).toBe(false)
    expect(segunda.eventoId).toBeUndefined()
  })

  it('mesmo messageid em instâncias diferentes NÃO colide (cenário exato do incidente com duas instâncias)', async () => {
    const instanciaA = await reivindicarEvento({
      supabase: fake.client as any,
      messageid: 'msg-mesmo-id',
      instanciaId: 'inst-a',
      tipoEvento: 'messages',
      empresaId: 'empresa-1',
    })
    const instanciaB = await reivindicarEvento({
      supabase: fake.client as any,
      messageid: 'msg-mesmo-id',
      instanciaId: 'inst-b',
      tipoEvento: 'messages',
      empresaId: 'empresa-1',
    })
    expect(instanciaA.reivindicado).toBe(true)
    expect(instanciaB.reivindicado).toBe(true)
  })

  it('mesmo messageid+instância com tipo_evento diferente NÃO colide', async () => {
    const comoMensagem = await reivindicarEvento({
      supabase: fake.client as any,
      messageid: 'msg-2',
      instanciaId: 'inst-a',
      tipoEvento: 'messages',
      empresaId: 'empresa-1',
    })
    const comoUpdate = await reivindicarEvento({
      supabase: fake.client as any,
      messageid: 'msg-2',
      instanciaId: 'inst-a',
      tipoEvento: 'messages_update',
      empresaId: 'empresa-1',
    })
    expect(comoMensagem.reivindicado).toBe(true)
    expect(comoUpdate.reivindicado).toBe(true)
  })

  it('concorrência: N requisições simultâneas com a mesma chave — exatamente uma reivindica', async () => {
    const chamadas = Array.from({ length: 10 }, () =>
      reivindicarEvento({
        supabase: fake.client as any,
        messageid: 'msg-concorrente',
        instanciaId: 'inst-a',
        tipoEvento: 'messages',
        empresaId: 'empresa-1',
      })
    )
    const resultados = await Promise.all(chamadas)
    const reivindicados = resultados.filter((r) => r.reivindicado)
    expect(reivindicados).toHaveLength(1)
    expect(resultados.filter((r) => !r.reivindicado)).toHaveLength(9)
  })

  it('apos reivindicar e marcar como falhou, uma segunda tentativa com a mesma chave nao reprocessa (sem retry automatico)', async () => {
    const primeira = await reivindicarEvento({
      supabase: fake.client as any,
      messageid: 'msg-falha-depois-retry',
      instanciaId: 'inst-a',
      tipoEvento: 'messages',
      empresaId: 'empresa-1',
    })
    expect(primeira.reivindicado).toBe(true)
    expect(primeira.eventoId).toBeDefined()

    await marcarEventoConcluido(fake.client as any, primeira.eventoId as string, false)
    expect(fake.updates).toContainEqual({ id: primeira.eventoId, status: 'falhou' })

    const segunda = await reivindicarEvento({
      supabase: fake.client as any,
      messageid: 'msg-falha-depois-retry',
      instanciaId: 'inst-a',
      tipoEvento: 'messages',
      empresaId: 'empresa-1',
    })
    expect(segunda.reivindicado).toBe(false)
    expect(segunda.eventoId).toBeUndefined()

    // Nem reivindicarEvento nem marcarEventoConcluido tem qualquer lógica de retry —
    // confirma que só existe UMA linha pra essa chave, mesmo após a falha: nada tentou
    // reprocessar ou recriar o evento automaticamente.
    expect(fake.linhas.size).toBe(1)
  })

  it('propaga erros que não são violação de constraint (não mascara falha real de banco)', async () => {
    const fakeComErro = {
      from() {
        return {
          insert() {
            return {
              select() {
                return {
                  async single() {
                    return { data: null, error: { code: '08006', message: 'connection failure' } }
                  },
                }
              },
            }
          },
        }
      },
    }
    await expect(
      reivindicarEvento({
        supabase: fakeComErro as any,
        messageid: 'msg-erro',
        instanciaId: 'inst-a',
        tipoEvento: 'messages',
        empresaId: 'empresa-1',
      })
    ).rejects.toMatchObject({ code: '08006' })
  })
})

describe('marcarEventoConcluido', () => {
  it('atualiza status para processado', async () => {
    const fake = criarFakeSupabase()
    const { eventoId } = await reivindicarEvento({
      supabase: fake.client as any,
      messageid: 'msg-3',
      instanciaId: 'inst-a',
      tipoEvento: 'messages',
      empresaId: 'empresa-1',
    })
    await marcarEventoConcluido(fake.client as any, eventoId as string, true)
    expect(fake.updates).toContainEqual({ id: eventoId, status: 'processado' })
  })

  it('atualiza status para falhou', async () => {
    const fake = criarFakeSupabase()
    const { eventoId } = await reivindicarEvento({
      supabase: fake.client as any,
      messageid: 'msg-4',
      instanciaId: 'inst-a',
      tipoEvento: 'messages',
      empresaId: 'empresa-1',
    })
    await marcarEventoConcluido(fake.client as any, eventoId as string, false)
    expect(fake.updates).toContainEqual({ id: eventoId, status: 'falhou' })
  })

  it('best-effort: não lança erro se o UPDATE falhar', async () => {
    const fakeComErroUpdate = {
      from() {
        return {
          update() {
            return {
              eq() {
                return Promise.resolve({ error: { message: 'timeout' } })
              },
            }
          },
        }
      },
    }
    await expect(
      marcarEventoConcluido(fakeComErroUpdate as any, 'evt-x', true)
    ).resolves.toBeUndefined()
  })
})
