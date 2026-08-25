/**
 * Fluxo de simulação de CGI / Home Equity — acionado a partir de workflow-consulta.ts
 * (*simula avulso) e workflow-captacao.ts (*cria cliente), quando
 * `dados.produto_normalizado === 'CGI_HOME_EQUITY'`.
 *
 * Reaproveita a sessão de simulação pendente (simula-pendente.ts) e o envio de PDF via
 * WhatsApp (uazapi-helpers.ts), mas usa motor, validação e PDF PRÓPRIOS do CGI
 * (src/lib/simuladorCgi/) — isolado do motor de financiamento imobiliário.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DadosCaptacaoNormalizados } from './normalizador-captacao'
import { executarSimulacaoCgi } from '@/lib/simuladorCgi/engine'
import { gerarPDFCgiBuffer } from '@/lib/simuladorCgi/gerarPDFBuffer'
import { montarRespostaSimulacaoCgi } from '@/lib/simuladorCgi/resposta'
import { LTV_PADRAO_CGI } from '@/lib/simuladorCgi/constantes'
import type { InputCgi } from '@/lib/simuladorCgi/tipos'
import { enviarPDFUazapi } from './uazapi-helpers'

export interface WorkflowCgiContexto {
  empresa_id: string
  usuario_id: string
  usuario_nome: string
  supabase: SupabaseClient
  instancia_token?: string
  telefone_destino?: string
  telefone_remetente?: string
  telefone_cliente?: string
  telefone_operador?: string
  tipo_vinculo?: 'AVULSA_SEM_CPF'
  vem_de_pendente?: boolean
  /** true = *simula avulso (workflow-consulta); false = *cria cliente (workflow-captacao) */
  usouConsulta: boolean
  leadIdExistente?: string
  pessoaIdExistente?: string
  /** Prefixo já pronto (ex.: "✅ Lead atualizado.") — usado pelo workflow-captacao. */
  cabecalhoPrefixo?: string
}

const RE_QUER_MAXIMO = /\bm[aá]xim[oa]\b/i

export async function executarFluxoCgi(
  textoBruto: string,
  dados: DadosCaptacaoNormalizados,
  ctx: WorkflowCgiContexto,
): Promise<string> {
  const { empresa_id, usuario_id, usuario_nome, supabase } = ctx
  const prefixo = ctx.cabecalhoPrefixo ? `${ctx.cabecalhoPrefixo}\n\n` : ''

  // ── Validação mínima ────────────────────────────────────────────────────
  let valorDesejado = dados.valor_financiado

  // "Quero o máximo" sem valor de crédito explícito → assume o teto de LTV padrão.
  if (valorDesejado == null && dados.valor_imovel != null && RE_QUER_MAXIMO.test(textoBruto)) {
    valorDesejado = Math.round(dados.valor_imovel * LTV_PADRAO_CGI)
  }

  const camposFaltantes: string[] = []
  if (dados.valor_imovel == null) camposFaltantes.push('Valor do imóvel (dado em garantia)')
  if (valorDesejado == null) camposFaltantes.push('Valor de crédito desejado')

  if (camposFaltantes.length > 0) {
    if (!ctx.vem_de_pendente && ctx.telefone_operador) {
      const { salvarSimulaPendente } = await import('./simula-pendente')
      await salvarSimulaPendente(supabase, empresa_id, ctx.telefone_operador, {
        motivo: 'completar_dados_simulacao',
        dadosCapturados: dados,
        usouConsulta: ctx.usouConsulta,
        leadIdExistente: ctx.leadIdExistente,
        pessoaIdExistente: ctx.pessoaIdExistente,
      })
    }
    const lista = camposFaltantes.map((c) => `• ${c}`).join('\n')
    return [
      `${prefixo}⚠️ *Simulação de CGI incompleta — dados insuficientes.*`,
      '',
      'Faltam as seguintes informações:',
      lista,
      '',
      'Responda com os dados faltantes para continuar.',
    ].join('\n')
  }

  // ── Motor de simulação ───────────────────────────────────────────────────
  const input: InputCgi = {
    valorImovel: dados.valor_imovel!,
    valorDesejado: valorDesejado!,
    prazoMeses: dados.prazo_meses ?? undefined,
    rendaMensal: dados.renda_formal != null || dados.renda_informal != null
      ? (dados.renda_formal ?? 0) + (dados.renda_informal ?? 0)
      : undefined,
    bancosIds: dados.bancos_cgi_ids ?? [],
  }
  const resultado = executarSimulacaoCgi(input)

  // ── Persistência em simulacoes_central ───────────────────────────────────
  // tipo aceita apenas 'custas' | 'financiamento' | 'consorcio' (CHECK constraint) —
  // reaproveita 'financiamento' e diferencia via resultado_json.produto, em vez de
  // migrar o schema para este produto isolado/preliminar.
  const nomeDisplay = dados.nome?.trim() || 'Cliente não identificado'
  const bancoMenorPrestacao = resultado.bancos.find((b) => b.bancoId === resultado.bancoMenorPrestacaoId)?.bancoNome ?? null

  const { data: simData, error: simErr } = await supabase
    .from('simulacoes_central')
    .insert({
      empresa_id,
      tipo: 'financiamento',
      status: 'concluida',
      tipo_simulacao: 'consulta',
      origem_canal: 'whatsapp',
      nome_cliente: nomeDisplay,
      cpf_cliente: ctx.tipo_vinculo === 'AVULSA_SEM_CPF' ? null : (dados.cpf ?? null),
      banco: bancoMenorPrestacao,
      responsavel_id: usuario_id,
      resultado_json: {
        produto: 'CGI',
        modo: 'CGI_HOME_EQUITY',
        input: resultado.input,
        bancos: resultado.bancos,
        bancoMenorPrestacaoId: resultado.bancoMenorPrestacaoId,
        _input_normalizado: dados as unknown as Record<string, unknown>,
      } as unknown as Record<string, unknown>,
      lead_id: ctx.leadIdExistente ?? null,
      pdf_status: 'nao_gerado',
    })
    .select('id')
    .single()

  if (simErr) {
    console.error('[workflow-cgi] Erro ao salvar simulação:', simErr)
  }
  const simulacaoId: string | null = simData?.id ?? null

  async function atualizarPdfStatus(status: 'enviado' | 'erro' | 'nao_gerado', opts?: { erro?: string; enviado_em?: string }) {
    if (!simulacaoId) return
    await supabase.from('simulacoes_central').update({
      pdf_status: status,
      pdf_erro: opts?.erro ?? null,
      pdf_enviado_em: opts?.enviado_em ?? null,
    }).eq('id', simulacaoId)
  }

  // ── PDF + WhatsApp ────────────────────────────────────────────────────────
  const tokenEfetivo = ctx.instancia_token || process.env.UAZAPI_INSTANCE_TOKEN || ''
  const destinoEfetivo = ctx.telefone_destino || ctx.telefone_cliente || ctx.telefone_remetente || ''

  let linhaPDF = '⚠️ PDF indisponível — resumo acima é válido.'

  if (tokenEfetivo && destinoEfetivo) {
    try {
      const pdfBuffer = await gerarPDFCgiBuffer(resultado, {
        clienteNome: dados.nome ?? undefined,
        responsavelNome: usuario_nome,
        cpfCliente: dados.cpf,
      })
      const hoje = new Date().toISOString().slice(0, 10)
      const nomeArquivo = `Simulacao CGI - ${nomeDisplay} - ${hoje}.pdf`
      await enviarPDFUazapi(destinoEfetivo, pdfBuffer, tokenEfetivo, nomeArquivo)
      await atualizarPdfStatus('enviado', { enviado_em: new Date().toISOString() })
      linhaPDF = '📎 PDF completo enviado acima.'
    } catch (errPdf) {
      const msg = errPdf instanceof Error ? errPdf.message : String(errPdf)
      console.error('[workflow-cgi] PDF falhou:', msg)
      await atualizarPdfStatus('erro', { erro: msg })
    }
  } else {
    console.warn('[workflow-cgi] PDF pulado — token ou destino ausente')
    await atualizarPdfStatus('nao_gerado')
  }

  // ── Resposta ──────────────────────────────────────────────────────────────
  const cabecalho = `📋 *Simulação Preliminar — CGI / Home Equity — ${nomeDisplay}*`
  const corpo = montarRespostaSimulacaoCgi(resultado)

  return [`${prefixo}${cabecalho}`, '', corpo, '', linhaPDF].join('\n')
}
