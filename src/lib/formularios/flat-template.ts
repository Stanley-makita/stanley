// Resolvedor de templates JSON de coordenadas para PDFs flat (sem AcroForm)
// Uso: carregarCamposFlat('BANCO_DO_BRASIL/SCR.json', dados)
import { readFileSync } from 'fs'
import path from 'path'
import type { DadosProcesso, DadosComprador } from './dados'
import type { CampoTextoFlat } from './engine'
import { fmtCpf, fmtCnpj, fmtData, fmtMoeda, fmtDataHoje, localPadrao } from './helpers'

// Valores embutidos acessíveis via @nome no template
const BUILTIN: Record<string, (dados: DadosProcesso) => string> = {
  '@local_data':   (d) => `${localPadrao()}, ${fmtDataHoje()}`,
  '@data_hoje':    ()  => fmtDataHoje(),
  '@local_padrao': ()  => localPadrao(),
}

type Formatador = 'cpf' | 'cnpj' | 'data' | 'moeda'

const FORMATADOR: Record<Formatador, (v: string) => string> = {
  cpf:   (v) => fmtCpf(v),
  cnpj:  (v) => fmtCnpj(v),
  data:  (v) => fmtData(v),
  moeda: (v) => fmtMoeda(parseFloat(v) || 0),
}

// Expande aliases convenientes sobre DadosProcesso para resolução por caminho.
// `comprador_principal` sempre aponta pro proponente principal do negócio;
// `comprador_atual` aponta pra pessoa sendo preenchida no momento (default:
// o próprio principal) — usado pelos formulários "por pessoa" (ex: SCR), que
// geram um PDF para cada comprador/cônjuge/coparticipante.
function expandirContexto(dados: DadosProcesso, pessoaAtual?: DadosComprador): Record<string, unknown> {
  const compradorPrincipal =
    dados.compradores.find((c) => c.principal) ?? dados.compradores[0] ?? {}
  return {
    ...dados,
    comprador_principal: compradorPrincipal,
    comprador_atual: pessoaAtual ?? compradorPrincipal,
  }
}

// Navega um objeto por caminho pontilhado: "comprador_principal.nome"
function resolverCaminho(caminho: string, dados: DadosProcesso, pessoaAtual?: DadosComprador): string {
  if (caminho.startsWith('@')) {
    return BUILTIN[caminho]?.(dados) ?? ''
  }
  const ctx = expandirContexto(dados, pessoaAtual)
  const partes = caminho.split('.')
  let atual: unknown = ctx
  for (const parte of partes) {
    if (atual == null || typeof atual !== 'object') return ''
    atual = (atual as Record<string, unknown>)[parte]
  }
  return atual != null ? String(atual) : ''
}

// --- Tipos do arquivo JSON de template ---

type CampoFlatDef = {
  tipo: 'texto_flat'
  campo: string
  pagina?: number
  x: number
  y: number
  tamanho?: number
  valor: string        // caminho pontilhado ou @builtin
  formatador?: Formatador
  // Ver CampoTextoFlat em engine.ts — rótulo fixo + quebra condicional pra rótulos lado a lado
  prefixo?: string
  seColidirCom?: { campo: string; limiteX: number }
  xAlternativo?: number
  yAlternativo?: number
  prefixoAlternativo?: string
}

type TemplateFlatDef = {
  campos: CampoFlatDef[]
}

/**
 * Lê um template JSON de coordenadas e resolve os valores a partir dos dados do lead/processo.
 * @param jsonRelativo Caminho relativo a public/formularios/ (ex: "BANCO_DO_BRASIL/SCR.json")
 * @param dados        Dados do lead ou processo
 * @param pessoaAtual  Pessoa a usar em `comprador_atual` — ao gerar um formulário "por
 *                     pessoa" (ex: SCR) para o cônjuge ou um coparticipante, em vez do
 *                     proponente principal (default quando omitido).
 */
export function carregarCamposFlat(
  jsonRelativo: string,
  dados: DadosProcesso,
  pessoaAtual?: DadosComprador,
): CampoTextoFlat[] {
  const absPath = path.join(process.cwd(), 'public', 'formularios', jsonRelativo)
  const def = JSON.parse(readFileSync(absPath, 'utf8')) as TemplateFlatDef

  return def.campos.map((c): CampoTextoFlat => {
    let texto = resolverCaminho(c.valor, dados, pessoaAtual)
    if (c.formatador && FORMATADOR[c.formatador]) {
      texto = FORMATADOR[c.formatador](texto)
    }
    return {
      tipo:    'texto_flat',
      campo:   c.campo,
      pagina:  c.pagina ?? 0,
      x:       c.x,
      y:       c.y,
      tamanho: c.tamanho,
      texto,
      prefixo:           c.prefixo,
      seColidirCom:      c.seColidirCom,
      xAlternativo:      c.xAlternativo,
      yAlternativo:      c.yAlternativo,
      prefixoAlternativo: c.prefixoAlternativo,
    }
  })
}
