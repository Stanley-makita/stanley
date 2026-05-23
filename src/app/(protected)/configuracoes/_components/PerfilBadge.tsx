import { Badge } from '@/components/ui/badge'
import { PERFIL_LABELS, PERFIL_CORES } from '@/types/configuracoes'
import type { UsuarioPerfil } from '@/types/configuracoes'

export function PerfilBadge({ perfil }: { perfil: UsuarioPerfil }) {
  return (
    <Badge className={`text-xs font-medium ${PERFIL_CORES[perfil]}`}>
      {PERFIL_LABELS[perfil]}
    </Badge>
  )
}