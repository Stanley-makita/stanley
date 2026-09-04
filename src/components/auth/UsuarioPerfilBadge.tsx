import { type UsuarioPerfil } from '@/types/auth'
import { Badge } from '@/components/ui/badge'

const CORES: Record<UsuarioPerfil, string> = {
  admin:       'bg-fonti-primary text-white',
  gerente:     'bg-fonti-accent text-fonti-primary',
  gestor:      'bg-fonti-accent text-fonti-primary',
  analista:    'bg-blue-100 text-blue-800',
  comercial:   'bg-green-100 text-green-800',
  operacional: 'bg-orange-100 text-orange-800',
  juridico:    'bg-purple-100 text-purple-800',
  apoio:       'bg-gray-100 text-gray-700',
  assistente:  'bg-amber-100 text-amber-800',
  consultor:   'bg-gray-100 text-gray-700',
  cliente:     'bg-purple-100 text-purple-800',
  customizado: 'bg-slate-100 text-slate-700',
}

const LABELS: Record<UsuarioPerfil, string> = {
  admin:       'Admin',
  gerente:     'Gerente',
  gestor:      'Gestor',
  analista:    'Analista',
  comercial:   'Comercial',
  operacional: 'Operacional',
  juridico:    'Jurídico',
  apoio:       'Apoio',
  assistente:  'Assistente',
  consultor:   'Consultor',
  cliente:     'Cliente',
  customizado: 'Personalizado',
}

interface Props {
  perfil: UsuarioPerfil
  /** Nome real do perfil customizado — obrigatório para exibir corretamente quando perfil === 'customizado'; sem ele, cai no label genérico "Personalizado". */
  nomeCustomizado?: string | null
}

export function UsuarioPerfilBadge({ perfil, nomeCustomizado }: Props) {
  const label = perfil === 'customizado' && nomeCustomizado ? nomeCustomizado : LABELS[perfil]
  return (
    <Badge className={`text-xs font-medium ${CORES[perfil]}`}>
      {label}
    </Badge>
  )
}
