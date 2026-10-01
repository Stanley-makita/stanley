import { cpfValido } from '@/lib/cpf'

type Participante = { pessoaId: string; nome: string; cpf: string | null }

export type SugestaoDono =
  | { tipo: 'participante'; pessoaId: string; motivo: 'cpf' | 'nome' | 'dono_atual' }
  | { tipo: 'novo' }

const normalizarNome = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * "De quem é este documento?" (spec §3): CPF extraído válido = participante → esse; senão nome igual
 * (sem acento/caixa) → esse, se o participante não tiver outro CPF; havia CPF ou nome e nada bateu → novo participante; documento
 * sem dado de identificação (ex.: comprovante de endereço) → dono atual (ou o 1º participante).
 */
export function sugerirDonoDocumento(
  extraido: { cpf?: string | null; nome?: string | null },
  participantes: Participante[],
  donoAtualId: string | null,
): SugestaoDono {
  const cpf = (extraido.cpf ?? '').replace(/\D/g, '')
  const temCpf = cpfValido(cpf)
  if (temCpf) {
    const p = participantes.find(x => (x.cpf ?? '').replace(/\D/g, '') === cpf)
    if (p) return { tipo: 'participante', pessoaId: p.pessoaId, motivo: 'cpf' }
  }
  // Nome: sem CPF no documento, qualquer participante; com CPF que ninguém tem, só participante
  // ainda SEM CPF cadastrado (ex.: criado só com o nome) — um CPF diferente é outra pessoa.
  const nome = normalizarNome(extraido.nome ?? '')
  if (nome) {
    const p = participantes.find(x => normalizarNome(x.nome) === nome
      && (!temCpf || !(x.cpf ?? '').replace(/\D/g, '')))
    if (p) return { tipo: 'participante', pessoaId: p.pessoaId, motivo: 'nome' }
  }
  if (temCpf || nome) return { tipo: 'novo' }
  const dono = participantes.find(x => x.pessoaId === donoAtualId) ?? participantes[0]
  return dono ? { tipo: 'participante', pessoaId: dono.pessoaId, motivo: 'dono_atual' } : { tipo: 'novo' }
}
