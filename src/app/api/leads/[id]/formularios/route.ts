// API: GET /api/leads/[id]/formularios?banco=<nome>&formularios=arq1,arq2
// Gera PDFs selecionados e salva em documentos_clientes vinculados ao lead
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { podeExecutar } from '@/lib/auth/permissions'
import { buscarDadosFormularioLead } from '@/lib/formularios/dados-lead'
import { preencherPdf } from '@/lib/formularios/engine'
import { sincronizarDocumentoUnificado } from '@/lib/documentos/sincronizarDocumentoUnificado'

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

import type { DadosProcesso } from '@/lib/formularios/dados'

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
  label: string
  template: string
  mapa: (d: DadosProcesso) => ReturnType<typeof mapaAutorizacao>
}

const FORMULARIOS_POR_BANCO: Record<BancoSuportado, FormularioDef[]> = {
  BRADESCO: [
    { nomeArquivo: '1-Autorizacao.pdf',               label: 'Autorização (análise/avaliação)', template: 'BRADESCO/1-Autorização - Análises de Crédito e de Avaliação.pdf', mapa: mapaAutorizacao },
    { nomeArquivo: '2-DPS.pdf',                       label: 'DPS — Declaração Pessoal de Saúde', template: 'BRADESCO/2-DPS.pdf', mapa: mapaDps },
    { nomeArquivo: '3-Proposta de Financiamento.pdf', label: 'Proposta de Financiamento',       template: 'BRADESCO/3-Proposta de Financiamento.pdf', mapa: mapaProposta },
    { nomeArquivo: '4-Autorizacao FGTS.pdf',          label: 'Autorização FGTS',                template: 'BRADESCO/AUTORIZAÇÃO FGTS.pdf',           mapa: mapaFgts },
    { nomeArquivo: '5-Isencao IR.pdf',                label: 'Isenção IR',                      template: 'BRADESCO/ISENÇÃO IR.pdf',                 mapa: mapaIsencaoIr },
  ],
  BANCO_DO_BRASIL: [
    { nomeArquivo: '1-Proposta Comprador.pdf',        label: 'Proposta Comprador',              template: 'BANCO_DO_BRASIL/1-Formulario comprador.pdf',       mapa: mapaCompradorBB },
    { nomeArquivo: '2-Autorizacao FGTS.pdf',          label: 'Autorização FGTS',                template: 'BANCO_DO_BRASIL/Formulario FGTS Atualizado.pdf',   mapa: mapaFgtsBB },
    { nomeArquivo: '3-Vendedor PF.pdf',               label: 'Vendedor PF',                     template: 'BANCO_DO_BRASIL/3- Vendedor PF.pdf',              mapa: () => [] },
    { nomeArquivo: '4-Isencao IR.pdf',                label: 'Isenção IR',                      template: 'BANCO_DO_BRASIL/Declaração de Isenção do IR.pdf', mapa: () => [] },
    { nomeArquivo: '5-SCR.pdf',                       label: 'Autorização SCR',                 template: 'BANCO_DO_BRASIL/SCR - Preenchida.pdf',            mapa: mapaScrBB },
  ],
  SANTANDER: [
    { nomeArquivo: '1-Autorizacao Compradores.pdf',   label: 'Autorização Compradores',         template: 'SANTANDER/1-AUTORIZAÇÃO.pdf',                      mapa: mapaAutorizacaoSantander },
    { nomeArquivo: '2-DPS.pdf',                       label: 'DPS',                             template: 'SANTANDER/2-DPS.pdf',                             mapa: () => [] },
    { nomeArquivo: '3-Declaracao SFH.pdf',            label: 'Declaração SFH',                  template: 'SANTANDER/3-Declaração SFH.pdf',                  mapa: () => [] },
    { nomeArquivo: '4-Autorizacao FGTS.pdf',          label: 'Autorização FGTS',                template: 'SANTANDER/Autorizacao FGTS atualizada.pdf',        mapa: mapaFgtsSantander },
    { nomeArquivo: '5-Autorizacao IQ Vendedor.pdf',   label: 'Autorização IQ Vendedor',         template: 'SANTANDER/Autorização IQ vendedor.pdf',           mapa: () => [] },
  ],
  ITAU: [
    { nomeArquivo: '1-Autorizacao FGTS.pdf',          label: 'Autorização FGTS',                template: 'ITAU/AUTORIZAÇÃO FGTS.pdf',                        mapa: mapaFgtsItau },
  ],
  CAIXA: [],
}

// GET /api/leads/[id]/formularios?banco=<nome>
// Retorna a lista de formulários disponíveis para o banco (sem gerar)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const bancoParam = request.nextUrl.searchParams.get('banco') ?? ''
  const banco = normalizarBanco(bancoParam)

  if (!banco) {
    return NextResponse.json({ formularios: [], banco: null })
  }

  const formularios = FORMULARIOS_POR_BANCO[banco].map((f) => ({
    nomeArquivo: f.nomeArquivo,
    label: f.label,
  }))

  return NextResponse.json({ formularios, banco })
}

// POST /api/leads/[id]/formularios
// Body: { banco: string, formularios: string[] } — array de nomeArquivo
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const usuario = await resolverUsuario()
    if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (!podeExecutar(usuario.perfil, 'leads.editar')) {
      return NextResponse.json({ error: 'Sem permissão para gerar formulários do lead' }, { status: 403 })
    }

    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('id')
      .eq('id', params.id)
      .eq('empresa_id', usuario.empresa_id)
      .is('deleted_at', null)
      .maybeSingle()

    if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

    const body = await request.json() as { banco: string; formularios: string[] }
    const banco = normalizarBanco(body.banco ?? '')

    if (!banco) {
      return NextResponse.json({ error: `Banco "${body.banco}" não reconhecido.` }, { status: 400 })
    }

    const disponiveis = FORMULARIOS_POR_BANCO[banco]
    if (!disponiveis.length) {
      return NextResponse.json({ error: 'Formulários deste banco ainda em implementação.' }, { status: 400 })
    }

    // Filtrar apenas os solicitados
    const selecionados = body.formularios?.length
      ? disponiveis.filter((f) => body.formularios.includes(f.nomeArquivo))
      : disponiveis

    if (!selecionados.length) {
      return NextResponse.json({ error: 'Nenhum formulário selecionado.' }, { status: 400 })
    }

    const dados = await buscarDadosFormularioLead(params.id)

    const salvos: string[] = []
    const erros: string[] = []

    for (const form of selecionados) {
      let pdfBytes: Uint8Array
      try {
        const mapa = form.mapa(dados)
        pdfBytes = await preencherPdf(form.template, mapa)
      } catch (err: any) {
        erros.push(`${form.label} (PDF: ${err?.message ?? err})`)
        continue
      }

      const storagePath = `${dados.empresa_id}/formularios/lead_${params.id}/${form.nomeArquivo}`
      try {
        await supabaseAdmin.storage.from('documentos-clientes').remove([storagePath])
        const { error: uploadErr } = await supabaseAdmin.storage
          .from('documentos-clientes')
          .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: false })
        if (uploadErr) throw uploadErr
      } catch (err: any) {
        erros.push(`${form.label} (Storage: ${err?.message ?? err})`)
        continue
      }

      try {
        const { data: antigos } = await supabaseAdmin.from('documentos_clientes')
          .select('id')
          .eq('lead_id', params.id)
          .eq('nome_original', form.nomeArquivo)
          .eq('empresa_id', dados.empresa_id)

        await supabaseAdmin.from('documentos_clientes')
          .delete()
          .eq('lead_id', params.id)
          .eq('nome_original', form.nomeArquivo)
          .eq('empresa_id', dados.empresa_id)

        // Limpa também a linha espelhada no modelo unificado, senão fica
        // órfã apontando pra um id que não existe mais em documentos_clientes
        if (antigos?.length) {
          await supabaseAdmin.from('documentos').delete().in('id', antigos.map(d => d.id))
        }

        const { data: docInserido, error: dbErr } = await supabaseAdmin.from('documentos_clientes').insert({
          empresa_id:    dados.empresa_id,
          lead_id:       params.id,
          nome_original: form.nomeArquivo,
          mime_type:     'application/pdf',
          tamanho_bytes: pdfBytes.byteLength,
          storage_path:  storagePath,
          canal_origem:  'upload_manual',
        })
          .select('id')
          .single()
        if (dbErr) throw dbErr

        if (docInserido) {
          await sincronizarDocumentoUnificado(supabaseAdmin, {
            id: docInserido.id,
            empresa_id: dados.empresa_id,
            lead_id: params.id,
            nome_original: form.nomeArquivo,
            mime_type: 'application/pdf',
            tamanho_bytes: pdfBytes.byteLength,
            storage_bucket: 'documentos-clientes',
            storage_path: storagePath,
            canal_origem: 'upload_manual',
          })
        }
      } catch (err: any) {
        erros.push(`${form.label} (DB: ${err?.message ?? err})`)
        continue
      }

      salvos.push(form.label)
    }

    return NextResponse.json({
      salvos,
      erros,
      mensagem: erros.length === 0
        ? `${salvos.length} formulário(s) gerado(s) e salvos em Documentos.`
        : `${salvos.length} salvos. ${erros.length} com erro: ${erros.join(', ')}`,
    })
  } catch (err: any) {
    console.error('[formularios-lead] Erro geral:', err)
    return NextResponse.json({ error: err?.message ?? 'Erro ao gerar formulários' }, { status: 500 })
  }
}
