'use client'

import { useBancos } from '@/hooks/useBancos'
import { nomeBancoExibicao } from '@/lib/bancos/bancoDoCadastro'

// Nome do banco como está em Configurações › Bancos (texto antigo "Caixa Econômica Federal" → "Caixa").
export function NomeBanco({ texto }: { texto: string | null | undefined }) {
  const { data: bancos = [] } = useBancos()
  return <>{nomeBancoExibicao(texto, bancos)}</>
}
