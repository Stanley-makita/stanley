// Engine de preenchimento de PDF via AcroForm (pdf-lib) e overlay flat (texto por coordenadas)
import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, StandardFonts } from 'pdf-lib'
import { readFileSync } from 'fs'
import path from 'path'

export type CampoTexto = {
  tipo: 'texto'
  campo: string
  valor: string
}

export type CampoCheckbox = {
  tipo: 'checkbox'
  campo: string
  marcar: boolean
}

export type CampoRadio = {
  tipo: 'radio'
  campo: string
  opcao: string
}

export type CampoDropdown = {
  tipo: 'dropdown'
  campo: string
  opcao: string
}

// Overlay de texto por coordenadas — para PDFs flat sem AcroForm
export type CampoTextoFlat = {
  tipo: 'texto_flat'
  pagina?: number   // índice base 0 (padrão: 0)
  x: number
  y: number         // coordenada Y a partir da base da página (pdf-lib)
  tamanho?: number  // tamanho da fonte em pts (padrão: 10)
  texto: string
}

export type CampoFormulario = CampoTexto | CampoCheckbox | CampoRadio | CampoDropdown | CampoTextoFlat

export type MapaFormulario = CampoFormulario[]

/**
 * Carrega o PDF template do disco e retorna os bytes preenchidos.
 * @param caminhoRelativo Caminho relativo a partir de public/formularios/
 * @param mapa Array de campos a preencher
 */
export async function preencherPdf(
  caminhoRelativo: string,
  mapa: MapaFormulario
): Promise<Uint8Array> {
  const absPath = path.join(process.cwd(), 'public', 'formularios', caminhoRelativo)
  const bytes = readFileSync(absPath)

  // PDFs sem campos a preencher → retorna original sem processar
  if (mapa.length === 0) {
    return bytes
  }

  // PDFs com campos → tenta preencher; se o PDF for incompatível, retorna original
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })

    // --- Overlay flat: texto por coordenadas (para PDFs sem AcroForm) ---
    const camposFlat = mapa.filter((c): c is CampoTextoFlat => c.tipo === 'texto_flat')
    if (camposFlat.length > 0) {
      const helvetica = await doc.embedFont(StandardFonts.Helvetica)
      const paginas = doc.getPages()
      for (const c of camposFlat) {
        const pagina = paginas[c.pagina ?? 0]
        if (pagina && c.texto) {
          pagina.drawText(c.texto, { x: c.x, y: c.y, size: c.tamanho ?? 10, font: helvetica })
        }
      }
    }

    // --- AcroForm: campos nomeados (para PDFs com formulário interativo) ---
    const camposAcro = mapa.filter((c) => c.tipo !== 'texto_flat')
    if (camposAcro.length > 0) {
      const form = doc.getForm()
      for (const campo of camposAcro) {
        try {
          if (campo.tipo === 'texto') {
            const f = form.getTextField(campo.campo)
            f.setText(campo.valor)
            f.enableReadOnly()
          } else if (campo.tipo === 'checkbox') {
            const f = form.getCheckBox(campo.campo)
            if (campo.marcar) f.check()
            else f.uncheck()
          } else if (campo.tipo === 'radio') {
            const f = form.getRadioGroup(campo.campo)
            const opcoes = f.getOptions()
            if (opcoes.includes(campo.opcao)) f.select(campo.opcao)
          } else if (campo.tipo === 'dropdown') {
            const f = form.getDropdown(campo.campo)
            const opcoes = f.getOptions()
            const match = opcoes.find((o) => o.toLowerCase() === campo.opcao.toLowerCase())
            if (match) f.select(match)
          }
        } catch {
          // Campo não encontrado ou incompatível — ignora
        }
      }
      try { form.flatten() } catch { /* mantém editável se flatten falhar */ }
    }

    return doc.save()
  } catch {
    // PDF estruturalmente incompatível com pdf-lib — retorna original sem preenchimento
    return bytes
  }
}

/**
 * Lista todos os campos AcroForm de um PDF (útil para debug).
 */
export async function listarCamposPdf(caminhoRelativo: string): Promise<string[]> {
  const absPath = path.join(process.cwd(), 'public', 'formularios', caminhoRelativo)
  const bytes = readFileSync(absPath)
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const form = doc.getForm()
  return form.getFields().map((f) => `[${f.constructor.name}] ${f.getName()}`)
}
