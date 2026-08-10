/**
 * Geração do PDF de um contrato a partir do HTML do editor — extraído de
 * `AbaContrato.tsx` (onde antes só existia embutido dentro do clique de
 * "Enviar pro Clicksign") pra ser reaproveitado também pela ação explícita
 * "Gerar/atualizar PDF" (Fase C do Construtor de Contratos). Mesma lógica
 * jsPDF + html2canvas de sempre — só passou a produzir um Blob persistível
 * em vez de já sair direto num payload de envio.
 */

// Logotipo institucional padrão (mesmo arquivo usado nos PDFs do Simulador
// de Financiamento e do Simulador de Consórcio — ver gerarPDFFinanciamento.ts
// e gerarPDF.ts) e paleta de marca (#253B29/#C2AA6A) usada nesses mesmos
// geradores — repetida aqui porque este arquivo monta HTML puro, não desenha
// via jsPDF direto como os outros.
const LOGO_FONTINHAS = '/images/logos/logotipo%20retangular%20fontinhas%20assessoria.jpg'
const COR_VERDE = '#253B29'
const COR_DOURADO = '#C2AA6A'

/**
 * Cabeçalho e rodapé institucionais — padrão visual único pra TODOS os
 * contratos (independentemente do modelo/tipo), reproduzindo o papel
 * timbrado usado historicamente pela Fontinhas em Word (logotipo + título
 * sublinhado no alto, e no rodapé o mesmo logotipo + razão social/endereço).
 * Aparecem só uma vez (início/fim do documento) porque a geração do PDF
 * (`gerarPdfBlobContrato`) tira um screenshot único do HTML e fatia em
 * páginas A4 — não repagina header/footer por página como o Word fazia.
 */
function cabecalhoInstitucional(titulo: string): string {
  return `<header class="doc-header">
    <img src="${LOGO_FONTINHAS}" alt="Fontinhas Assessoria" class="doc-header-logo" />
    <h1 class="doc-header-title">${titulo.toUpperCase()}</h1>
  </header>`
}

function rodapeInstitucional(): string {
  return `<footer class="doc-footer">
    <img src="${LOGO_FONTINHAS}" alt="Fontinhas Assessoria" class="doc-footer-logo" />
    <div class="doc-footer-text">
      <p>Assessoria em processos de Financiamentos Habitacionais/Contratos particulares/Regularização de Imóveis</p>
      <p class="doc-footer-empresa">FONTINHAS E FONTINHAS LTDA ME – 77.543.700/0001-57 · Av. Gastão Vidigal, 938, Zona 08 · Maringá/PR · (44) 3262-1685</p>
    </div>
  </footer>`
}

export function gerarHtmlImpressao(conteudo: string, titulo: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${titulo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.6; color: #000; padding: 2.5cm 3cm; }
    h2 { font-size: 12pt; margin-bottom: 1em; }
    h3 { font-size: 11pt; margin-top: 1.5em; margin-bottom: 0.5em; }
    p { margin-bottom: 0.8em; text-align: justify; }
    ul { margin: 0.5em 0 0.8em 1.5em; }
    li { margin-bottom: 0.3em; }
    strong { font-weight: bold; }
    em { font-style: italic; }
    table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
    th, td { border: 1px solid #aaa; padding: 7px 12px; vertical-align: top; }
    th { background: #eeeeee; font-weight: bold; text-align: left; }
    hr { border: none; border-top: 1px solid #555; margin: 1.2em 0; }
    .sig-table td { border: 1px solid #aaa; padding: 14px 16px; vertical-align: top; width: 50%; }
    .doc-header { display: flex; align-items: center; gap: 0.8cm; padding-bottom: 0.4cm; margin-bottom: 1cm; border-bottom: 2px solid ${COR_VERDE}; }
    .doc-header-logo { height: 1.4cm; width: auto; flex-shrink: 0; }
    .doc-header-title { flex: 1; font-size: 11.5pt; font-weight: bold; color: ${COR_VERDE}; text-decoration: underline; text-align: right; letter-spacing: 0.02em; }
    .doc-footer { display: flex; align-items: center; gap: 0.6cm; margin-top: 1.5cm; padding-top: 0.3cm; border-top: 1px solid #999; }
    .doc-footer-logo { height: 0.65cm; width: auto; flex-shrink: 0; }
    .doc-footer-text p { margin: 0; text-align: left; font-size: 6.5pt; color: #444; }
    .doc-footer-empresa { font-style: italic; margin-top: 0.1cm !important; color: ${COR_DOURADO} !important; }
    @page { size: A4; margin: 0; }
    @media print { body { padding: 2.5cm 3cm; } }
  </style>
</head>
<body>${cabecalhoInstitucional(titulo)}${conteudo}${rodapeInstitucional()}</body>
</html>`
}

export async function blobParaBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/** Só funciona no browser (usa iframe/canvas) — nunca chamar em rota de servidor. */
export async function gerarPdfBlobContrato(conteudoHtml: string, titulo: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const html2canvas = (await import('html2canvas')).default

  const htmlCompleto = gerarHtmlImpressao(conteudoHtml, titulo)

  // Iframe oculto garante contexto de renderização isolado, CSS no <head> e fontes carregadas
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;top:0;left:0;width:794px;height:1123px;opacity:0;pointer-events:none;z-index:-1;'
  document.body.appendChild(iframe)

  try {
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve()
      iframe.srcdoc = htmlCompleto
    })

    if (iframe.contentDocument?.fonts?.ready) {
      await iframe.contentDocument.fonts.ready
    }

    // Espera o logotipo do cabeçalho/rodapé carregar — sem isso o
    // html2canvas pode capturar antes da imagem chegar e sair em branco.
    const imagens = Array.from(iframe.contentDocument?.images ?? [])
    await Promise.all(imagens.map((img) => (img.complete ? Promise.resolve() : new Promise<void>((resolve) => {
      img.addEventListener('load', () => resolve(), { once: true })
      img.addEventListener('error', () => resolve(), { once: true })
    }))))

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
    const A4_WIDTH_MM = 210
    const A4_HEIGHT_MM = 297

    const canvas = await html2canvas(iframe.contentDocument!.body, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#fff',
      windowWidth: 794,
    })

    const imgWidth = A4_WIDTH_MM
    const imgHeight = (canvas.height * A4_WIDTH_MM) / canvas.width
    const imgData = canvas.toDataURL('image/jpeg', 0.92)

    let yPos = 0
    let pageNum = 0
    while (yPos < imgHeight) {
      if (pageNum > 0) pdf.addPage()
      pdf.addImage(imgData, 'JPEG', 0, -yPos, imgWidth, imgHeight)
      yPos += A4_HEIGHT_MM
      pageNum++
    }

    return pdf.output('blob')
  } finally {
    if (document.body.contains(iframe)) document.body.removeChild(iframe)
  }
}
