import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function resolveEmpresa(token: string): Promise<string | null> {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('auth_user_id', user.id)
    .single()
  return usuario?.empresa_id ?? null
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const empresa_id = await resolveEmpresa(token)
  if (!empresa_id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const documentoId = params.id

  // Busca o documento e confirma que pertence à empresa e tem OCR pronto
  const { data: doc } = await supabase
    .from('documentos_clientes')
    .select('id, pessoa_id, ocr_dados, ocr_status')
    .eq('id', documentoId)
    .eq('empresa_id', empresa_id)
    .maybeSingle()

  if (!doc) return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 })
  if (!doc.pessoa_id) return NextResponse.json({ error: 'Documento sem pessoa vinculada' }, { status: 400 })
  if (doc.ocr_status !== 'concluido') return NextResponse.json({ error: 'OCR não concluído' }, { status: 400 })

  const body = await request.json() as { campos: Record<string, unknown>; tipo_confirmado?: string }
  const { campos, tipo_confirmado } = body

  // Campos permitidos para atualização na pessoa
  const CAMPOS_PERMITIDOS = [
    'nome', 'cpf', 'rg', 'data_nascimento', 'data_emissao', 'orgao_emissor',
    'filiacao_mae', 'filiacao_pai', 'cidade_nascimento', 'estado_nascimento', 'estado_civil',
    'regime_casamento', 'data_casamento',
    'endereco_rua', 'endereco_numero', 'endereco_bairro',
    'endereco_cidade', 'endereco_uf', 'endereco_cep',
    'registro_cnh', 'validade_cnh', 'primeira_habilitacao_cnh',
  ]

  const ESTADO_CIVIL_VALIDOS = ['solteiro', 'casado', 'uniao_estavel', 'divorciado', 'viuvo']
  const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/
  const DATA_FIELDS = ['data_nascimento', 'data_casamento', 'data_emissao', 'validade_cnh', 'primeira_habilitacao_cnh']

  const camposFiltrados: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(campos)) {
    if (!CAMPOS_PERMITIDOS.includes(k)) continue
    if (v === null || v === undefined || v === '') continue
    let s = String(v).trim()
    // Validações por campo para evitar rejeição no banco
    if (k === 'cpf') {
      s = s.replace(/\D/g, '')  // normaliza para apenas dígitos
      if (s.length !== 11) continue
    }
    if (DATA_FIELDS.includes(k) && !DATA_REGEX.test(s)) continue
    if (k === 'estado_civil' && !ESTADO_CIVIL_VALIDOS.includes(s)) continue
    camposFiltrados[k] = s
  }

  // Salva todos os campos exceto CPF (para evitar que UNIQUE bloqueie tudo)
  const camposSemCpf = { ...camposFiltrados }
  delete camposSemCpf['cpf']

  if (Object.keys(camposSemCpf).length > 0) {
    const { error } = await supabase
      .from('pessoas')
      .update(camposSemCpf)
      .eq('id', doc.pessoa_id)

    if (error) {
      console.error('[ocr-confirmar] Erro ao atualizar pessoa:', error.message, '| campos:', Object.keys(camposSemCpf))
      return NextResponse.json({ error: 'Erro ao salvar dados', detail: error.message }, { status: 500 })
    }
  }

  // CPF separado: se violar UNIQUE (pertence a outra pessoa), ignora graciosamente
  let cpf_divergente = false
  if (camposFiltrados['cpf']) {
    const { error: errCpf } = await supabase
      .from('pessoas')
      .update({ cpf: camposFiltrados['cpf'] })
      .eq('id', doc.pessoa_id)
    if (errCpf) {
      console.warn('[ocr-confirmar] CPF não salvo (conflito UNIQUE):', errCpf.message)
      cpf_divergente = true
    }
  }

  // ── Gravar em pessoa_documentos_identificacao ─────────────────────────────

  const TIPOS_DOCUMENTO_VALIDOS = [
    'rg', 'cnh', 'cpf', 'certidao_nascimento', 'certidao_casamento',
    'passaporte', 'rne', 'outro',
  ]

  const camposNaoAplicados: string[] = []

  if (tipo_confirmado && TIPOS_DOCUMENTO_VALIDOS.includes(tipo_confirmado)) {
    // Monta payload para a nova tabela conforme tipo
    type DocPayload = {
      numero?: string | null
      orgao_emissor?: string | null
      uf_emissor?: string | null
      data_emissao?: string | null
      data_validade?: string | null
      data_primeira_habilitacao?: string | null
      cartorio?: string | null
      cidade_emissao?: string | null
      uf_emissao?: string | null
    }

    const c = camposFiltrados as Record<string, string>
    let novoDoc: DocPayload = {}

    if (tipo_confirmado === 'rg') {
      novoDoc = {
        numero:        c.rg          ?? null,
        orgao_emissor: c.orgao_emissor ?? null,
        data_emissao:  c.data_emissao  ?? null,
      }
    } else if (tipo_confirmado === 'cnh') {
      novoDoc = {
        numero:                   c.registro_cnh             ?? null,
        orgao_emissor:            c.orgao_emissor            ?? null,
        data_emissao:             c.data_emissao             ?? null,
        data_validade:            c.validade_cnh             ?? null,
        data_primeira_habilitacao: c.primeira_habilitacao_cnh ?? null,
      }
    } else if (tipo_confirmado === 'certidao_nascimento') {
      // orgao_emissor vira cartório na certidão
      // data_emissao = data de emissão da certidão (diferente do data_nascimento da pessoa)
      // cidade_nascimento/estado_nascimento = local de emissão
      novoDoc = {
        cartorio:      c.orgao_emissor    ?? null,
        data_emissao:  c.data_emissao     ?? null,
        cidade_emissao: c.cidade_nascimento ?? null,
        uf_emissao:    c.estado_nascimento  ?? null,
      }
    } else if (tipo_confirmado === 'certidao_casamento') {
      // data_casamento (data da cerimônia) ≠ data_emissao (data de emissão da certidão)
      // data_casamento vai para pessoas.data_casamento (já salvo acima)
      // data_emissao só é preenchida se o OCR trouxer explicitamente
      novoDoc = {
        cartorio:     c.orgao_emissor ?? null,
        data_emissao: c.data_emissao   ?? null, // null se OCR não extraiu emissão da certidão
      }
    }

    const payloadOcr = doc.ocr_dados as Record<string, unknown> | null

    // Buscar documento existente do mesmo tipo para essa pessoa
    const { data: docExistente } = await supabase
      .from('pessoa_documentos_identificacao')
      .select('*')
      .eq('pessoa_id', doc.pessoa_id)
      .eq('tipo_documento', tipo_confirmado)
      .maybeSingle()

    if (!docExistente) {
      // Inserir documento novo
      await supabase
        .from('pessoa_documentos_identificacao')
        .insert({
          empresa_id:           empresa_id,
          pessoa_id:            doc.pessoa_id,
          tipo_documento:       tipo_confirmado,
          payload_ocr:          payloadOcr,
          documento_cliente_id: documentoId,
          ...novoDoc,
        })
    } else {
      // Atualizar apenas campos null — não sobrescrever campos preenchidos divergentes
      const updates: Record<string, unknown> = { payload_ocr: payloadOcr }

      for (const [campo, valor] of Object.entries(novoDoc)) {
        if (valor === null || valor === undefined) continue
        const existente = (docExistente as Record<string, unknown>)[campo]
        if (existente === null || existente === undefined) {
          updates[campo] = valor
        } else if (existente !== valor) {
          camposNaoAplicados.push(campo)
        }
      }

      if (Object.keys(updates).length > 0) {
        await supabase
          .from('pessoa_documentos_identificacao')
          .update(updates)
          .eq('id', docExistente.id)
      }
    }
  }

  // Marca documento como revisado, atualizando classificacao se o usuário confirmou o tipo
  await supabase
    .from('documentos_clientes')
    .update({
      ocr_status: 'revisado',
      ...(tipo_confirmado ? { classificacao: tipo_confirmado } : {}),
    })
    .eq('id', documentoId)

  return NextResponse.json({
    ok: true,
    cpf_divergente,
    camposSalvos: Object.keys(camposFiltrados),
    ...(camposNaoAplicados.length > 0 ? { camposNaoAplicados } : {}),
  })
}

// Ignora o documento (não salva dados mas marca como revisado)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const empresa_id = await resolveEmpresa(token)
  if (!empresa_id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  await supabase
    .from('documentos_clientes')
    .update({ ocr_status: 'ignorado' })
    .eq('id', params.id)
    .eq('empresa_id', empresa_id)

  return NextResponse.json({ ok: true })
}
