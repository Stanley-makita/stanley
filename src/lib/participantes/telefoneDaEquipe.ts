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
 * CPF recusado por já pertencer a outro cadastro (UNIQUE): avisa com o nome do dono e orienta a mesclar.
 * Achado real (01/10/2026, go-live): o OCR criou um cadastro duplicado com o CPF e o formulário engolia o erro
 * em silêncio — a equipe tentou salvar o CPF 8 vezes sem nenhuma mensagem.
 */
export async function avisarCpfDeOutroCadastro(cpf: string, pessoaId: string): Promise<void> {
  const { toast } = await import('sonner')
  const { data } = await supabase.from('pessoas').select('id, nome').eq('cpf', cpf).neq('id', pessoaId)
    .is('deleted_at', null).limit(1).maybeSingle()
  const dono = data?.nome ? `"${data.nome}"` : 'outro cadastro'
  toast.error(
    `CPF não salvo: ele já pertence a ${dono}. É a mesma pessoa? Abra o cadastro em Pessoas e use "Mesclar" para juntar os dois.`,
    { duration: 15000 },
  )
}
