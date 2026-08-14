import sanitizeHtml from 'sanitize-html'

/**
 * Sanitiza o HTML devolvido pela redação por IA (Fase 4) antes de qualquer
 * validação ou persistência — biblioteca dedicada em vez de regex, porque um
 * filtro regex ingênuo desembrulha `<script>`/`<style>` (mantém o conteúdo
 * interno como texto) em vez de removê-los por inteiro. Whitelist restrita
 * às tags que o editor/PDF já suportam hoje (mesmo subconjunto usado pelo
 * caminho determinístico via `substituirVariaveis`) — nenhum atributo
 * permitido, incluindo `class`/`style`.
 */
export function sanitizarMinutaHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['h3', 'p', 'strong', 'em', 'u', 'br'],
    allowedAttributes: {},
  })
}
