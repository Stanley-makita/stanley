import { cpfValido } from '@/lib/cpf'

type Participante = { pessoaId: string; nome: string; cpf: string | null }

export type SugestaoDono =
  | { tipo: 'participante'; pessoaId: string; motivo: 'cpf' | 'nome' | 'nome_parecido' | 'dono_atual' }
  | { tipo: 'novo' }

const normalizarNome = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])

function distancia(a: string, b: string): number {
  const linha = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0]
    linha[0] = i
    for (let j = 1; j <= b.length; j++) {
      const guardado = linha[j]
      linha[j] = Math.min(linha[j] + 1, linha[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1))
      anterior = guardado
    }
  }
  return linha[b.length]
}

/**
 * Mesmo nome com erro de digitação ou abreviação — achado real (01/10/2026): RG "ANDRÉ LUIZ DE OLIVEIRA COPPULA"
 * x lead "ANDRE LUIZ DE OLIVEIRA COPULLA" não batia e virou cadastro duplicado. Parecido = mesmo 1º nome e
 * (até 2 letras de diferença por nome, com o mesmo número de nomes; ou todos os nomes do mais curto — 2+ —
 * presentes no mais longo, ex.: "Maria Souza" x "Maria Aparecida Souza"). Partículas (de/da/dos…) não contam.
 */
export function nomesParecidos(a: string, b: string): boolean {
  const na = normalizarNome(a), nb = normalizarNome(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const ta = na.split(' ').filter(t => !PARTICULAS.has(t))
  const tb = nb.split(' ').filter(t => !PARTICULAS.has(t))
  if (!ta.length || !tb.length || ta[0] !== tb[0]) return false
  if (ta.length === tb.length) {
    const diferentes = ta.map((t, i) => distancia(t, tb[i])).filter(d => d > 0)
    const total = diferentes.reduce((s, d) => s + d, 0)
    if (total <= 2 && diferentes.length <= 2) return true
  }
  const [curto, longo] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  return curto.length >= 2 && curto.every(t => longo.includes(t))
}

/**
 * "De quem é este documento?" (spec §3): CPF extraído válido = participante → esse; senão nome igual (sem
 * acento/caixa) → esse, se o participante não tiver outro CPF; senão nome PARECIDO de participante sem outro CPF
 * → esse (motivo 'nome_parecido' — a tela pede para conferir); havia CPF ou nome e nada bateu → novo participante;
 * documento sem dado de identificação (ex.: comprovante de endereço) → dono atual (ou o 1º participante).
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
    const semOutroCpf = (x: Participante) => !temCpf || !(x.cpf ?? '').replace(/\D/g, '')
    const igual = participantes.find(x => normalizarNome(x.nome) === nome && semOutroCpf(x))
    if (igual) return { tipo: 'participante', pessoaId: igual.pessoaId, motivo: 'nome' }
    const parecido = participantes.find(x => nomesParecidos(x.nome, nome) && semOutroCpf(x))
    if (parecido) return { tipo: 'participante', pessoaId: parecido.pessoaId, motivo: 'nome_parecido' }
  }
  if (temCpf || nome) return { tipo: 'novo' }
  const dono = participantes.find(x => x.pessoaId === donoAtualId) ?? participantes[0]
  return dono ? { tipo: 'participante', pessoaId: dono.pessoaId, motivo: 'dono_atual' } : { tipo: 'novo' }
}

/** Participante com nome parecido e sem outro CPF — para avisar antes de criar um cadastro novo. */
export function participanteParecido(nome: string, cpf: string | null | undefined, participantes: Participante[]): Participante | null {
  const doc = (cpf ?? '').replace(/\D/g, '')
  return participantes.find(x => nomesParecidos(x.nome, nome)
    && (!doc || !(x.cpf ?? '').replace(/\D/g, '') || (x.cpf ?? '').replace(/\D/g, '') === doc)) ?? null
}
