import { describe, it, expect } from 'vitest'
import { formatarDataHistorico } from '../dataHistorico'

const agora = new Date(2026, 9, 20, 16, 0)

describe('formatarDataHistorico', () => {
  it('data, hora e dias corridos', () => {
    expect(formatarDataHistorico(new Date(2026, 9, 14, 14, 0).toISOString(), agora)).toBe('14/10/2026 14:00 · 6 dias')
  })
  it('hoje e 1 dia', () => {
    expect(formatarDataHistorico(new Date(2026, 9, 20, 9, 5).toISOString(), agora)).toBe('20/10/2026 09:05 · hoje')
    expect(formatarDataHistorico(new Date(2026, 9, 19, 23, 0).toISOString(), agora)).toBe('19/10/2026 23:00 · 1 dia')
  })
})
