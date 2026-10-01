import { supabase } from '@/lib/supabase'

export interface CamposConjugeFormulario {
  nome: string
  cpf: string
  data_nascimento: string
  telefone: string
  profissao: string
  renda_formal: string
  renda_informal: string
}

/**
 * Casamento a partir de um formulário de Pessoa (gaveta Completar dados, página da Pessoa, Editar lead).
 * Substitui a gravação dos campos soltos conjuge_*: tudo vai pela rota POST /api/pessoas/[id]/conjuge
 * (serviço único de escrita, B2c). Regras:
 *  - deixou de ser casado e tinha cônjuge cadastrado → desfaz o casamento (dois lados);
 *  - casado com cônjuge cadastrado → atualiza estado civil/regime/data do casal;
 *  - casado sem cônjuge cadastrado e com nome digitado → cria/reaproveita o cônjuge e registra o casamento.
 * Encerrar o casamento de outra pessoa pede confirmação (window.confirm). Nunca lança: devolve a mensagem.
 */
export async function salvarCasamentoDoFormulario(p: {
  pessoaId: string
  casado: boolean
  estadoCivil: string
  conjugeCadastradoId: string | null
  regime: string | null
  data: string | null
  digitado?: CamposConjugeFormulario | null
}): Promise<{ ok: true } | { erro: string }> {
  let corpo: Record<string, unknown> | null = null
  const base = { estado_civil: p.estadoCivil, regime_casamento: p.regime, data_casamento: p.data }
  if (!p.casado) {
    if (p.conjugeCadastradoId) corpo = { conjuge_pessoa_id: null }
  } else if (p.conjugeCadastradoId) {
    corpo = { ...base, conjuge_pessoa_id: p.conjugeCadastradoId }
  } else if (p.digitado?.nome.trim()) {
    const d = p.digitado
    const num = (v: string) => (v ? Number(v) : null)
    corpo = {
      ...base,
      novo_conjuge: {
        nome: d.nome.trim(), cpf: d.cpf.replace(/\D/g, '') || null, data_nascimento: d.data_nascimento || null,
        telefone: d.telefone.trim() || null, profissao: d.profissao.trim() || null,
        renda_formal: num(d.renda_formal), renda_informal: num(d.renda_informal),
      },
    }
  }
  if (!corpo) return { ok: true }

  const enviar = async (extra: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/pessoas/${p.pessoaId}/conjuge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ ...corpo, ...extra }),
    })
    return { res, json: await res.json().catch(() => ({})) as { error?: string; encerra?: Array<{ nome: string }> } }
  }
  let { res, json } = await enviar({})
  if (res.status === 409) {
    const nomes = (json.encerra ?? []).map(x => x.nome).join(' e ')
    if (!window.confirm(`${nomes} já tem outro casamento registrado. Encerrar esse casamento e registrar este?`)) {
      return { erro: 'Casamento não registrado (cancelado).' }
    }
    ;({ res, json } = await enviar({ confirmar_encerrar: true }))
  }
  if (!res.ok) return { erro: json.error ?? 'Não foi possível salvar o casamento.' }
  return { ok: true }
}
