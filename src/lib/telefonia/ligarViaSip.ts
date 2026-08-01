// DDD da empresa (Maringá) — a central SIP local está configurada pra
// discagem só local: confirmado que incluir o DDI (55) já quebra a ligação,
// e incluir o DDD também (mesmo sem o 55) não fecha — só disca quando é só o
// número puro, do jeito que se discaria manualmente de dentro da própria
// área local. Fora do DDD local, mantemos DDD+número (sem 55) — formato
// padrão de discagem nacional em centrais SIP; nunca tiramos o DDD de um
// número de fora, senão a ligação pode fechar pra pessoa errada (mesmo final
// de número, DDD diferente).
const DDD_EMPRESA = '44'

// Chamada de voz real (áudio de verdade, ao contrário da API de chamada da
// Uazapi, que só faz o telefone tocar). Abre o softphone já configurado na
// máquina (ex: MicroSIP). Usa tel: (não sip:usuario@dominio) — colar um
// domínio explícito no link muda a rota de discagem e a ligação não fecha;
// tel: só passa o número puro, igual discar manualmente no app.
export function ligarViaSip(telefone: string) {
  const digits = telefone.replace(/\D/g, '')
  const semDDI = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits
  const ddd = semDDI.slice(0, 2)
  const numeroLocal = semDDI.slice(2)
  const discagem = ddd === DDD_EMPRESA ? numeroLocal : `${ddd}${numeroLocal}`
  window.location.href = `tel:${discagem}`
}
