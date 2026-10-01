/**
 * Nome em destaque de um documento na lista: o nome dado pela equipe (`nome_exibicao`) ou,
 * sem nome dado, o tipo detectado (ex.: "Comprovante de Renda"); sem tipo, o nome do arquivo.
 * O nome do arquivo como o cliente mandou (`nome_original`) aparece embaixo e nunca é editado.
 */
export interface DocTitulo { nome_original: string; nome_exibicao: string | null }

export function tituloPadraoDocumento(doc: DocTitulo, tipoLabel: string | null): string {
  return tipoLabel ?? doc.nome_original
}

export function tituloDocumento(doc: DocTitulo, tipoLabel: string | null): string {
  return doc.nome_exibicao?.trim() || tituloPadraoDocumento(doc, tipoLabel)
}

/**
 * Valor a gravar em `nome_exibicao` ao renomear o nome em destaque, ou `undefined` quando nada muda.
 * Vazio ou igual ao padrão → null (volta a mostrar o tipo / nome do arquivo).
 */
export function nomeExibicaoAoRenomear(doc: DocTitulo, tipoLabel: string | null, digitado: string): string | null | undefined {
  const nome = digitado.trim()
  const novo = !nome || nome === tituloPadraoDocumento(doc, tipoLabel) ? null : nome
  return novo === (doc.nome_exibicao?.trim() || null) ? undefined : novo
}
