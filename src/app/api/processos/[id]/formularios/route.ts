// API: GET /api/processos/[id]/formularios?banco=<nome do banco>
// Retorna ZIP com PDFs preenchidos do banco identificado no processo
import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
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
import { mapaFgtsSantander }         from '@/lib/formularios/santander/fgts'
import { mapaAutorizacaoSantander }  from '@/lib/formularios/santander/autorizacao'
import { mapaIqVendedorSantander }   from '@/lib/formularios/santander/iq-vendedor'

const BANCOS_SUPORTADOS = ['BRADESCO', 'BANCO_DO_BRASIL', 'SANTANDER', 'ITAU', 'CAIXA'] as const
type BancoSuportado = (typeof BANCOS_SUPORTADOS)[number]

function normalizarBanco(nome: string): BancoSuportado | null {
  const n = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (n.includes('bradesco'))                         return 'BRADESCO'
  if (n.includes('brasil') || n.includes('bb'))      return 'BANCO_DO_BRASIL'
  if (n.includes('santander'))                        return 'SANTANDER'
  if (n.includes('itau') || n.includes('ita'))       return 'ITAU'
  if (n.includes('caixa'))                            return 'CAIXA'
  return null
}

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

  BANCO_DO_BRASIL: [
    {
      nomeArquivo: '1-Proposta Comprador.pdf',
      template: 'BANCO_DO_BRASIL/1-Formulario comprador.pdf',
      mapa: mapaCompradorBB,
    },
    {
      nomeArquivo: '2-Autorizacao FGTS.pdf',
      template: 'BANCO_DO_BRASIL/Formulario FGTS Atualizado.pdf',
      mapa: mapaFgtsBB,
    },
    // Formulários sem campos AcroForm são incluídos em branco para impressão
    {
      nomeArquivo: '3-Vendedor PF.pdf',
      template: 'BANCO_DO_BRASIL/3- Vendedor PF.pdf',
      mapa: () => [],
    },
    {
      nomeArquivo: '4-Isencao IR.pdf',
      template: 'BANCO_DO_BRASIL/Declaração de Isenção do IR.pdf',
      mapa: () => [],
    },
  ],

  SANTANDER: [
    {
      nomeArquivo: '1-Autorizacao Compradores.pdf',
      template: 'SANTANDER/1-AUTORIZAÇÃO.pdf',
      mapa: mapaAutorizacaoSantander,
    },
    {
      nomeArquivo: '2-DPS.pdf',
      template: 'SANTANDER/2-DPS.pdf',
      mapa: () => [],
    },
    {
      nomeArquivo: '3-Declaracao SFH.pdf',
      template: 'SANTANDER/3-Declaração SFH.pdf',
      mapa: () => [],
    },
    {
      nomeArquivo: '4-Autorizacao FGTS.pdf',
      template: 'SANTANDER/Autorizacao FGTS atualizada.pdf',
      mapa: mapaFgtsSantander,
    },
    {
      nomeArquivo: '5-Autorizacao IQ Vendedor.pdf',
      template: 'SANTANDER/Autorização IQ vendedor.pdf',
      mapa: mapaIqVendedorSantander,
    },
  ],

  ITAU: [
    {
      nomeArquivo: '1-Autorizacao FGTS.pdf',
      template: 'ITAU/AUTORIZAÇÃO FGTS.pdf',
      mapa: mapaFgtsItau,
    },
  ],

  CAIXA: [
    // Formulários Caixa estão em formato .dot e .html — implementação futura
  ],
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
        { error: `Banco "${bancoParam}" não reconhecido. Verifique o banco definido no processo.` },
        { status: 400 }
      )
    }

    const formularios = FORMULARIOS[banco]
    if (!formularios || formularios.length === 0) {
      return NextResponse.json(
        { error: `Os formulários do ${bancoParam} (Caixa) ainda estão em implementação. Disponíveis: Bradesco, BB, Santander, Itaú.` },
        { status: 400 }
      )
    }

    const dados = await buscarDadosFormulario(params.id)
    const zip = new JSZip()
    const pasta = zip.folder(`${bancoParam} - ${dados.numero_processo}`)!

    for (const form of formularios) {
      try {
        const mapa = form.mapa(dados)
        const pdfBytes = await preencherPdf(form.template, mapa)
        pasta.file(form.nomeArquivo, pdfBytes)
      } catch (err) {
        console.error(`[formularios] Erro ao preencher ${form.nomeArquivo}:`, err)
        // Inclui o template original sem preenchimento
        const { readFileSync } = await import('fs')
        const path = await import('path')
        const templatePath = path.join(process.cwd(), 'public', 'formularios', form.template)
        pasta.file(form.nomeArquivo, readFileSync(templatePath))
      }
    }

    const zipUint8 = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    const zipBuffer = zipUint8.buffer.slice(zipUint8.byteOffset, zipUint8.byteOffset + zipUint8.byteLength)

    return new NextResponse(zipBuffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${bancoParam}-${dados.numero_processo}.zip"`,
      },
    })
  } catch (err) {
    console.error('[formularios] Erro geral:', err)
    return NextResponse.json({ error: 'Erro ao gerar formulários' }, { status: 500 })
  }
}
