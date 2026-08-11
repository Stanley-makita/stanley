/**
 * Geração do PDF de um contrato a partir do HTML do editor — extraído de
 * `AbaContrato.tsx` (onde antes só existia embutido dentro do clique de
 * "Enviar pro Clicksign") pra ser reaproveitado também pela ação explícita
 * "Gerar/atualizar PDF" (Fase C do Construtor de Contratos). Mesma lógica
 * jsPDF + html2canvas de sempre — só passou a produzir um Blob persistível
 * em vez de já sair direto num payload de envio.
 *
 * Paginação: pré-calcula em que ponto cada página termina (medindo a altura
 * real de cada elemento de bloco do conteúdo) e monta o documento já como
 * uma pilha de páginas de altura fixa (cabeçalho + fatia do conteúdo que
 * cabe + rodapé, repetidos em cada uma) ANTES de tirar o screenshot. Assim
 * o corte de página cai sempre entre elementos, nunca no meio de uma frase,
 * e cabeçalho/rodapé aparecem em toda página impressa — não só na primeira/
 * última, como na primeira versão desta função.
 */

// Logotipo institucional padrão (mesmo arquivo usado nos PDFs do Simulador
// de Financiamento e do Simulador de Consórcio — ver gerarPDFFinanciamento.ts
// e gerarPDF.ts) e paleta de marca (#253B29/#C2AA6A) usada nesses mesmos
// geradores — repetida aqui porque este arquivo monta HTML puro, não desenha
// via jsPDF direto como os outros.
const LOGO_FONTINHAS = '/images/logos/logotipo%20retangular%20fontinhas%20assessoria.jpg'
const COR_VERDE = '#253B29'

// Geometria da página em px CSS a 96dpi (A4 = 210x297mm) — mesma referência
// usada tanto pra medir quanto pra capturar via html2canvas.
const PAGE_WIDTH_PX = 794
const PAGE_HEIGHT_PX = 1123
const PAGE_PAD_X_PX = 113 // ~3cm
const PAGE_PAD_TOP_PX = 76 // ~2cm
const PAGE_PAD_BOTTOM_PX = 38 // ~1cm — o resto do respiro fica na margin-top do rodapé

function estiloBase(): string {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.6; color: #000; }
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
    .doc-header { display: flex; align-items: center; gap: 0.8cm; padding-bottom: 0.4cm; margin-bottom: 0.8cm; border-bottom: 2px solid ${COR_VERDE}; }
    .doc-header-logo { height: 1.3cm; width: auto; flex-shrink: 0; }
    .doc-header-title { flex: 1; font-size: 11.5pt; font-weight: bold; color: ${COR_VERDE}; text-decoration: underline; text-align: right; letter-spacing: 0.02em; }
    .doc-footer { display: flex; align-items: center; gap: 0.6cm; padding-top: 0.3cm; border-top: 1px solid #999; }
    .doc-footer-logo { height: 0.65cm; width: auto; flex-shrink: 0; }
    .doc-footer-text p { margin: 0; text-align: left; font-size: 6.5pt; color: #444; }
    .doc-footer-empresa { font-style: italic; margin-top: 0.1cm !important; color: #000 !important; }
    .doc-page-number { text-align: center; font-size: 8pt; color: #666; margin-top: 0.2cm; }
    /* Rodapé (+ numeração) sempre no pé da página (padrão ABNT), não colado
       ao fim do conteúdo — .pdf-page é flex column e margin-top:auto no
       wrapper empurra o bloco todo pro final mesmo quando a página termina
       no meio. Não afeta a medição em paginarConteudo() porque ali
       .doc-footer-wrap não está dentro de um container flex, então
       margin-top:auto resolve pra 0. */
    .doc-footer-wrap { margin-top: 0.6cm; }
    .pdf-page > .doc-footer-wrap { margin-top: auto; }
  `
}

function cabecalhoInstitucional(titulo: string): string {
  return `<header class="doc-header">
    <img src="${LOGO_FONTINHAS}" alt="Fontinhas Assessoria" class="doc-header-logo" />
    <h1 class="doc-header-title">${titulo.toUpperCase()}</h1>
  </header>`
}

function rodapeInstitucional(paginaAtual: number, totalPaginas: number): string {
  return `<div class="doc-footer-wrap">
    <footer class="doc-footer">
      <img src="${LOGO_FONTINHAS}" alt="Fontinhas Assessoria" class="doc-footer-logo" />
      <div class="doc-footer-text">
        <p>Assessoria em processos de Financiamentos Habitacionais/Contratos particulares/Regularização de Imóveis</p>
        <p class="doc-footer-empresa">FONTINHAS E FONTINHAS LTDA – 77.543.700/0001-57 · Av. Dr. Gastão Vidigal, 634, loja 03, Edifício Z08, Zona 08 · Maringá/PR · (44) 3262-1685</p>
      </div>
    </footer>
    <p class="doc-page-number">${paginaAtual}/${totalPaginas}</p>
  </div>`
}

export async function blobParaBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function criarIframeOculto(): HTMLIFrameElement {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = `position:fixed;top:0;left:0;width:${PAGE_WIDTH_PX}px;height:${PAGE_HEIGHT_PX}px;opacity:0;pointer-events:none;z-index:-1;`
  document.body.appendChild(iframe)
  return iframe
}

async function carregarNoIframe(iframe: HTMLIFrameElement, html: string): Promise<Document> {
  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve()
    iframe.srcdoc = html
  })
  const doc = iframe.contentDocument!
  if (doc.fonts?.ready) await doc.fonts.ready

  const imagens = Array.from(doc.images)
  await Promise.all(imagens.map((img) => (img.complete ? Promise.resolve() : new Promise<void>((resolve) => {
    img.addEventListener('load', () => resolve(), { once: true })
    img.addEventListener('error', () => resolve(), { once: true })
  }))))
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  return doc
}

/**
 * Mede a altura de cada elemento de bloco do conteúdo (na largura real da
 * área imprimível) e agrupa em páginas — cada página recebe só os elementos
 * que cabem no espaço disponível depois de descontar cabeçalho/rodapé, sem
 * nunca partir um elemento ao meio.
 */
async function paginarConteudo(iframe: HTMLIFrameElement, conteudoHtml: string, titulo: string): Promise<string[]> {
  const htmlMedicao = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8" /><style>
  ${estiloBase()}
  body { width: ${PAGE_WIDTH_PX - PAGE_PAD_X_PX * 2}px; }
</style></head>
<body>
  <div id="medir-header">${cabecalhoInstitucional(titulo)}</div>
  <div id="medir-footer">${rodapeInstitucional(1, 1)}</div>
  <div id="medir-conteudo">${conteudoHtml}</div>
</body></html>`

  const doc = await carregarNoIframe(iframe, htmlMedicao)
  const headerH = doc.getElementById('medir-header')!.getBoundingClientRect().height
  const footerH = doc.getElementById('medir-footer')!.getBoundingClientRect().height
  const conteudoEl = doc.getElementById('medir-conteudo')!

  // getBoundingClientRect não inclui margin — desconta um respiro extra pra
  // cobrir a margin-bottom do cabeçalho e a margin-top do rodapé (ver CSS
  // .doc-header/.doc-footer em estiloBase), senão a última linha de cada
  // página fica espremida contra o rodapé.
  const RESPIRO_MARGENS_PX = 60
  const alturaDisponivel = PAGE_HEIGHT_PX - PAGE_PAD_TOP_PX - PAGE_PAD_BOTTOM_PX - headerH - footerH - RESPIRO_MARGENS_PX

  // getBoundingClientRect() não inclui margin — sem isso a soma acumulada
  // subestima o espaço real de cada elemento (ex: h3 com margin-top: 1.5em)
  // e o último elemento de uma página pode estourar o `.pdf-page` (que tem
  // overflow: hidden) e sair cortado no screenshot final.
  function alturaComMargens(el: Element): number {
    const rect = el.getBoundingClientRect()
    const estilo = el.ownerDocument.defaultView!.getComputedStyle(el)
    return rect.height + parseFloat(estilo.marginTop || '0') + parseFloat(estilo.marginBottom || '0')
  }

  const paginas: string[] = []
  let paginaAtual: string[] = []
  let alturaAtual = 0

  const filhos = Array.from(conteudoEl.children)
  for (let i = 0; i < filhos.length; i++) {
    const filho = filhos[i]
    const alturaFilho = alturaComMargens(filho)

    // Evita título de cláusula órfão: se este filho é um heading e cabe
    // sozinho no fim da página, mas o elemento seguinte (o corpo da
    // cláusula) não cabe junto, quebra a página antes do heading em vez de
    // depois — o título some junto com o resto pra próxima página.
    const ehHeading = /^H[1-6]$/.test(filho.tagName)
    const proximo = filhos[i + 1]
    if (ehHeading && proximo && alturaAtual > 0 && alturaAtual + alturaFilho <= alturaDisponivel) {
      const alturaProximo = alturaComMargens(proximo)
      if (alturaAtual + alturaFilho + alturaProximo > alturaDisponivel) {
        paginas.push(paginaAtual.join(''))
        paginaAtual = []
        alturaAtual = 0
      }
    }

    // Elemento maior que uma página inteira (ex: tabela grande) — deixa
    // estourar sozinho numa página própria em vez de tentar dividir.
    if (alturaAtual > 0 && alturaAtual + alturaFilho > alturaDisponivel) {
      paginas.push(paginaAtual.join(''))
      paginaAtual = []
      alturaAtual = 0
    }
    paginaAtual.push(filho.outerHTML)
    alturaAtual += alturaFilho
  }
  if (paginaAtual.length > 0) paginas.push(paginaAtual.join(''))

  return paginas.length > 0 ? paginas : ['']
}

/** Só funciona no browser (usa iframe/canvas) — nunca chamar em rota de servidor. */
export async function gerarPdfBlobContrato(conteudoHtml: string, titulo: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const html2canvas = (await import('html2canvas')).default

  const iframe = criarIframeOculto()

  try {
    const paginas = await paginarConteudo(iframe, conteudoHtml, titulo)

    // Redimensiona o iframe pra caber a pilha inteira de páginas — sem isso
    // o html2canvas capturaria as páginas além da primeira fora da área
    // visível do iframe (altura fixa original, só de 1 página).
    iframe.style.height = `${paginas.length * PAGE_HEIGHT_PX}px`

    const htmlPaginado = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8" /><title>${titulo}</title><style>
  ${estiloBase()}
  .pdf-page {
    width: ${PAGE_WIDTH_PX}px;
    height: ${PAGE_HEIGHT_PX}px;
    padding: ${PAGE_PAD_TOP_PX}px ${PAGE_PAD_X_PX}px ${PAGE_PAD_BOTTOM_PX}px;
    overflow: hidden;
    background: #fff;
    display: flex;
    flex-direction: column;
  }
</style></head>
<body>${paginas.map((p, i) => `<div class="pdf-page">${cabecalhoInstitucional(titulo)}${p}${rodapeInstitucional(i + 1, paginas.length)}</div>`).join('')}</body></html>`

    const doc = await carregarNoIframe(iframe, htmlPaginado)

    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
    const A4_WIDTH_MM = 210
    const A4_HEIGHT_MM = 297

    const paginaEls = Array.from(doc.getElementsByClassName('pdf-page'))
    for (let i = 0; i < paginaEls.length; i++) {
      const canvas = await html2canvas(paginaEls[i] as HTMLElement, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#fff',
        windowWidth: PAGE_WIDTH_PX,
      })
      const imgData = canvas.toDataURL('image/jpeg', 0.92)
      if (i > 0) pdf.addPage()
      pdf.addImage(imgData, 'JPEG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM)
    }

    return pdf.output('blob')
  } finally {
    if (document.body.contains(iframe)) document.body.removeChild(iframe)
  }
}
