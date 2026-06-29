import { describe, expect, it } from 'vitest'
import { buildTimelineSummary, getTimelineBadge } from '../timelineUtils'

describe('timelineUtils', () => {
  it('summarizes financing simulations with the best eligible bank', () => {
    const summary = buildTimelineSummary('simulacao', {
      tipo: 'financiamento',
      resultado_json: {
        bancos: [
          { elegivel: false, bancoNome: 'Banco A', primeiraParcela: 1000 },
          { elegivel: true, bancoNome: 'Banco B', primeiraParcela: 1500 },
        ],
      },
    })

    expect(summary).toContain('Banco B')
    expect(summary).toContain('R$')
    expect(summary).toContain('1.500')
  })

  it('marks document events with OCR state', () => {
    const badge = getTimelineBadge('documento', { ocr_status: 'concluido' })
    expect(badge).toBe('OCR concluído')
  })
})
