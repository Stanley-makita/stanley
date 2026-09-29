/** Formulário de banco com N vagas e proposta com mais compradores: avisar, nunca cortar em silêncio. */
export function avisoVagasCompradores(rotulo: string, vagas: number, compradores: Array<{ nome: string }>): string | null {
  if (compradores.length <= vagas) return null
  const fora = compradores.slice(vagas).map(c => c.nome).join(', ')
  return `${rotulo}: o formulário tem ${vagas} comprador(es) e a proposta tem ${compradores.length}. Ficou de fora: ${fora} — gere uma 2ª via para ele(s).`
}
