/**
 * Incidente real (2026-09-25): 4 arquivos (2 JPGs de 1-2 MB) + `*salva processo 57` logo em
 * seguida — o comando rodou uma vez só, quando 2 arquivos ainda estavam subindo, e respondeu
 * "2 documentos vinculados". vincularComEspera continua tentando enquanto houver arquivo da
 * sessão chegado na conversa e ainda não gravado como documento.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/pessoa', () => ({ buscarOuCriarPessoa: vi.fn() }))
vi.mock('@/lib/workflows/workflow-captacao', () => ({ executarWorkflowCaptacao: vi.fn() }))

const semEspera = async () => {}

describe('vincularComEspera', () => {
  it('continua enquanto há arquivo pendente, mesmo com rodada vazia no meio', async () => {
    const { vincularComEspera } = await import('../fonti-comandos')
    const achados = [2, 0, 0, 2, 0]
    const pendentes = [2, 2, 0, 0, 0]
    let i = 0
    let j = 0
    const total = await vincularComEspera(
      async () => achados[i++] ?? 0,
      async () => pendentes[j++] ?? 0,
      semEspera,
    )
    expect(total).toBe(4)
  })

  it('para quando não acha nada novo e não há pendente (depois do mínimo de rodadas)', async () => {
    const { vincularComEspera } = await import('../fonti-comandos')
    const tentar = vi.fn(async () => 0)
    const total = await vincularComEspera(tentar, async () => 0, semEspera)
    expect(total).toBe(0)
    // 1ª tentativa + 2 rodadas mínimas: o download do arquivo pode ainda não ter
    // registrado a mensagem na conversa quando o comando chega.
    expect(tentar).toHaveBeenCalledTimes(3)
  })

  it('tem teto de tentativas mesmo com pendente eterno (arquivo que falhou ao gravar)', async () => {
    const { vincularComEspera } = await import('../fonti-comandos')
    const tentar = vi.fn(async () => 0)
    await vincularComEspera(tentar, async () => 1, semEspera)
    expect(tentar.mock.calls.length).toBeLessThanOrEqual(7)
  })
})
