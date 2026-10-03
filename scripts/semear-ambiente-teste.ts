/**
 * Popula o ambiente de TESTE (Supabase credifon-crm-staging) com clientes, leads e negócios
 * fictícios, para testar correções no Preview sem precisar cadastrar tudo à mão.
 *
 *   npm run semear:teste            → cria (só se ainda não existir — roda de novo sem duplicar)
 *   npm run semear:teste -- --limpar → apaga só o que este script criou (pelos CPFs abaixo)
 *
 * Usa .env.teste e RECUSA rodar se a URL não for a do staging — nunca toca na produção.
 * Participantes são gravados pelos mesmos serviços das telas (escritaServidor/escritaNegocio),
 * então os dados se comportam como os reais (titular, cônjuge anuente, compõe renda, vendedor).
 */
import fs from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { incluirParticipanteLead, sincronizarLead } from '../src/lib/participantes/escritaServidor'
import { participantesIniciaisDoNegocio, incluirLinhaNegocio } from '../src/lib/participantes/escritaNegocio'
import { registrarCasamento } from '../src/lib/participantes/casamentoServidor'

const REF_STAGING = 'cjsvineuakhzkqbazsmi'

const env = Object.fromEntries(
  fs.readFileSync('.env.teste', 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)
if (!env.NEXT_PUBLIC_SUPABASE_URL?.includes(REF_STAGING)) {
  console.error('ABORTADO: .env.teste não aponta para o staging. Este script nunca roda na produção.')
  process.exit(1)
}
const sb: SupabaseClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// CPF válido a partir de 9 dígitos (determinístico — o mesmo CPF a cada execução).
function cpf(base: string): string {
  const d = base.split('').map(Number)
  for (const n of [9, 10]) {
    const soma = d.slice(0, n).reduce((s, x, i) => s + x * (n + 1 - i), 0)
    const r = (soma * 10) % 11
    d.push(r === 10 ? 0 : r)
  }
  return d.join('')
}

type P = { chave: string; nome: string; cpf: string; nasc: string; renda?: number; profissao?: string; email?: string }
const PESSOAS: P[] = [
  { chave: 'ana',      nome: 'ANA PAULA TESTE RIBEIRO',     cpf: cpf('111444777'), nasc: '1990-04-12', renda: 8500,  profissao: 'Enfermeira' },
  { chave: 'carlos',   nome: 'CARLOS EDUARDO TESTE LIMA',   cpf: cpf('222555888'), nasc: '1988-09-30', renda: 12000, profissao: 'Engenheiro' },
  { chave: 'beatriz',  nome: 'BEATRIZ TESTE LIMA',          cpf: cpf('333666999'), nasc: '1991-01-05', renda: 4500,  profissao: 'Professora' },
  { chave: 'diego',    nome: 'DIEGO TESTE MARTINS',         cpf: cpf('123123123'), nasc: '1995-07-21', renda: 3200,  profissao: 'Vendedor' },
  { chave: 'elaine',   nome: 'ELAINE TESTE SOUZA',          cpf: cpf('234234234'), nasc: '1985-11-02', renda: 6000,  profissao: 'Bancária' },
  { chave: 'fabio',    nome: 'FABIO TESTE SOUZA',           cpf: cpf('345345345'), nasc: '1960-03-15', renda: 7000,  profissao: 'Aposentado' },
  { chave: 'gabriela', nome: 'GABRIELA TESTE ALVES',        cpf: cpf('456456456'), nasc: '1993-06-18', renda: 9800,  profissao: 'Advogada' },
  { chave: 'heitor',   nome: 'HEITOR TESTE COSTA',          cpf: cpf('567567567'), nasc: '1998-02-27', renda: 2800,  profissao: 'Estudante' },
  { chave: 'afranio',  nome: 'AFRANIO TESTE COSTA',         cpf: cpf('678678678'), nasc: '1965-10-10', renda: 15000, profissao: 'Médico' },
  { chave: 'maria',    nome: 'MARIA TESTE COSTA',           cpf: cpf('789789789'), nasc: '1967-12-01', renda: 0,     profissao: 'Do lar' },
  { chave: 'igor',     nome: 'IGOR TESTE FERNANDES',        cpf: cpf('891891891'), nasc: '1987-08-08', renda: 20000, profissao: 'Empresário' },
  { chave: 'julia',    nome: 'JULIA TESTE NASCIMENTO',      cpf: cpf('912912912'), nasc: '1992-05-25', renda: 5500,  profissao: 'Designer' },
  { chave: 'kleber',   nome: 'KLEBER TESTE VENDEDOR',       cpf: cpf('135135135'), nasc: '1970-01-20' },
  { chave: 'lucia',    nome: 'LUCIA TESTE VENDEDORA',       cpf: cpf('246246246'), nasc: '1972-04-04' },
  { chave: 'marcos',   nome: 'MARCOS TESTE OLIVEIRA',       cpf: cpf('357357357'), nasc: '1983-09-09', renda: 11000, profissao: 'Contador' },
  { chave: 'natalia',  nome: 'NATALIA TESTE PEREIRA',       cpf: cpf('468468468'), nasc: '1996-03-03', renda: 4200,  profissao: 'Recepcionista' },
]
const CPFS = PESSOAS.map(p => p.cpf)
const PARCEIROS = ['LELIO TESTE PARCEIRO', 'IMOBILIARIA TESTE CENTRO']

function falhou(o: unknown, onde: string) {
  if (o && typeof o === 'object' && 'erro' in o) throw new Error(`${onde}: ${(o as { erro: string }).erro}`)
}

async function limpar(empresaId: string) {
  const { data: pessoas } = await sb.from('pessoas').select('id').eq('empresa_id', empresaId).in('cpf', CPFS)
  const ids = (pessoas ?? []).map(p => p.id)
  const { data: parts } = ids.length ? await sb.from('participacoes').select('lead_id, processo_id').in('pessoa_id', ids) : { data: [] }
  const procs = Array.from(new Set((parts ?? []).map(p => p.processo_id).filter(Boolean))) as string[]
  const leads = Array.from(new Set((parts ?? []).map(p => p.lead_id).filter(Boolean))) as string[]
  const { data: leadsDiretos } = ids.length ? await sb.from('leads').select('id').in('pessoa_id', ids) : { data: [] }
  for (const l of leadsDiretos ?? []) if (!leads.includes(l.id)) leads.push(l.id)
  const { data: procsDiretos } = ids.length ? await sb.from('processos').select('id').in('pessoa_id', ids) : { data: [] }
  for (const p of procsDiretos ?? []) if (!procs.includes(p.id)) procs.push(p.id)

  const del = async (t: string, col: string, vals: string[]) => {
    if (!vals.length) return
    const { error } = await sb.from(t).delete().in(col, vals)
    if (error) throw new Error(`limpar ${t}: ${error.message}`)
  }
  await del('processo_parceiros', 'processo_id', procs)
  await del('financeiro_consorcio_receber', 'processo_id', procs)
  await del('financeiro_consorcio_comercial_pagar', 'processo_id', procs)
  await del('processo_cotas', 'processo_id', procs)
  await del('processo_fases_historico', 'processo_id', procs)
  await del('comunicacao_relacionamentos', 'processo_id', procs)
  await del('participacoes', 'processo_id', procs)
  await del('processos', 'id', procs)
  await del('lead_historico', 'lead_id', leads)
  await del('participacoes', 'lead_id', leads)
  await del('leads', 'id', leads)
  await del('pessoa_relacionamentos', 'pessoa_a_id', ids)
  await del('pessoa_relacionamentos', 'pessoa_b_id', ids)
  await del('pessoas_alteracoes', 'pessoa_id', ids)
  await del('participacoes', 'pessoa_id', ids)
  if (ids.length) {
    await sb.from('pessoas').update({ conjuge_pessoa_id: null }).in('id', ids)
    await del('pessoas', 'id', ids)
  }
  const { error } = await sb.from('parceiros').delete().eq('empresa_id', empresaId).in('nome', PARCEIROS)
  if (error) throw new Error(`limpar parceiros: ${error.message}`)
  console.log(`Limpo: ${ids.length} pessoas, ${leads.length} leads, ${procs.length} negócios, parceiros de teste.`)
}

async function main() {
  const { data: marcio, error: eU } = await sb.from('usuarios').select('id, empresa_id').eq('nome', 'Marcio Fontinhas').single()
  if (eU || !marcio) throw new Error('Usuário Marcio Fontinhas não encontrado no staging')
  const empresaId = marcio.empresa_id as string

  if (process.argv.includes('--limpar')) return limpar(empresaId)

  const { count: jaTem } = await sb.from('pessoas').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).in('cpf', CPFS)
  if ((jaTem ?? 0) > 0) {
    console.log('Dados de teste já existem. Para recriar do zero: npm run semear:teste -- --limpar  e depois  npm run semear:teste')
    return
  }

  const { data: usuarios } = await sb.from('usuarios').select('id, nome').eq('empresa_id', empresaId).eq('ativo', true)
  const u = (nome: string) => {
    const x = (usuarios ?? []).find(y => y.nome === nome)
    if (!x) throw new Error(`Usuário ${nome} não encontrado`)
    return x.id as string
  }
  const { data: fases } = await sb.from('fases').select('id, modulo, nome').eq('empresa_id', empresaId).eq('ativo', true)
  const fase = (modulo: string, nome: string) => {
    const x = (fases ?? []).find(f => f.modulo === modulo && f.nome === nome)
    if (!x) throw new Error(`Fase ${modulo}/${nome} não encontrada`)
    return x.id as string
  }
  const { data: bancos } = await sb.from('bancos').select('id, nome').eq('empresa_id', empresaId)
  const banco = (nome: string) => (bancos ?? []).find(b => b.nome === nome)?.id ?? null

  // Pessoas
  const pid: Record<string, string> = {}
  for (const p of PESSOAS) {
    const { data, error } = await sb.from('pessoas').insert({
      empresa_id: empresaId, nome: p.nome, cpf: p.cpf, data_nascimento: p.nasc,
      profissao: p.profissao ?? null, renda_formal: p.renda ?? null, estado_civil: 'solteiro',
      email: `${p.chave}.teste@exemplo.com`,
    }).select('id').single()
    if (error) throw new Error(`pessoa ${p.nome}: ${error.message}`)
    pid[p.chave] = data.id
  }

  // Casais (registrados dos dois lados, como na tela "Casado(a) com")
  for (const [a, b] of [['carlos', 'beatriz'], ['afranio', 'maria'], ['elaine', 'fabio']]) {
    falhou(await registrarCasamento(sb, empresaId, pid[a], pid[b], { estadoCivil: 'casado', regime: 'comunhao_parcial', data: '2015-05-20' }), `casamento ${a}`)
  }

  // Parceiros
  const parc: string[] = []
  for (const nome of PARCEIROS) {
    const { data, error } = await sb.from('parceiros').insert({
      empresa_id: empresaId, nome, tipo: nome.startsWith('IMOB') ? 'empresa' : 'pessoa_fisica', ativo: true,
    }).select('id').single()
    if (error) throw new Error(`parceiro ${nome}: ${error.message}`)
    parc.push(data.id)
  }

  // Leads (Captação) — fases, modalidades, status e origens variados
  type L = { chave: string; fase: string; modalidade: string; status: string; origem: string; resp: string; valor: number; imovel: number; copart?: string; parceiro?: number }
  const LEADS: L[] = [
    { chave: 'ana',      fase: 'Novo',         modalidade: 'SBPE',        status: 'aguardando_documentos', origem: 'whatsapp',  resp: 'Andresa',          valor: 240000, imovel: 300000 },
    { chave: 'carlos',   fase: 'Documentação', modalidade: 'SBPE',        status: 'documentacao_recebida', origem: 'indicacao', resp: 'Bruno Machado',    valor: 480000, imovel: 600000, parceiro: 0 },
    { chave: 'diego',    fase: 'Simulação',    modalidade: 'PMCMV',       status: 'em_simulacao',          origem: 'whatsapp',  resp: 'Andresa',          valor: 180000, imovel: 220000 },
    { chave: 'elaine',   fase: 'Crédito',      modalidade: 'Pro_Cotista', status: 'em_analise_credito',    origem: 'indicacao', resp: 'Bruno Machado',    valor: 320000, imovel: 400000 },
    { chave: 'heitor',   fase: 'Crédito',      modalidade: 'SBPE',        status: 'pre_aprovado',          origem: 'whatsapp',  resp: 'Marcio Fontinhas', valor: 350000, imovel: 450000, copart: 'afranio' },
    { chave: 'julia',    fase: 'iniciado',     modalidade: 'CGI',         status: 'aguardando_documentos', origem: 'indicacao', resp: 'Luciana Fontinhas', valor: 150000, imovel: 500000, parceiro: 1 },
    { chave: 'natalia',  fase: 'Crédito',      modalidade: 'PMCMV',       status: 'reprovado',             origem: 'whatsapp',  resp: 'Andresa',          valor: 160000, imovel: 190000 },
  ]
  for (let i = 0; i < LEADS.length; i++) {
    const l = LEADS[i]
    const p = PESSOAS.find(x => x.chave === l.chave)!
    const telefone = `55449880000${String(i + 1).padStart(2, '0')}`.slice(0, 13)  // fictício, fora da equipe
    const { data, error } = await sb.from('leads').insert({
      empresa_id: empresaId, pessoa_id: pid[l.chave], nome: p.nome, cpf: p.cpf, data_nascimento: p.nasc, telefone,
      fase_id: fase('leads', l.fase), modalidade: l.modalidade, status_analise: l.status, origem: l.origem,
      responsavel_id: u(l.resp), valor_pretendido: l.valor, valor_imovel: l.imovel, entrada: l.imovel - l.valor,
      renda_formal: p.renda ?? null, produto_interesse: l.modalidade === 'CGI' ? 'cgi' : 'financiamento',
      cidade_imovel: 'Maringá', tipo_imovel: 'apartamento',
      parceiro_id: l.parceiro !== undefined ? parc[l.parceiro] : null,
    }).select('id').single()
    if (error) throw new Error(`lead ${p.nome}: ${error.message}`)
    falhou(await sincronizarLead(sb, data.id), `sync lead ${p.nome}`)
    if (l.copart) falhou(await incluirParticipanteLead(sb, empresaId, data.id, pid[l.copart]), `copart ${p.nome}`)
  }

  // Negócios — um de cada modalidade, nos módulos certos
  type N = {
    titular: string; modalidade: string; modulo: string; fase: string; banco?: string; valor?: number; imovel?: number
    comercial: string; operacional: string; vendedor?: string; copart?: string; parceiro?: number; assessoria?: boolean
    extra?: Record<string, unknown>
  }
  const NEGOCIOS: N[] = [
    { titular: 'gabriela', modalidade: 'SBPE',        modulo: 'processos', fase: 'Coleta de Documentos', banco: 'Itau',  valor: 400000, imovel: 500000, comercial: 'Bruno Machado',    operacional: 'Larissa', vendedor: 'kleber', parceiro: 0, assessoria: true },
    { titular: 'marcos',   modalidade: 'PMCMV',       modulo: 'processos', fase: 'Engenharia',           banco: 'Caixa', valor: 200000, imovel: 250000, comercial: 'Andresa',          operacional: 'Jessica', vendedor: 'lucia' },
    { titular: 'carlos',   modalidade: 'Pro_Cotista', modulo: 'processos', fase: 'Preparação',           banco: 'Caixa', valor: 380000, imovel: 480000, comercial: 'Marcio Fontinhas', operacional: 'Larissa', assessoria: true },
    { titular: 'igor',     modalidade: 'CGI',         modulo: 'processos', fase: 'Análise Juridica',     banco: 'Bradesco', valor: 300000, imovel: 900000, comercial: 'Luciana Fontinhas', operacional: 'Jessica', parceiro: 1 },
    { titular: 'ana',      modalidade: 'SFI',         modulo: 'processos', fase: 'Emissão Contrato',     banco: 'Santander', valor: 1200000, imovel: 1600000, comercial: 'Andresa', operacional: 'Larissa', copart: 'julia' },
    { titular: 'igor',     modalidade: 'Consorcio',   modulo: 'consorcio', fase: 'Atendimento Consultor', comercial: 'Bruno Machado', operacional: 'Larissa', extra: { administradora: 'Itaú', credito_desejado: 500000 } },
    { titular: 'julia',    modalidade: 'Contrato',    modulo: 'contrato',  fase: 'Minuta',               imovel: 350000, comercial: 'Marcio Fontinhas', operacional: 'Jessica', vendedor: 'kleber' },
    { titular: 'marcos',   modalidade: 'Registro',    modulo: 'registro',  fase: 'Preparação',           imovel: 250000, comercial: 'Andresa', operacional: 'Larissa' },
  ]
  // Número próprio (#proc-T01…): o gatilho que gera o número exige usuário logado (auth.uid()) e só roda
  // quando o número vem vazio — e assim nunca colide com os números gerados pela tela.
  for (let i = 0; i < NEGOCIOS.length; i++) {
    const n = NEGOCIOS[i]
    const p = PESSOAS.find(x => x.chave === n.titular)!
    const { data: proc, error } = await sb.from('processos').insert({
      empresa_id: empresaId, numero_processo: `#proc-T${String(i + 1).padStart(2, '0')}`,
      lead_id: null, pessoa_id: pid[n.titular], modalidade: n.modalidade,
      nome_imovel: `Processo de ${p.nome}`, status_processo: 'em_analise', status_emissao: 'nao_emitido',
      chance_emissao: 'incerteza', banco_id: n.banco ? banco(n.banco) : null,
      valor_imovel: n.imovel ?? null, valor_financiado: n.valor ?? null,
      valor_entrada: n.imovel && n.valor ? n.imovel - n.valor : null,
      tem_assessoria: n.assessoria ?? false, comercial_id: u(n.comercial), operacional_id: u(n.operacional),
      fase_atual_id: fase(n.modulo, n.fase), data_inicio: new Date().toISOString().slice(0, 10),
      ...(n.extra ?? {}),
    }).select('id, numero_processo').single()
    if (error) throw new Error(`negócio ${n.modalidade}: ${error.message}`)
    falhou(await participantesIniciaisDoNegocio(sb, empresaId, proc.id, {
      leadId: null, titular: { pessoa_id: pid[n.titular], nome: p.nome, cpf: p.cpf, email: null, telefone: null }, vendedores: null,
    }), `titular ${proc.numero_processo}`)
    if (n.copart) {
      const c = PESSOAS.find(x => x.chave === n.copart)!
      falhou(await incluirLinhaNegocio(sb, empresaId, proc.id, 'compradores', { nome: c.nome, cpf: c.cpf }), `copart ${proc.numero_processo}`)
    }
    if (n.vendedor) {
      const v = PESSOAS.find(x => x.chave === n.vendedor)!
      falhou(await incluirLinhaNegocio(sb, empresaId, proc.id, 'vendedores', { nome: v.nome, cpf: v.cpf }), `vendedor ${proc.numero_processo}`)
    }
    if (n.modalidade === 'Consorcio') {
      // Consórcio: crédito e administradora moram nas cotas (uma cancelada, que não entra no total).
      const { error: eC } = await sb.from('processo_cotas').insert([
        { empresa_id: empresaId, processo_id: proc.id, administradora_nome: 'Itaú', grupo: '40205', cota: '1001', tipo_bem: 'Imóvel', valor_carta: 300000, status_cota: 'ativo', status_pagamento: 'em_dia', tipo_parcela: 'reduzida' },
        { empresa_id: empresaId, processo_id: proc.id, administradora_nome: 'Itaú', grupo: '40205', cota: '1002', tipo_bem: 'Imóvel', valor_carta: 200000, status_cota: 'ativo', status_pagamento: 'em_dia', tipo_parcela: 'linear' },
        { empresa_id: empresaId, processo_id: proc.id, administradora_nome: 'Itaú', grupo: '40205', cota: '1003', tipo_bem: 'Imóvel', valor_carta: 150000, status_cota: 'cancelado', status_pagamento: 'em_dia', tipo_parcela: 'linear' },
      ])
      if (eC) throw new Error(`cotas ${proc.numero_processo}: ${eC.message}`)
    }
    if (n.parceiro !== undefined) {
      const { error: eP } = await sb.from('processo_parceiros').insert({ processo_id: proc.id, parceiro_id: parc[n.parceiro] })
      if (eP) throw new Error(`parceiro ${proc.numero_processo}: ${eP.message}`)
    }
    console.log(`  ${proc.numero_processo} ${n.modalidade} — ${p.nome}`)
  }

  console.log(`Pronto: ${PESSOAS.length} pessoas, ${LEADS.length} leads, ${NEGOCIOS.length} negócios, ${PARCEIROS.length} parceiros.`)
}

main().catch(e => { console.error('ERRO:', e instanceof Error ? e.message : e); process.exit(1) })
