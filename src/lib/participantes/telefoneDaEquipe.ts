import { supabase } from '@/lib/supabase'
import { telefoneCanonico } from '@/lib/telefone'

/**
 * Nome do usuário ativo da equipe dono deste telefone, ou null. Cadastro de cliente com telefone da equipe
 * e SEM CPF válido é tratado como cadastro do comercial e não entra em proposta (pessoa_e_de_operador,
 * migration 334) — por isso os formulários perguntam antes de gravar.
 */
export async function usuarioDoTelefone(empresaId: string, telefone: string): Promise<string | null> {
  const alvo = telefone.replace(/\D/g, '')
  if (alvo.length < 10) return null
  const { data, error } = await supabase.from('usuarios').select('nome, telefone, telefone_whatsapp')
    .eq('empresa_id', empresaId).eq('ativo', true)
  if (error || !data) return null
  const canonico = telefoneCanonico(alvo)
  const dono = data.find(u => [u.telefone, u.telefone_whatsapp]
    .some(t => t && t.replace(/\D/g, '').length >= 10 && telefoneCanonico(t) === canonico))
  return (dono?.nome as string | undefined) ?? null
}

/** Pergunta antes de gravar telefone da equipe num cadastro de cliente. false = usuário desistiu. */
export async function confirmarTelefoneDaEquipe(empresaId: string, telefone: string, telefoneAnterior: string | null | undefined): Promise<boolean> {
  if (!telefone.trim() || telefone.replace(/\D/g, '') === (telefoneAnterior ?? '').replace(/\D/g, '')) return true
  const dono = await usuarioDoTelefone(empresaId, telefone)
  if (!dono) return true
  return window.confirm(
    `Esse telefone é de ${dono}, usuário da equipe.\n\n` +
    'Se esta pessoa não for o próprio usuário (ou não tiver CPF cadastrado), ela deixa de aparecer como participante das propostas.\n\n' +
    'Salvar mesmo assim?',
  )
}

/**
 * CPF recusado por já pertencer a outro cadastro (UNIQUE). Se o outro é um duplicado solto (nome parecido,
 * fora de qualquer lead/negócio), pergunta e junta os dois neste cadastro (/api/pessoas/[id]/trazer-cpf);
 * senão avisa com o nome do dono. true = o CPF ficou gravado neste cadastro.
 * Achados reais: 01/10/2026 (o formulário engolia o erro em silêncio) e 23–27/10/2026 (o OCR criava o
 * duplicado com o CPF e o comercial/operacional, sem permissão de Mesclar, não tinha como resolver).
 */
export async function resolverCpfDeOutroCadastro(cpf: string, pessoaId: string): Promise<boolean> {
  const { toast } = await import('sonner')
  const { data: sessao } = await supabase.auth.getSession()
  const token = sessao.session?.access_token
  const rota = `/api/pessoas/${pessoaId}/trazer-cpf`
  const headers = { Authorization: `Bearer ${token ?? ''}`, 'Content-Type': 'application/json' }

  const res = await fetch(`${rota}?cpf=${encodeURIComponent(cpf)}`, { headers }).catch(() => null)
  const info = res?.ok
    ? await res.json().catch(() => null) as { dono: { nome: string } | null; pode_juntar: boolean; motivo: string | null } | null
    : null
  const dono = info?.dono?.nome ? `"${info.dono.nome}"` : 'outro cadastro'

  if (info?.pode_juntar) {
    const juntar = window.confirm(
      `Esse CPF já está em outro cadastro: ${dono}, que não está em nenhum lead ou negócio (cadastro duplicado).\n\n` +
      'Juntar os dois neste cadastro? Documentos e dados do outro passam para cá e ele deixa de existir.',
    )
    if (!juntar) {
      toast.info('CPF não salvo. O outro cadastro continua com ele.')
      return false
    }
    const r = await fetch(rota, { method: 'POST', headers, body: JSON.stringify({ cpf }) }).catch(() => null)
    if (r?.ok) {
      toast.success(`Cadastros juntados. CPF salvo.`)
      return true
    }
    const err = await r?.json().catch(() => null) as { error?: string } | null
    toast.error(err?.error ?? 'Não foi possível juntar os cadastros.', { duration: 15000 })
    return false
  }

  toast.error(
    info?.motivo === 'nome_diferente'
      ? `CPF não salvo: ele já pertence a ${dono}, com outro nome. Confira o CPF digitado.`
      : `CPF não salvo: ele já pertence a ${dono}. É a mesma pessoa? Abra o cadastro em Pessoas e use "Mesclar" para juntar os dois.`,
    { duration: 15000 },
  )
  return false
}
