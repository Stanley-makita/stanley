// API: POST /api/processos/[id]/formularios?banco=<nome do banco>
// Gera PDFs preenchidos e salva diretamente no CRM (documentos_clientes)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
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

// Itaú
import { mapaFgtsItau }     from '@/lib/formularios/itau/fgts'

// Santander
import { mapaFgtsSantander }        from '@/lib/formularios/santander/fgts'
import { mapaAutorizacaoSantander } from '@/lib/formularios/santander/autorizacao'
import { mapaIqVendedorSantander }  from '@/lib/formularios/santander/iq-vendedor'

type BancoSuportado = 'BRADESCO' | 'BANCO_DO_BRASIL' | 'SANTANDER' | 'ITAU' | 'CAIXA'

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

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
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

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const salvos: string[] = []
    const erros: string[] = []

    for (const form of formularios) {
      try {
        // 1. Gerar PDF preenchido
        const mapa = form.mapa(dados)
        const pdfBytes = await preencherPdf(form.template, mapa)

        // 2. Salvar no Storage (upsert via remove + upload)
        const storagePath = `${dados.empresa_id}/formularios/${params.id}/${form.nomeArquivo}`
        await sb.storage.from('documentos-clientes').remove([storagePath])

        const { error: uploadErr } = await sb.storage
          .from('documentos-clientes')
          .upload(storagePath, pdfBytes, {
            contentType: 'application/pdf',
            upsert: false,
          })
        if (uploadErr) throw new Error(`Storage: ${uploadErr.message}`)

        // 3. Registrar em documentos_clientes (remove anterior + insert)
        await sb.from('documentos_clientes')
          .delete()
          .eq('processo_id', params.id)
          .eq('nome_original', form.nomeArquivo)
          .eq('empresa_id', dados.empresa_id)

        const { error: dbErr } = await sb.from('documentos_clientes').insert({
          empresa_id:    dados.empresa_id,
          processo_id:   params.id,
          nome_original: form.nomeArquivo,
          mime_type:     'application/pdf',
          tamanho_bytes: pdfBytes.byteLength,
          storage_path:  storagePath,
          canal_origem:  'upload_manual',
        })
        if (dbErr) throw new Error(`DB: ${dbErr.message}`)

        salvos.push(form.nomeArquivo)
      } catch (err: any) {
        const msg = err?.message ?? String(err)
        console.error(`[formularios] Erro em ${form.nomeArquivo}: ${msg}`)
        erros.push(`${form.nomeArquivo} (${msg})`)
      }
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
