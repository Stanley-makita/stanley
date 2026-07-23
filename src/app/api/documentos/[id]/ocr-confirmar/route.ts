import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { resolverPessoaConjuge } from '@/lib/pessoa'

async function resolveUsuario(token: string): Promise<{ empresa_id: string; usuario_id: string } | null> {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, empresa_id')
    .eq('auth_user_id', user.id)
    .single()
  if (!usuario) return null
  return { empresa_id: usuario.empresa_id, usuario_id: usuario.id }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const resolvido = await resolveUsuario(token)
  if (!resolvido) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { empresa_id, usuario_id } = resolvido

  const documentoId = params.id

  // Fase E (corte de leitura): lê do modelo unificado `documentos`/`extracoes_ocr`.
  // Sem fallback para a tabela antiga aqui — esta rota já exige pessoa_id resolvida
  // (400 abaixo), a mesma condição que impede a linha de existir em `documentos`.
  const { data: doc } = await supabase
    .from('documentos')
    .select('id, pessoa_id, ocr_status:status_ocr')
    .eq('id', documentoId)
    .eq('empresa_id', empresa_id)
    .maybeSingle()

  if (!doc) return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 })
  if (!doc.pessoa_id) return NextResponse.json({ error: 'Documento sem pessoa vinculada' }, { status: 400 })
  if (doc.ocr_status !== 'concluido') return NextResponse.json({ error: 'OCR não concluído' }, { status: 400 })

  const { data: extracaoVigente } = await supabase
    .from('extracoes_ocr')
    .select('dados, dados_validados')
    .eq('documento_id', documentoId)
    .eq('vigente', true)
    .maybeSingle()

  const body = await request.json() as {
    campos: Record<string, unknown>
    tipo_confirmado?: string
    titular?: 'principal' | 'conjuge'
  }
  const { campos, tipo_confirmado } = body
  const alvo = body.titular === 'conjuge' ? 'conjuge' : 'principal'

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

  // Se o documento foi marcado como sendo do cônjuge (não do titular), os
  // dados abaixo — Pessoa e pessoa_documentos_identificacao — vão todos pra
  // uma Pessoa própria do cônjuge, nunca pro titular (doc.pessoa_id).
  const pessoaId = alvo === 'conjuge'
    ? await resolverPessoaConjuge(
        empresa_id,
        doc.pessoa_id as string,
        (camposFiltrados['nome'] as string | undefined) ?? 'Cônjuge',
        camposFiltrados['cpf'] as string | undefined,
      )
    : (doc.pessoa_id as string)  // já validado acima (400 se null)

  // Salva todos os campos exceto CPF (para evitar que UNIQUE bloqueie tudo)
  const camposSemCpf = { ...camposFiltrados }
  delete camposSemCpf['cpf']

  if (Object.keys(camposSemCpf).length > 0) {
    const { error } = await supabase
      .from('pessoas')
      .update(camposSemCpf)
      .eq('id', pessoaId)

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
      .eq('id', pessoaId)
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

  type DocPayload = Record<string, string | null>

  // Upsert: insere novo ou atualiza no existente. O operador já revisou os
  // dados na tela de confirmação antes de clicar "Confirmar dados" — isso é
  // uma correção explícita e deliberada, então o valor confirmado sempre
  // prevalece, mesmo sobre um valor não-nulo já salvo (ex: de uma extração
  // anterior pior, com Haiku, antes da calibração desta sprint — sem isso o
  // valor ruim antigo ficava travado para sempre, já que reconfirmar nunca
  // conseguia corrigi-lo).
  async function upsertDocPessoa(
    tipo: string,
    dadosDoc: DocPayload,
    payloadOcr: Record<string, unknown> | null,
  ): Promise<void> {
    const { data: existente } = await supabase
      .from('pessoa_documentos_identificacao')
      .select('id')
      .eq('pessoa_id', pessoaId)
      .eq('tipo_documento', tipo)
      .maybeSingle()

    if (!existente) {
      await supabase.from('pessoa_documentos_identificacao').insert({
        empresa_id,
        pessoa_id:            pessoaId,
        tipo_documento:       tipo,
        payload_ocr:          payloadOcr,
        documento_cliente_id: documentoId,
        ...dadosDoc,
      })
    } else {
      const updates: Record<string, unknown> = { payload_ocr: payloadOcr }
      for (const [campo, valor] of Object.entries(dadosDoc)) {
        if (valor === null || valor === undefined) continue
        updates[campo] = valor
      }
      await supabase
        .from('pessoa_documentos_identificacao')
        .update(updates)
        .eq('id', existente.id)
    }
  }

  if (tipo_confirmado && TIPOS_DOCUMENTO_VALIDOS.includes(tipo_confirmado)) {
    const c = camposFiltrados as Record<string, string>
    // rg_orgao_emissor e rg_uf_emissor não passam por CAMPOS_PERMITIDOS
    // (não existem em pessoas), lê do body original
    const rawCampos = campos as Record<string, string>
    const payloadOcr = (extracaoVigente?.dados_validados ?? extracaoVigente?.dados ?? null) as Record<string, unknown> | null

    let novoDoc: DocPayload = {}

    if (tipo_confirmado === 'rg') {
      novoDoc = {
        numero:        c.rg            ?? null,
        orgao_emissor: c.orgao_emissor  ?? null,
        data_emissao:  c.data_emissao   ?? null,
      }
    } else if (tipo_confirmado === 'cnh') {
      novoDoc = {
        numero:                    c.registro_cnh              ?? null,
        orgao_emissor:             c.orgao_emissor             ?? null,
        data_emissao:              c.data_emissao              ?? null,
        data_validade:             c.validade_cnh              ?? null,
        data_primeira_habilitacao: c.primeira_habilitacao_cnh  ?? null,
      }
    } else if (tipo_confirmado === 'certidao_nascimento') {
      novoDoc = {
        cartorio:       c.orgao_emissor     ?? null,
        data_emissao:   c.data_emissao      ?? null,
        cidade_emissao: c.cidade_nascimento  ?? null,
        uf_emissao:     c.estado_nascimento  ?? null,
      }
    } else if (tipo_confirmado === 'certidao_casamento') {
      // data_casamento (data da cerimônia) ≠ data_emissao (data de emissão da certidão)
      novoDoc = {
        cartorio:     c.orgao_emissor ?? null,
        data_emissao: c.data_emissao  ?? null,
      }
    }

    await upsertDocPessoa(tipo_confirmado, novoDoc, payloadOcr)

    // Ao confirmar CNH: também popular card RG com dados do campo 4c (DOC.IDENTIDADE)
    if (tipo_confirmado === 'cnh') {
      const rgNumeroCnh   = c.rg                            ?? rawCampos.rg            ?? null
      const rgOrgao       = rawCampos.rg_orgao_emissor                                 ?? null
      const rgUf          = rawCampos.rg_uf_emissor                                    ?? null

      if (rgNumeroCnh || rgOrgao || rgUf) {
        const rgDocDaCnh: DocPayload = {
          numero:        rgNumeroCnh ?? null,
          orgao_emissor: rgOrgao     ?? null,
          uf_emissor:    rgUf        ?? null,
        }
        // payload_ocr do card RG vem do mesmo documento de CNH
        await upsertDocPessoa('rg', rgDocDaCnh, payloadOcr)
      }
    }
  }

  // Marca documento como revisado, atualizando classificacao se o usuário confirmou o tipo.
  // Se é do cônjuge, o documento passa a pertencer de fato à Pessoa do cônjuge
  // (não mais ao titular) — reflete a real dona da identidade no documento.
  await supabase
    .from('documentos')
    .update({
      status_ocr: 'revisado',
      ...(tipo_confirmado ? { classificacao_legado: tipo_confirmado } : {}),
      ...(alvo === 'conjuge' ? { pessoa_id: pessoaId } : {}),
    })
    .eq('id', documentoId)

  // Fase C (validação): operador confirmou os dados — promove a extração
  // vigente a "Validado". A partir daqui dados_validados é a fonte oficial.
  await supabase
    .from('extracoes_ocr')
    .update({
      validado_em: new Date().toISOString(),
      validado_por: usuario_id,
      dados_validados: { ...campos, tipo_confirmado: tipo_confirmado ?? null },
    })
    .eq('documento_id', documentoId)
    .eq('vigente', true)

  return NextResponse.json({
    ok: true,
    cpf_divergente,
    camposSalvos: Object.keys(camposFiltrados),
    pessoaId,
    alvo,
  })
}

// Ignora o documento (não salva dados mas marca como revisado)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const resolvido = await resolveUsuario(token)
  if (!resolvido) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  await supabase
    .from('documentos')
    .update({ status_ocr: 'ignorado' })
    .eq('id', params.id)
    .eq('empresa_id', resolvido.empresa_id)

  return NextResponse.json({ ok: true })
}
