import type { ResultadoCompleto } from '@/lib/simuladorFinanciamento/tipos'

interface ExecutarAcaoParams {
  resultado: ResultadoCompleto
  onSalvarAntesAcao?: (resultado: ResultadoCompleto) => Promise<void> | void
  onExecutarAcao?: (resultado: ResultadoCompleto) => Promise<void> | void
}

export async function executarAcaoComPersistencia({
  resultado,
  onSalvarAntesAcao,
  onExecutarAcao,
}: ExecutarAcaoParams) {
  if (onSalvarAntesAcao) {
    await onSalvarAntesAcao(resultado)
  }

  if (onExecutarAcao) {
    await onExecutarAcao(resultado)
  }
}

interface ImprimirSimulacaoParams {
  resultado: ResultadoCompleto
  onSalvarAntesImprimir?: (resultado: ResultadoCompleto) => Promise<void> | void
  gerarPdf?: (resultado: ResultadoCompleto) => Promise<void> | void
}

export async function imprimirSimulacaoComPersistencia({
  resultado,
  onSalvarAntesImprimir,
  gerarPdf,
}: ImprimirSimulacaoParams) {
  await executarAcaoComPersistencia({
    resultado,
    onSalvarAntesAcao: onSalvarAntesImprimir,
    onExecutarAcao: gerarPdf,
  })
}
