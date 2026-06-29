import type { ResultadoCompleto } from '@/lib/simuladorFinanciamento/tipos'

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
  if (onSalvarAntesImprimir) {
    await onSalvarAntesImprimir(resultado)
  }

  if (gerarPdf) {
    await gerarPdf(resultado)
  }
}
