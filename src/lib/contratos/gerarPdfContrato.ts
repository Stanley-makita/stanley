/**
 * Geração do PDF de um contrato a partir do HTML do editor — extraído de
 * `AbaContrato.tsx` (onde antes só existia embutido dentro do clique de
 * "Enviar pro Clicksign") pra ser reaproveitado também pela ação explícita
 * "Gerar/atualizar PDF" (Fase C do Construtor de Contratos). Mesma lógica
 * jsPDF + html2canvas de sempre — só passou a produzir um Blob persistível
 * em vez de já sair direto num payload de envio.
 */

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
    @page { size: A4; margin: 0; }
    @media print { body { padding: 2.5cm 3cm; } }
  </style>
</head>
<body>${conteudo}</body>
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
