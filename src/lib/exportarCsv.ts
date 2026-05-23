export function exportarCsv(rows: Record<string, unknown>[], nomeArquivo: string) {
  if (rows.length === 0) return
  const BOM = '\uFEFF'
  const cabecalhos = Object.keys(rows[0])
  const cabecalho = cabecalhos.map((c) => `"${c}"`).join(';')
  const corpo = rows.map((row) =>
    cabecalhos.map((k) => `"${String(row[k] ?? '').replace(/"/g, '""')}"`).join(';')
  ).join('\n')
  const conteudo = BOM + cabecalho + '\n' + corpo
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nomeArquivo.endsWith('.csv') ? nomeArquivo : `${nomeArquivo}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
