// API: GET /api/processos/[id]/formularios?banco=BRADESCO
// Retorna ZIP com PDFs preenchidos do banco selecionado
import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { buscarDadosFormulario } from '@/lib/formularios/dados'
import { preencherPdf } from '@/lib/formularios/engine'
import { mapaAutorizacao }  from '@/lib/formularios/bradesco/autorizacao'
import { mapaProposta }     from '@/lib/formularios/bradesco/proposta'
import { mapaFgts }         from '@/lib/formularios/bradesco/fgts'
import { mapaIsencaoIr }    from '@/lib/formularios/bradesco/isencao-ir'
import { mapaDps }          from '@/lib/formularios/bradesco/dps'

const BANCOS_SUPORTADOS = ['BRADESCO'] as const
type BancoSuportado = (typeof BANCOS_SUPORTADOS)[number]

type FormularioDef = {
  nomeArquivo: string
  template: string
  mapa: (d: Awaited<ReturnType<typeof buscarDadosFormulario>>) => ReturnType<typeof mapaAutorizacao>
}

const FORMULARIOS: Record<BancoSuportado, FormularioDef[]> = {
  BRADESCO: [
    {
      nomeArquivo: '1-Autorizacao.pdf',
      template: 'BRADESCO/1-Autorização - Análises de Crédito e de Avaliação.pdf',
      mapa: mapaAutorizacao,
    },
    {
      nomeArquivo: '2-DPS.pdf',
      template: 'BRADESCO/2-DPS.pdf',
      mapa: mapaDps,
    },
    {
      nomeArquivo: '3-Proposta de Financiamento.pdf',
      template: 'BRADESCO/3-Proposta de Financiamento.pdf',
      mapa: mapaProposta,
    },
    {
      nomeArquivo: '4-Autorizacao FGTS.pdf',
      template: 'BRADESCO/AUTORIZAÇÃO FGTS.pdf',
      mapa: mapaFgts,
    },
    {
      nomeArquivo: '5-Isencao IR.pdf',
      template: 'BRADESCO/ISENÇÃO IR.pdf',
      mapa: mapaIsencaoIr,
    },
  ],
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const banco = (request.nextUrl.searchParams.get('banco') ?? 'BRADESCO').toUpperCase() as BancoSuportado

    if (!BANCOS_SUPORTADOS.includes(banco)) {
      return NextResponse.json(
        { error: `Banco "${banco}" não suportado. Suportados: ${BANCOS_SUPORTADOS.join(', ')}` },
        { status: 400 }
      )
    }

    const dados = await buscarDadosFormulario(params.id)
    const formularios = FORMULARIOS[banco]

    const zip = new JSZip()
    const pasta = zip.folder(`${banco} - ${dados.numero_processo}`)!

    for (const form of formularios) {
      try {
        const mapa = form.mapa(dados)
        const pdfBytes = await preencherPdf(form.template, mapa)
        pasta.file(form.nomeArquivo, pdfBytes)
      } catch (err) {
        console.error(`[formularios] Erro ao preencher ${form.nomeArquivo}:`, err)
        // Adiciona o template original sem preenchimento em caso de erro
        const { readFileSync } = await import('fs')
        const path = await import('path')
        const templatePath = path.join(process.cwd(), 'public', 'formularios', form.template)
        pasta.file(form.nomeArquivo, readFileSync(templatePath))
      }
    }

    const zipUint8 = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    // NextResponse aceita ArrayBuffer em Next.js 14
    const zipBuffer = zipUint8.buffer.slice(zipUint8.byteOffset, zipUint8.byteOffset + zipUint8.byteLength)

    return new NextResponse(zipBuffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${banco}-${dados.numero_processo}.zip"`,
      },
    })
  } catch (err) {
    console.error('[formularios] Erro geral:', err)
    return NextResponse.json({ error: 'Erro ao gerar formulários' }, { status: 500 })
  }
}
