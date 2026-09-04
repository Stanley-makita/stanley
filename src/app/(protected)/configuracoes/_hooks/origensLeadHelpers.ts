/**
 * Gera o "codigo" estável de uma origem de lead a partir do nome digitado
 * pelo admin — minúsculas, sem acento, espaços/símbolos viram underscore.
 * Puramente cosmético na hora da criação: depois de criado, o codigo nunca
 * muda mesmo que o nome seja editado (ver useRenomearOrigemLead).
 */
export function slugify(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * Slug + dedupe contra os códigos já existentes na empresa — evita colidir
 * com a UNIQUE(empresa_id, codigo) da tabela origens_lead. Nome que vira
 * slug vazio (ex: só símbolos) cai no fallback "origem".
 */
export function gerarCodigoUnico(nome: string, codigosExistentes: string[]): string {
  const base = slugify(nome) || 'origem'
  const existentes = new Set(codigosExistentes)
  if (!existentes.has(base)) return base

  let contador = 2
  while (existentes.has(`${base}_${contador}`)) {
    contador += 1
  }
  return `${base}_${contador}`
}
