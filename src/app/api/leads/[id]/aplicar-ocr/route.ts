import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

async function resolveUsuario(token: string) {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, empresa_id')
    .eq('auth_user_id', user.id)
    .single()
  return usuario ?? null
}

interface CampoOcr {
  campo: string
  valor: string
  documento_id: string
  confirmado: boolean
}

const CAMPOS_PERMITIDOS = [
  'nome', 'cpf', 'rg', 'data_nascimento', 'orgao_emissor',
  'filiacao_mae', 'filiacao_pai', 'cidade_nascimento', 'estado_nascimento', 'data_emissao',
  'registro_cnh', 'validade_cnh', 'primeira_habilitacao_cnh',
  'estado_civil', 'regime_casamento', 'data_casamento',
  'endereco_rua', 'endereco_numero', 'endereco_bairro',
  'endereco_cidade', 'endereco_uf', 'endereco_cep',
]

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const leadId = params.id

  // Resolve pessoa_id do lead
  const { data: lead } = await supabase
    .from('leads')
    .select('pessoa_id')
    .eq('id', leadId)
    .eq('empresa_id', usuario.empresa_id)
    .maybeSingle()

  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
  if (!lead.pessoa_id) return NextResponse.json({ error: 'Lead sem pessoa vinculada' }, { status: 400 })

  const pessoaId = lead.pessoa_id

  const body = await request.json() as {
    campos: CampoOcr[]
    documento_ids_revisados: string[]
  }
  const { campos = [], documento_ids_revisados = [] } = body

  // Busca valores atuais da Pessoa para comparação
  const { data: pessoa } = await supabase
    .from('pessoas')
    .select(CAMPOS_PERMITIDOS.join(', '))
    .eq('id', pessoaId)
    .maybeSingle()

  if (!pessoa) return NextResponse.json({ error: 'Pessoa não encontrada' }, { status: 404 })

  const camposAplicados: string[] = []
  const valoresAnteriores: Record<string, unknown> = {}
  const valoresNovos: Record<string, unknown> = {}
  const CAMPOS_DATA = new Set(['data_nascimento', 'data_casamento', 'data_emissao', 'validade_cnh', 'primeira_habilitacao_cnh'])
  const ESTADO_CIVIL_VALIDOS = ['solteiro', 'casado', 'uniao_estavel', 'divorciado', 'viuvo']
  const DDMMYYYY_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/
  const YYYYMMDD_RE = /^\d{4}-\d{2}-\d{2}$/

  function normalizarValor(campo: string, valor: string): string | null {
    let s = valor.trim()
    if (campo === 'cpf') {
      s = s.replace(/\D/g, '')  // normaliza para apenas dígitos
      if (s.length !== 11) return null
    }
    if (campo === 'estado_civil' && !ESTADO_CIVIL_VALIDOS.includes(s)) return null
    if (CAMPOS_DATA.has(campo)) {
      const m = DDMMYYYY_RE.exec(s)
      if (m) return `${m[3]}-${m[2]}-${m[1]}`  // DD/MM/YYYY → YYYY-MM-DD
      if (!YYYYMMDD_RE.test(s)) return null
    }
    return s
  }

  let cpf_divergente = false

  for (const { campo, valor, confirmado } of campos) {
    if (!CAMPOS_PERMITIDOS.includes(campo)) continue
    if (!valor || typeof valor !== 'string') continue

    const valorNorm = normalizarValor(campo, valor)
    if (valorNorm === null) continue

    const valorAtual = (pessoa as unknown as Record<string, unknown>)[campo]
    const strAtual = valorAtual ? String(valorAtual).trim() : null

    // CPF divergente — nunca sobrescreve
    if (campo === 'cpf' && strAtual && strAtual !== valorNorm) {
      cpf_divergente = true
      continue
    }

    // Mesmo valor — skip
    if (strAtual && strAtual.toLowerCase() === valorNorm.toLowerCase()) continue

    // Campo vazio → aplica; campo diferente + confirmado → aplica; diferente + não confirmado → ignora
    if (!strAtual || confirmado) {
      valoresAnteriores[campo] = valorAtual ?? null
      valoresNovos[campo] = valorNorm
      camposAplicados.push(campo)
    }
  }

  // Aplica campos na Pessoa — CPF separado para isolar violação UNIQUE
  if (camposAplicados.length > 0) {
    const camposSemCpf = camposAplicados.filter(c => c !== 'cpf')
    const updateSemCpf: Record<string, unknown> = {}
    for (const c of camposSemCpf) updateSemCpf[c] = valoresNovos[c]

    if (camposSemCpf.length > 0) {
      const { error } = await supabase.from('pessoas').update(updateSemCpf).eq('id', pessoaId)
      if (error) {
        console.error('[aplicar-ocr] Erro ao atualizar pessoa:', error.message, '| campos:', camposSemCpf)
        return NextResponse.json({ error: 'Erro ao salvar dados', detail: error.message }, { status: 500 })
      }
    }

    // CPF: tenta separado — se falhar (UNIQUE), marca como divergente e segue
    if (camposAplicados.includes('cpf')) {
      const { error: errCpf } = await supabase.from('pessoas')
        .update({ cpf: valoresNovos['cpf'] })
        .eq('id', pessoaId)
      if (errCpf) {
        console.warn('[aplicar-ocr] CPF não salvo (possível conflito):', errCpf.message)
        cpf_divergente = true
        camposAplicados.splice(camposAplicados.indexOf('cpf'), 1)
      }
    }

    // Audit trail
    const documentoIds = Array.from(new Set(campos.filter(c => camposAplicados.includes(c.campo)).map(c => c.documento_id)))
    await supabase.from('pessoas_alteracoes').insert({
      pessoa_id:          pessoaId,
      empresa_id:         usuario.empresa_id,
      alterado_por:       usuario.id,
      origem:             'ocr',
      campos_alterados:   camposAplicados,
      valores_anteriores: valoresAnteriores,
      valores_novos:      {
        ...valoresNovos,
        documento_ids:       documentoIds,
        usuario_confirmacao: usuario.id,
        data_confirmacao:    new Date().toISOString(),
      },
    })
  }

  // Marca documentos como revisados
  if (documento_ids_revisados.length > 0) {
    await supabase
      .from('documentos')
      .update({ status_ocr: 'revisado' })
      .in('id', documento_ids_revisados)
      .eq('empresa_id', usuario.empresa_id)
  }

  return NextResponse.json({ ok: true, cpf_divergente, camposAplicados })
}
