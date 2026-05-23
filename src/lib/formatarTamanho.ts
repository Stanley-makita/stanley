export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
export function iconeParaMime(mime: string): string {
  if (mime.startsWith('image/')) return '🖼️'
  if (mime === 'application/pdf') return '📄'
  if (mime.includes('word') || mime.includes('document')) return '📝'
  return '📎'
}
export function filtroParaMime(filtro: string): (mime: string | null) => boolean {
  switch (filtro) {
    case 'pdf':      return (mime) => mime === 'application/pdf'
    case 'imagem':   return (mime) => !!mime && mime.startsWith('image/')
    case 'planilha': return (mime) => !!mime && (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv'))
    default:         return () => true
  }
}
