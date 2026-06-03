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

const BANCOS_SUPORTADOS = ['BRADESCO', 'BANCO_DO_BRASIL', 'SANTANDER', 'ITAU', 'CAIXA'] as const
type BancoSuportado = (typeof BANCOS_SUPORTADOS)[number]

// Normaliza o nome do banco como vem da tabela bancos → chave interna
function normalizarBanco(nome: string): BancoSuportado | null {
  const n = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (n.includes('bradesco')) return 'BRADESCO'
  if (n.includes('brasil') || n.includes('bb ') || n === 'bb') return 'BANCO_DO_BRASIL'
  if (n.includes('santander')) return 'SANTANDER'
  if (n.includes('itau') || n.includes('itaú')) return 'ITAU'
  if (n.includes('caixa')) return 'CAIXA'
  return null
}

type FormularioDef = {
  nomeArquivo: string
  template: string
  mapa: (d: Awaited<ReturnType<typeof buscarDadosFormulario>>) => ReturnType<typeof mapaAutorizacao>
}

const FORMULARIOS: Record<BancoSuportado, FormularioDef[]> = {
  // Bancos ainda não implementados (receberão mapeamentos nas próximas iterações)
  BANCO_DO_BRASIL: [],
  SANTANDER: [],
  ITAU: [],
  CAIXA: [],

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
    const bancoParam = request.nextUrl.searchParams.get('banco') ?? ''
    const banco = normalizarBanco(bancoParam)

    if (!banco) {
      return NextResponse.json(
        {
          error: `Banco "${bancoParam}" ainda não tem formulários configurados no sistema. Bancos disponíveis: Bradesco.`,
        },
        { status: 400 }
      )
    }

    if (!FORMULARIOS[banco] || FORMULARIOS[banco].length === 0) {
      return NextResponse.json(
        {
          error: `Formulários do ${bancoParam} estão em desenvolvimento. Disponível agora: Bradesco.`,
        },
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
