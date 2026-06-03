// Script para listar campos AcroForm de todos os PDFs de formulários bancários
// Execução: node scripts/inspecionar-campos-pdf.mjs

import { PDFDocument } from 'pdf-lib'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'

const BASE = './public/formularios'

function listarPdfs(dir) {
  const resultados = []
  for (const entry of readdirSync(dir)) {
    const caminho = join(dir, entry)
    if (statSync(caminho).isDirectory()) {
      resultados.push(...listarPdfs(caminho))
    } else if (extname(entry).toLowerCase() === '.pdf') {
      resultados.push(caminho)
    }
  }
  return resultados
}

async function inspecionarPdf(caminho) {
  const bytes = readFileSync(caminho)
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const form = doc.getForm()
  const campos = form.getFields()

  if (campos.length === 0) {
    console.log(`\n❌  SEM CAMPOS: ${caminho}`)
    return
  }

  console.log(`\n✅  ${caminho} — ${campos.length} campo(s)`)
  for (const campo of campos) {
    const tipo = campo.constructor.name.replace('PDF', '').replace('Field', '')
    console.log(`    [${tipo.padEnd(12)}] ${campo.getName()}`)
  }
}

const pdfs = listarPdfs(BASE)
console.log(`Inspecionando ${pdfs.length} PDFs...\n`)

for (const pdf of pdfs) {
  await inspecionarPdf(pdf)
}
