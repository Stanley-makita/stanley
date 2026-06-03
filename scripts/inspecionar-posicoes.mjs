// Script para inspecionar campos por posição (para PDFs com nomes garbled)
// Execução: node scripts/inspecionar-posicoes.mjs [arquivo]

import { PDFDocument } from 'pdf-lib'
import { readFileSync } from 'fs'

const arquivo = process.argv[2]
if (!arquivo) { console.error('Uso: node inspecionar-posicoes.mjs <caminho.pdf>'); process.exit(1) }

const bytes = readFileSync(arquivo)
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
const form = doc.getForm()
const campos = form.getFields()

console.log(`\n${arquivo} — ${campos.length} campos\n`)
for (const campo of campos) {
  const widgets = campo.acroField.getWidgets()
  for (const w of widgets) {
    const rect = w.getRectangle()
    const page = doc.getPages().findIndex(p => {
      const annots = p.node.Annots()
      if (!annots) return false
      for (let i = 0; i < annots.size(); i++) {
        if (annots.get(i) === w.dict) return true
      }
      return false
    })
    const tipo = campo.constructor.name.replace('PDF','').replace('Field','')
    const nome = campo.getName().slice(0, 40)
    console.log(`  p${page+1} x=${Math.round(rect.x)} y=${Math.round(rect.y)} w=${Math.round(rect.width)} [${tipo}] ${nome}`)
  }
}
