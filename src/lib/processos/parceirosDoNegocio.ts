// Parceiros de um negócio moram em processo_parceiros (lista do card "Parceiro Comercial").
// processos.parceiro_id é o campo antigo (só preenchido na conversão do "indicado por" do lead) —
// qualquer leitor junta os dois, sem repetir (mesmo padrão de producaoRelacionamentos.ts).
type ParceiroResumo = { id: string; nome: string } | null | undefined

export function nomesParceirosDoNegocio(p: {
  parceiro?: ParceiroResumo
  parceiros_vinculados?: { parceiro?: ParceiroResumo }[] | null
}): string {
  const porId = new Map<string, string>()
  for (const parc of [p.parceiro, ...(p.parceiros_vinculados ?? []).map(v => v.parceiro)]) {
    if (parc?.id && parc.nome && !porId.has(parc.id)) porId.set(parc.id, parc.nome)
  }
  return Array.from(porId.values()).join(', ')
}
