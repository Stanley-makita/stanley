// API: POST /api/processos/[id]/formularios?banco=<nome do banco>
// Gera PDFs preenchidos e salva diretamente no CRM (documentos_clientes)
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { podeExecutar } from '@/lib/auth/permissions'
import { buscarDadosFormulario } from '@/lib/formularios/dados'
import { preencherPdf } from '@/lib/formularios/engine'

// Bradesco
import { mapaAutorizacao }  from '@/lib/formularios/bradesco/autorizacao'
import { mapaProposta }     from '@/lib/formularios/bradesco/proposta'
import { mapaFgts }         from '@/lib/formularios/bradesco/fgts'
import { mapaIsencaoIr }    from '@/lib/formularios/bradesco/isencao-ir'
import { mapaDps }          from '@/lib/formularios/bradesco/dps'

// Banco do Brasil
import { mapaFgtsBB }       from '@/lib/formularios/banco-do-brasil/fgts'
import { mapaCompradorBB }  from '@/lib/formularios/banco-do-brasil/comprador'
import { mapaScrBB }        from '@/lib/formularios/banco-do-brasil/scr'

// Itaú
import { mapaFgtsItau }     from '@/lib/formularios/itau/fgts'

// Santander
import { mapaFgtsSantander }        from '@/lib/formularios/santander/fgts'
import { mapaAutorizacaoSantander } from '@/lib/formularios/santander/autorizacao'
import { mapaIqVendedorSantander }  from '@/lib/formularios/santander/iq-vendedor'

type BancoSuportado = 'BRADESCO' | 'BANCO_DO_BRASIL' | 'SANTANDER' | 'ITAU' | 'CAIXA'

const supabaseAdmin = createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function resolverUsuario() {
  const supabase = await createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const { data: usuario } = await supabaseAdmin
    .from('usuarios')
    .select('empresa_id, perfil')
    .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
    .eq('ativo', true)
    .single()

  return usuario
}

function normalizarBanco(nome: string): BancoSuportado | null {
  const n = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (n.includes('bradesco'))                    return 'BRADESCO'
  if (n.includes('brasil') || n === 'bb')       return 'BANCO_DO_BRASIL'
  if (n.includes('santander'))                   return 'SANTANDER'
  if (n.includes('itau') || n.includes('ita'))  return 'ITAU'
  if (n.includes('caixa'))                       return 'CAIXA'
  return null
}

type FormularioDef = {
  nomeArquivo: string
  template: string
  mapa: (d: Awaited<ReturnType<typeof buscarDadosFormulario>>) => ReturnType<typeof mapaAutorizacao>
}

const FORMULARIOS: Record<BancoSuportado, FormularioDef[]> = {
  BRADESCO: [
    { nomeArquivo: '1-Autorizacao.pdf',             template: 'BRADESCO/1-Autorização - Análises de Crédito e de Avaliação.pdf', mapa: mapaAutorizacao },
    { nomeArquivo: '2-DPS.pdf',                     template: 'BRADESCO/2-DPS.pdf',                     mapa: mapaDps },
    { nomeArquivo: '3-Proposta de Financiamento.pdf', template: 'BRADESCO/3-Proposta de Financiamento.pdf', mapa: mapaProposta },
    { nomeArquivo: '4-Autorizacao FGTS.pdf',        template: 'BRADESCO/AUTORIZAÇÃO FGTS.pdf',           mapa: mapaFgts },
    { nomeArquivo: '5-Isencao IR.pdf',              template: 'BRADESCO/ISENÇÃO IR.pdf',                 mapa: mapaIsencaoIr },
  ],
  BANCO_DO_BRASIL: [
    { nomeArquivo: '1-Proposta Comprador.pdf',      template: 'BANCO_DO_BRASIL/1-Formulario comprador.pdf',         mapa: mapaCompradorBB },
    { nomeArquivo: '2-Autorizacao FGTS.pdf',        template: 'BANCO_DO_BRASIL/Formulario FGTS Atualizado.pdf',     mapa: mapaFgtsBB },
    { nomeArquivo: '3-Vendedor PF.pdf',             template: 'BANCO_DO_BRASIL/3- Vendedor PF.pdf',                 mapa: () => [] },
    { nomeArquivo: '4-Isencao IR.pdf',              template: 'BANCO_DO_BRASIL/Declaração de Isenção do IR.pdf',    mapa: () => [] },
    { nomeArquivo: '5-SCR.pdf',                     template: 'BANCO_DO_BRASIL/SCR - Preenchida.pdf',               mapa: mapaScrBB },
  ],
  SANTANDER: [
    { nomeArquivo: '1-Autorizacao Compradores.pdf', template: 'SANTANDER/1-AUTORIZAÇÃO.pdf',                        mapa: mapaAutorizacaoSantander },
    { nomeArquivo: '2-DPS.pdf',                     template: 'SANTANDER/2-DPS.pdf',                                mapa: () => [] },
    { nomeArquivo: '3-Declaracao SFH.pdf',          template: 'SANTANDER/3-Declaração SFH.pdf',                     mapa: () => [] },
    { nomeArquivo: '4-Autorizacao FGTS.pdf',        template: 'SANTANDER/Autorizacao FGTS atualizada.pdf',          mapa: mapaFgtsSantander },
    { nomeArquivo: '5-Autorizacao IQ Vendedor.pdf', template: 'SANTANDER/Autorização IQ vendedor.pdf',              mapa: mapaIqVendedorSantander },
  ],
  ITAU: [
    { nomeArquivo: '1-Autorizacao FGTS.pdf',        template: 'ITAU/AUTORIZAÇÃO FGTS.pdf',                          mapa: mapaFgtsItau },
  ],
  CAIXA: [],
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const usuario = await resolverUsuario()
    if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (!podeExecutar(usuario.perfil, 'processos.editar')) {
      return NextResponse.json({ error: 'Sem permissão para gerar formulários do processo' }, { status: 403 })
    }

    const { data: processo } = await supabaseAdmin
      .from('processos')
      .select('id')
      .eq('id', params.id)
      .eq('empresa_id', usuario.empresa_id)
      .maybeSingle()

    if (!processo) return NextResponse.json({ error: 'Processo não encontrado' }, { status: 404 })

    // Modelo definitivo: formulário gerado entra no acervo documental da Pessoa,
    // que exige pessoa_id — resolve pelo comprador principal (mesma cadeia usada
    // em outros pontos do sistema: pessoa_id direto → CPF → nome).
    const { data: comprador } = await supabaseAdmin
      .from('processo_compradores')
      .select('pessoa_id, cpf, nome')
      .eq('processo_id', params.id)
      .eq('empresa_id', usuario.empresa_id)
      .eq('principal', true)
      .maybeSingle()

    let pessoaIdProcesso: string | null = comprador?.pessoa_id ?? null
    if (!pessoaIdProcesso && comprador?.cpf) {
      const { data: p } = await supabaseAdmin.from('pessoas').select('id')
        .eq('empresa_id', usuario.empresa_id).eq('cpf', comprador.cpf).maybeSingle()
      pessoaIdProcesso = p?.id ?? null
    }
    if (!pessoaIdProcesso && comprador?.nome) {
      const { data: p } = await supabaseAdmin.from('pessoas').select('id')
        .eq('empresa_id', usuario.empresa_id).ilike('nome', comprador.nome).maybeSingle()
      pessoaIdProcesso = p?.id ?? null
    }
    if (!pessoaIdProcesso) {
      return NextResponse.json(
        { error: 'Não foi possível identificar a Pessoa (comprador principal) deste processo para salvar os formulários.' },
        { status: 400 },
      )
    }

    const bancoParam = request.nextUrl.searchParams.get('banco') ?? ''
    const banco = normalizarBanco(bancoParam)

    if (!banco) {
      return NextResponse.json(
        { error: `Banco "${bancoParam}" não reconhecido.` },
        { status: 400 }
      )
    }

    const formularios = FORMULARIOS[banco]
    if (!formularios.length) {
      return NextResponse.json(
        { error: `Formulários do ${bancoParam} (Caixa) ainda em implementação.` },
        { status: 400 }
      )
    }

    const dados = await buscarDadosFormulario(params.id)

    const salvos: string[] = []
    const erros: string[] = []

    for (const form of formularios) {
      // --- 1. Gerar PDF ---
      let pdfBytes: Uint8Array
      try {
        const mapa = form.mapa(dados)
        pdfBytes = await preencherPdf(form.template, mapa)
      } catch (err: any) {
        const msg = `PDF: ${err?.message ?? err}`
        console.error(`[formularios] ${form.nomeArquivo} — ${msg}`)
        erros.push(`${form.nomeArquivo} (${msg})`)
        continue
      }

      // --- 2. Upload Storage ---
      const storagePath = `${dados.empresa_id}/formularios/${params.id}/${form.nomeArquivo}`
      try {
        await supabaseAdmin.storage.from('documentos-clientes').remove([storagePath])
        const { error: uploadErr } = await supabaseAdmin.storage
          .from('documentos-clientes')
          .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: false })
        if (uploadErr) throw uploadErr
      } catch (err: any) {
        const msg = `Storage: ${err?.message ?? err}`
        console.error(`[formularios] ${form.nomeArquivo} — ${msg}`)
        erros.push(`${form.nomeArquivo} (${msg})`)
        continue
      }

      // --- 3. Registrar no banco ---
      try {
        // Remove formulário homônimo anterior desta pessoa (regeneração).
        await supabaseAdmin.from('documentos')
          .delete()
          .eq('pessoa_id', pessoaIdProcesso)
          .eq('nome_original', form.nomeArquivo)
          .eq('empresa_id', dados.empresa_id)

        const { data: docInserido, error: dbErr } = await supabaseAdmin.from('documentos').insert({
          empresa_id:    dados.empresa_id,
          dominio:       'acervo_documental',
          pessoa_id:     pessoaIdProcesso,
          nome_original: form.nomeArquivo,
          mime_type:     'application/pdf',
          tamanho_bytes: pdfBytes.byteLength,
          storage_bucket: 'documentos-clientes',
          storage_path:  storagePath,
          origem:        'upload_manual',
        }).select('id').single()
        if (dbErr) throw dbErr

        await supabaseAdmin.from('documento_vinculos').insert({
          empresa_id: dados.empresa_id, documento_id: docInserido!.id, entidade_tipo: 'processo', entidade_id: params.id,
        })
      } catch (err: any) {
        const msg = `DB: ${err?.message ?? err}`
        console.error(`[formularios] ${form.nomeArquivo} — ${msg}`)
        erros.push(`${form.nomeArquivo} (${msg})`)
        continue
      }

      salvos.push(form.nomeArquivo)
    }

    return NextResponse.json({
      salvos,
      erros,
      mensagem: erros.length === 0
        ? `${salvos.length} formulário(s) gerado(s) e salvos no processo.`
        : `${salvos.length} formulário(s) salvos. ${erros.length} com erro: ${erros.join(', ')}`,
    })
  } catch (err: any) {
    console.error('[formularios] Erro geral:', err)
    return NextResponse.json(
      { error: err?.message ?? 'Erro ao gerar formulários' },
      { status: 500 }
    )
  }
}
