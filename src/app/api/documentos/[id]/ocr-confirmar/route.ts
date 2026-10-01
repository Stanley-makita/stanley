import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { resolverPessoaConjuge } from '@/lib/pessoa'
import { cpfValido } from '@/lib/cpf'
import { podeServidor } from '@/lib/auth/resolverPermissaoServidor'
import { autenticarRota, clienteDoUsuario } from '@/lib/documentos/vinculosServidor'
import { normalizarRegime, registrarCasamento } from '@/lib/participantes/casamentoServidor'

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
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx
  const { token } = ctx
  const empresa_id = ctx.usuario.empresa_id
  const usuario_id = ctx.usuario.id

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
    /** V2: "De quem é este documento?" — participante escolhido (Pessoa visível ao usuário). */
    pessoa_alvo_id?: string
    /** V2: "Novo participante" — reaproveita a Pessoa pelo CPF ou cria; inclui no lead. */
    novo_participante?: { nome?: string; cpf?: string }
    lead_id?: string
    /** V2: certidão de casamento — com quem a Pessoa alvo é casada (participante/Pessoa existente ou nova). */
    casamento?: { conjuge_pessoa_id?: string; novo?: { nome?: string; cpf?: string } }
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
  let cpf_invalido = false
  for (const [k, v] of Object.entries(campos)) {
    if (!CAMPOS_PERMITIDOS.includes(k)) continue
    if (v === null || v === undefined || v === '') continue
    let s = String(v).trim()
    // Validações por campo para evitar rejeição no banco
    if (k === 'cpf') {
      s = s.replace(/\D/g, '')  // normaliza para apenas dígitos
      // Dígito verificador: OCR que leu um dígito errado não pode gravar CPF inexistente
      if (!cpfValido(s)) { cpf_invalido = true; continue }
    }
    if (DATA_FIELDS.includes(k) && !DATA_REGEX.test(s)) continue
    if (k === 'estado_civil' && !ESTADO_CIVIL_VALIDOS.includes(s)) continue
    if (k === 'regime_casamento') {
      const regime = normalizarRegime(s)  // OCR devolve comunhao_universal; o cadastro usa comunhao_total
      if (!regime) continue
      s = regime
    }
    camposFiltrados[k] = s
  }

  // Reaproveita a Pessoa pelo CPF (válido) ou cria só com o nome. Invariante 1 do CLAUDE.md: Pessoa de
  // usuário interno nunca vira participante, cônjuge de cliente nem dona de documento de cliente.
  async function pessoaPorCpfOuNova(nome: string, cpfBruto: string | undefined): Promise<{ id: string } | { erro: string; status: number }> {
    const cpf = (cpfBruto ?? '').replace(/\D/g, '')
    if (cpfValido(cpf)) {
      const { data: existente, error: eEx } = await supabase.from('pessoas').select('id')
        .eq('empresa_id', empresa_id).eq('cpf', cpf).is('deleted_at', null).maybeSingle()
      if (eEx) return { erro: 'Erro ao buscar a pessoa pelo CPF.', status: 500 }
      if (existente?.id) {
        const { data: ehOperador, error: eOp } = await supabase.rpc('pessoa_e_de_operador', { p_pessoa_id: existente.id })
        if (eOp) return { erro: 'Erro ao verificar a pessoa.', status: 500 }
        if (ehOperador) return { erro: 'Esse CPF pertence ao cadastro de um usuário da equipe — não pode ser usado aqui.', status: 422 }
        return { id: existente.id as string }
      }
    }
    const novoId = crypto.randomUUID()
    const { error: eNova } = await supabase.from('pessoas').insert({
      id: novoId, empresa_id, nome, tipo: 'cliente', ...(cpfValido(cpf) ? { cpf } : {}),
    })
    if (eNova) return { erro: 'Não foi possível criar a pessoa.', status: 500 }
    return { id: novoId }
  }

  // Pessoa que recebe os dados (e passa a ser a dona do documento). Ordem: participante escolhido
  // ("De quem é este documento?") → novo participante → cônjuge (caminho antigo) → dono atual.
  let pessoaId: string
  if (body.pessoa_alvo_id) {
    const { data: visivel, error: eVis } = await clienteDoUsuario(token)
      .from('pessoas').select('id').eq('id', body.pessoa_alvo_id).is('deleted_at', null).maybeSingle()
    if (eVis) return NextResponse.json({ error: 'Erro ao verificar a pessoa escolhida.' }, { status: 500 })
    if (!visivel) return NextResponse.json({ error: 'Pessoa escolhida não encontrada.' }, { status: 404 })
    pessoaId = body.pessoa_alvo_id
  } else if (body.novo_participante) {
    const nomeNovo = (body.novo_participante.nome ?? '').trim()
    if (!nomeNovo || !body.lead_id) {
      return NextResponse.json({ error: 'Informe o nome do novo participante.' }, { status: 422 })
    }
    if (!(await podeServidor(usuario_id, ctx.usuario.perfil, empresa_id, 'leads.editar'))) {
      return NextResponse.json({ error: 'Sem permissão para incluir participante neste lead.' }, { status: 403 })
    }
    const { data: leadVisivel, error: eLead } = await clienteDoUsuario(token)
      .from('leads').select('id, pessoa_id').eq('id', body.lead_id).is('deleted_at', null).maybeSingle()
    if (eLead) return NextResponse.json({ error: 'Erro ao verificar o lead.' }, { status: 500 })
    if (!leadVisivel) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 })

    const resolvida = await pessoaPorCpfOuNova(nomeNovo, body.novo_participante.cpf)
    if ('erro' in resolvida) return NextResponse.json({ error: resolvida.erro }, { status: resolvida.status })
    const alvoId = resolvida.id
    if (alvoId !== leadVisivel.pessoa_id) {
      const { error: eCop } = await supabase.from('lead_coparticipantes')
        .insert({ empresa_id, lead_id: body.lead_id, pessoa_id: alvoId })
      if (eCop && eCop.code !== '23505') {
        return NextResponse.json({ error: 'Não foi possível incluir o participante.', detail: eCop.message }, { status: 500 })
      }
    }
    pessoaId = alvoId
  } else if (alvo === 'conjuge') {
    // Caminho antigo (antes do "De quem é"): Pessoa própria do cônjuge do dono atual.
    pessoaId = await resolverPessoaConjuge(
      empresa_id,
      doc.pessoa_id as string,
      (camposFiltrados['nome'] as string | undefined) ?? 'Cônjuge',
      camposFiltrados['cpf'] as string | undefined,
    )
  } else {
    pessoaId = doc.pessoa_id as string  // já validado acima (400 se null)
  }
  const mudouDono = pessoaId !== doc.pessoa_id

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

  // CPF separado: se violar UNIQUE (pertence a outra pessoa), não salva o CPF mas
  // devolve QUEM é o dono, pra tela avisar de forma clara — antes só saía um toast
  // verde de "sucesso" e o CPF antigo (ex: telefone capturado no *cria cliente)
  // continuava no cadastro sem ninguém perceber (achado real, 2026-09-24).
  let cpf_divergente = false
  let cpf_pertence_a: { id: string; nome: string | null } | null = null
  let cpfSalvo = false
  if (camposFiltrados['cpf']) {
    const { error: errCpf } = await supabase
      .from('pessoas')
      .update({ cpf: camposFiltrados['cpf'] })
      .eq('id', pessoaId)
    if (errCpf) {
      console.warn('[ocr-confirmar] CPF não salvo (conflito UNIQUE):', errCpf.message)
      cpf_divergente = true
      const { data: dono } = await supabase
        .from('pessoas')
        .select('id, nome')
        .eq('empresa_id', empresa_id)
        .eq('cpf', camposFiltrados['cpf'] as string)
        .is('deleted_at', null)
        .neq('id', pessoaId)
        .limit(1)
        .maybeSingle()
      cpf_pertence_a = dono ?? null
    } else {
      cpfSalvo = true
    }
  }

  // Espelha no Lead os campos que ele duplica da Pessoa (nome/cpf/data_nascimento) —
  // o sidebar de Captação e o gate de Formulários leem de `leads`, não de `pessoas`.
  // Mesmo espelhamento que /api/leads/[id]/aplicar-ocr já fazia; esta rota não fazia,
  // e o lado esquerdo da tela ficava com o dado do *cria cliente pra sempre, mesmo
  // após refresh (achado real, 2026-09-24). `.eq('pessoa_id', pessoaId)` só atinge leads onde a
  // Pessoa alvo é a titular — dado de coparticipante/cônjuge nunca vai para o lead de outro.
  {
    const updateLead: Record<string, unknown> = {}
    if (camposFiltrados['nome']) updateLead.nome = camposFiltrados['nome']
    if (camposFiltrados['data_nascimento']) updateLead.data_nascimento = camposFiltrados['data_nascimento']
    if (cpfSalvo) updateLead.cpf = camposFiltrados['cpf']
    if (Object.keys(updateLead).length > 0) {
      const { error: errLead } = await supabase
        .from('leads')
        .update(updateLead)
        .eq('pessoa_id', pessoaId)
        .eq('empresa_id', empresa_id)
        .is('deleted_at', null)
      if (errLead) {
        console.error('[ocr-confirmar] Erro ao espelhar campos no lead:', errLead.message, '| campos:', Object.keys(updateLead))
      }
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

  // Certidão de casamento (V2): registra o casamento da Pessoa alvo com o cônjuge escolhido, nos dois
  // lados, com data e regime da certidão. Casamento de terceiros só com confirmação — os outros dados
  // já foram salvos; a tela pergunta e conclui pela rota de casamento.
  let casamento: 'registrado' | 'confirmar' | 'erro' | null = null
  let casamento_encerra: Array<{ id: string; nome: string }> = []
  let casamento_erro: string | null = null
  if (tipo_confirmado === 'certidao_casamento' && (body.casamento?.conjuge_pessoa_id || body.casamento?.novo?.nome?.trim())) {
    let conjugeId: string | null = null
    if (body.casamento.conjuge_pessoa_id) {
      const { data: visivel } = await clienteDoUsuario(token)
        .from('pessoas').select('id').eq('id', body.casamento.conjuge_pessoa_id).is('deleted_at', null).maybeSingle()
      if (visivel) conjugeId = body.casamento.conjuge_pessoa_id
      else casamento_erro = 'Cônjuge escolhido não encontrado.'
    } else {
      const r = await pessoaPorCpfOuNova(body.casamento.novo!.nome!.trim(), body.casamento.novo!.cpf)
      if ('erro' in r) casamento_erro = r.erro
      else conjugeId = r.id
    }
    if (conjugeId) {
      const r = await registrarCasamento(supabase, empresa_id, pessoaId, conjugeId, {
        estadoCivil: 'casado',
        regime: (camposFiltrados['regime_casamento'] as string | undefined) ?? null,
        data: (camposFiltrados['data_casamento'] as string | undefined) ?? null,
      })
      if ('ok' in r) casamento = 'registrado'
      else if ('confirmar' in r) { casamento = 'confirmar'; casamento_encerra = r.confirmar }
      else casamento_erro = r.erro
    }
    if (casamento_erro) casamento = 'erro'
  }

  // Marca documento como revisado, atualizando classificacao se o usuário confirmou o tipo.
  // Se é do cônjuge, o documento passa a pertencer de fato à Pessoa do cônjuge
  // (não mais ao titular) — reflete a real dona da identidade no documento.
  await supabase
    .from('documentos')
    .update({
      status_ocr: 'revisado',
      ...(tipo_confirmado ? { classificacao_legado: tipo_confirmado } : {}),
      ...(mudouDono ? { pessoa_id: pessoaId } : {}),
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

  const { data: alvoPessoa } = await supabase.from('pessoas').select('nome').eq('id', pessoaId).maybeSingle()

  return NextResponse.json({
    ok: true,
    alvo_pessoa_id: pessoaId,
    casamento,
    casamento_encerra,
    casamento_erro,
    alvo_nome: (alvoPessoa?.nome as string | undefined) ?? null,
    cpf_divergente,
    cpf_pertence_a,
    cpf_invalido,
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
