import type { ModalidadeProcesso } from '@/types/processos'

// Modalidades de financiamento que disparam criação de Registro ao chegar em "emitido".
export const FINANCIAMENTO_MODALIDADES = new Set<ModalidadeProcesso>(['SFI', 'SBPE', 'PMCMV', 'Pro_Cotista', 'CGI'])

// Mapeamento modalidade → módulo de fases (tabela `fases`, coluna `modulo`).
export const MODULO_POR_MODALIDADE: Record<ModalidadeProcesso, string> = {
  SFI:         'processos',
  SBPE:        'processos',
  PMCMV:       'processos',
  Pro_Cotista: 'processos',
  CGI:         'processos',
  Consorcio:   'consorcio',
  Contrato:    'contrato',
  Registro:    'registro',
}
