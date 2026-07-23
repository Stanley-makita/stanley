'use client'

import { type ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { usePermissao } from '@/hooks/auth/usePermissao'
import { usePerfilPermissoes } from '@/hooks/auth/usePerfilPermissoes'
import { useAuth } from '@/hooks/auth/useAuth'
import { encontrarModuloPorRota } from '@/lib/auth/modulos'

/**
 * Ponto único de bloqueio de rota por perfil, substituindo a checagem
 * ad hoc que existia só em gestao/page.tsx. Resolve o módulo da rota atual
 * via o catálogo (src/lib/auth/modulos.ts) e checa pode(modulo.acaoVer).
 *
 * Rota não catalogada (ex.: /documentos, ainda um placeholder sem dados) —
 * deixa passar sem checar nada; exceção pontual e documentada, não uma
 * política geral de "não catalogado = liberado".
 *
 * Nunca decide "sem acesso" enquanto as permissões ainda estão carregando —
 * evita bloquear incorretamente por causa de uma consulta em andamento.
 */
export function RouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { pode } = usePermissao()
  const { carregando } = usePerfilPermissoes()
  const { saindo } = useAuth()

  const modulo = encontrarModuloPorRota(pathname)

  if (!modulo || carregando || saindo) {
    return <>{children}</>
  }

  if (pode(modulo.acaoVer)) {
    return <>{children}</>
  }

  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <ShieldAlert className="h-10 w-10 text-gray-300" />
      <p className="text-sm font-medium text-gray-700">
        Você não possui permissão para acessar este módulo.
      </p>
      <button
        onClick={() => router.push('/dashboard')}
        className="rounded-lg bg-fonti-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
      >
        Voltar ao Dashboard
      </button>
    </div>
  )
}
