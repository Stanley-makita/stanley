// Engine de preenchimento de PDF via AcroForm (pdf-lib)
import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } from 'pdf-lib'
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

export type CampoFormulario = CampoTexto | CampoCheckbox | CampoRadio | CampoDropdown

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
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const form = doc.getForm()

  for (const campo of mapa) {
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
        if (opcoes.includes(campo.opcao)) {
          f.select(campo.opcao)
        }
      } else if (campo.tipo === 'dropdown') {
        const f = form.getDropdown(campo.campo)
        const opcoes = f.getOptions()
        const match = opcoes.find(
          (o) => o.toLowerCase() === campo.opcao.toLowerCase()
        )
        if (match) f.select(match)
      }
    } catch {
      // Campo não encontrado no PDF — ignora silenciosamente
    }
  }

  // Achata o formulário para evitar campos editáveis no resultado
  // Alguns PDFs com campos obfuscados (Santander) lançam erro no flatten — nesses casos retorna sem achatar
  try {
    form.flatten()
  } catch {
    // PDF mantém campos editáveis mas é retornado sem crash
  }

  return doc.save()
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
