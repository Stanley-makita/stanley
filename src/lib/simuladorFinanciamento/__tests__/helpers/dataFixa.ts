import { afterAll, beforeAll, vi } from 'vitest'

/**
 * O simulador calcula idade e prazo máximo pela data de HOJE (hojeEmSaoPaulo). Casos-âncora e snapshots foram
 * conferidos numa data específica — sem fixar, a virada do mês muda a idade em meses e quebra os testes
 * (achado real: 01/10/2026, 18 testes passaram a falhar sem nenhuma mudança no código).
 * Chamar no topo do arquivo (vale para todos os testes dele) ou dentro de um describe, passando `voltarPara`
 * com a data do arquivo para restaurar depois do grupo.
 */
export function fixarHoje(dataISO: string, voltarPara?: string) {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${dataISO}T12:00:00-03:00`))
  })
  afterAll(() => {
    if (voltarPara) vi.setSystemTime(new Date(`${voltarPara}T12:00:00-03:00`))
    else vi.useRealTimers()
  })
}
