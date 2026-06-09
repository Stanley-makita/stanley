// Utilitários de formatação para preenchimento de formulários

export function fmtData(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  if (isNaN(d.getTime())) return iso
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export function fmtDataHoje(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export function fmtMoeda(v: number | null | undefined): string {
  if (v == null) return ''
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v)
}

export function fmtEstadoCivil(ec: string | null): string {
  const map: Record<string, string> = {
    solteiro:      'Solteiro(a)',
    casado:        'Casado(a)',
    uniao_estavel: 'União Estável',
    divorciado:    'Divorciado(a)',
    viuvo:         'Viúvo(a)',
  }
  return ec ? (map[ec] ?? ec) : ''
}

export function fmtRegimeCasamento(r: string | null): string {
  const map: Record<string, string> = {
    comunhao_parcial:   'Comunhão Parcial de Bens',
    comunhao_total:     'Comunhão Total de Bens',
    separacao_total:    'Separação Total de Bens',
    participacao_final: 'Participação Final nos Aquestos',
  }
  return r ? (map[r] ?? r) : ''
}

export function fmtCpf(cpf: string | null): string {
  if (!cpf) return ''
  const n = cpf.replace(/\D/g, '')
  if (n.length !== 11) return cpf
  return `${n.slice(0,3)}.${n.slice(3,6)}.${n.slice(6,9)}-${n.slice(9)}`
}

export function localPadrao(): string {
  return 'Maringá - PR'
}

export function anoExercicio(): string {
  return String(new Date().getFullYear())
}

export function anoCalendario(): string {
  return String(new Date().getFullYear() - 1)
}
