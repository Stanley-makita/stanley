import { type UsuarioPerfil } from '@/types/auth'
import { Badge } from '@/components/ui/badge'

const CORES: Record<UsuarioPerfil, string> = {
  admin:     'bg-[#253B29] text-white',
  gerente:   'bg-[#C2AA6A] text-[#253B29]',
  analista:  'bg-blue-100 text-blue-800',
  consultor: 'bg-gray-100 text-gray-700',
  cliente:   'bg-purple-100 text-purple-800',
}

const LABELS: Record<UsuarioPerfil, string> = {
  admin:     'Admin',
  gerente:   'Gerente',
  analista:  'Analista',
  consultor: 'Consultor',
  cliente:   'Cliente',
}

interface Props {
  perfil: UsuarioPerfil
}

export function UsuarioPerfilBadge({ perfil }: Props) {
  return (
    <Badge className={`text-xs font-medium ${CORES[perfil]}`}>
      {LABELS[perfil]}
    </Badge>
  )
}