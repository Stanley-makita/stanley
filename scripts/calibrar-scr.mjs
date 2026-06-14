// Detecta coordenadas dos campos do SCR automaticamente via pdfjs-dist
// Uso: node scripts/calibrar-scr.mjs
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pdfPath  = join(__dirname, '../public/formularios/BANCO_DO_BRASIL/SCR - Preenchida.pdf')
const jsonPath = join(__dirname, '../public/formularios/BANCO_DO_BRASIL/SCR.json')

// Polyfill mínimo para DOMMatrix (pdfjs usa para transforms internos)
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor(init) {
      const v = Array.isArray(init) ? init : [1,0,0,1,0,0]
      ;[this.a, this.b, this.c, this.d, this.e, this.f] = v
    }
  }
}
if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = class Path2D { constructor() {} }
}

const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist/build/pdf.mjs')
GlobalWorkerOptions.workerSrc = new URL(
  '../node_modules/pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).href

const data = readFileSync(pdfPath)
const doc  = await getDocument({ data: new Uint8Array(data), useWorkerFetch: false, isEvalSupported: false, disableFontFace: true }).promise
const page = await doc.getPage(1)
const { height: pageHeight } = page.getViewport({ scale: 1 })
const { items } = await page.getTextContent()

// Cada item tem: str, transform=[scaleX,0,0,scaleY,x,y], width, height
// x e y já estão em coordenadas pdf-lib (origem no canto inferior esquerdo)
const textos = items
  .filter(i => i.str?.trim())
  .map(i => ({
    str: i.str.trim(),
    x:   Math.round(i.transform[4]),
    y:   Math.round(i.transform[5]),
  }))

console.log('\n=== Todos os itens de texto ===')
textos.forEach(t => console.log(`y=${String(t.y).padStart(3)}  x=${String(t.x).padStart(3)}  "${t.str}"`))

// Busca labels específicos para calcular onde colocar os valores
function encontrar(labelSubstring) {
  return textos.find(t => t.str.toLowerCase().includes(labelSubstring.toLowerCase()))
}

const lblLocalData    = encontrar('local e data')
const lblAssinatura   = encontrar('assinatura')
const lblNomeCliente  = encontrar('nome do cliente')
const lblCpf          = textos.find(t => t.str.trim().toLowerCase().startsWith('cpf'))

console.log('\n=== Labels encontrados ===')
console.log('Local e data:', lblLocalData)
console.log('Assinatura:',   lblAssinatura)
console.log('Nome cliente:', lblNomeCliente)
console.log('CPF:',          lblCpf)

if (!lblLocalData || !lblNomeCliente || !lblCpf) {
  console.error('\nERRO: nem todos os labels foram encontrados. Verifique o PDF.')
  process.exit(1)
}

// Posição dos valores:
//  - "Local e data" → há uma linha de underscore ABAIXO do label; pegamos o y do label menos a altura de uma linha (~14 pts)
//  - "Nome do cliente:" → valor vai logo após o label (x = lblNomeCliente.x + largura estimada do label)
//  - "CPF:" → idem

// Linha de underscore abaixo de "Local e data:"
// Procura item com underscores perto do label
const underscorePerto = textos.find(t =>
  /_{3,}/.test(t.str) && Math.abs(t.y - lblLocalData.y) < 30
)

const yLocalData   = underscorePerto ? underscorePerto.y + 1 : lblLocalData.y - 14
const yNome        = lblNomeCliente.y + 1   // mesma linha, logo após o label
const yCpf         = lblCpf.y + 1

// x para nome e cpf: logo após o label (estimativa pela largura ~8 pts/char)
const xNome = lblNomeCliente.x + lblNomeCliente.str.length * 5.5
const xCpf  = lblCpf.x + lblCpf.str.length * 5.5

const campos = [
  {
    tipo:    'texto_flat',
    campo:   'local_data',
    pagina:  0,
    x:       lblLocalData.x,
    y:       Math.round(yLocalData),
    tamanho: 10,
    valor:   '@local_data',
  },
  {
    tipo:    'texto_flat',
    campo:   'nome_cliente',
    pagina:  0,
    x:       Math.round(xNome),
    y:       Math.round(yNome),
    tamanho: 10,
    valor:   'comprador_principal.nome',
  },
  {
    tipo:      'texto_flat',
    campo:     'cpf_cliente',
    pagina:    0,
    x:         Math.round(xCpf),
    y:         Math.round(yCpf),
    tamanho:   10,
    valor:     'comprador_principal.cpf',
    formatador: 'cpf',
  },
]

const saida = { campos }
writeFileSync(jsonPath, JSON.stringify(saida, null, 2) + '\n', 'utf8')

console.log('\n=== SCR.json calibrado ===')
console.log(JSON.stringify(saida, null, 2))
console.log(`\nArquivo salvo em: ${jsonPath}`)
