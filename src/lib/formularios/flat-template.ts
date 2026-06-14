// Resolvedor de templates JSON de coordenadas para PDFs flat (sem AcroForm)
// Uso: carregarCamposFlat('BANCO_DO_BRASIL/SCR.json', dados)
import { readFileSync } from 'fs'
import path from 'path'
import type { DadosProcesso } from './dados'
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

// Expande aliases convenientes sobre DadosProcesso para resolução por caminho
function expandirContexto(dados: DadosProcesso): Record<string, unknown> {
  const compradorPrincipal =
    dados.compradores.find((c) => c.principal) ?? dados.compradores[0] ?? {}
  return {
    ...dados,
    comprador_principal: compradorPrincipal,
  }
}

// Navega um objeto por caminho pontilhado: "comprador_principal.nome"
function resolverCaminho(caminho: string, dados: DadosProcesso): string {
  if (caminho.startsWith('@')) {
    return BUILTIN[caminho]?.(dados) ?? ''
  }
  const ctx = expandirContexto(dados)
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
}

type TemplateFlatDef = {
  campos: CampoFlatDef[]
}

/**
 * Lê um template JSON de coordenadas e resolve os valores a partir dos dados do lead/processo.
 * @param jsonRelativo Caminho relativo a public/formularios/ (ex: "BANCO_DO_BRASIL/SCR.json")
 * @param dados        Dados do lead ou processo
 */
export function carregarCamposFlat(
  jsonRelativo: string,
  dados: DadosProcesso,
): CampoTextoFlat[] {
  const absPath = path.join(process.cwd(), 'public', 'formularios', jsonRelativo)
  const def = JSON.parse(readFileSync(absPath, 'utf8')) as TemplateFlatDef

  return def.campos.map((c): CampoTextoFlat => {
    let texto = resolverCaminho(c.valor, dados)
    if (c.formatador && FORMATADOR[c.formatador]) {
      texto = FORMATADOR[c.formatador](texto)
    }
    return {
      tipo:    'texto_flat',
      pagina:  c.pagina ?? 0,
      x:       c.x,
      y:       c.y,
      tamanho: c.tamanho,
      texto,
    }
  })
}
