import { z } from 'zod'
import type { ResumoNegociacao } from './entenderNegociacao'

const texto = z.string().nullable().default(null)
const numero = z.number().finite().nonnegative().nullable().default(null)
const pessoa = z.object({
  nome: texto, cpf: texto, rg: texto, orgao_emissor_rg: texto, cnh: texto,
  estado_civil: texto, regime_casamento: texto, profissao: texto, nacionalidade: texto,
  data_nascimento: texto, endereco: texto, email: texto, data_casamento: texto, conjuge_nome: texto,
})
const schema = z.object({
  compradores: z.array(pessoa), vendedores: z.array(pessoa),
  imovel: z.object({ descricao: texto, endereco: texto, matricula: texto, cartorio: texto, area: texto, cadastro_prefeitura: texto, cidade: texto, uf: texto }),
  valor: numero, entrada: numero, saldo: texto, valor_financiado: numero, banco_financiador: texto,
  prazo_posse_dias: numero, condicao_posse: texto, multa_percentual: numero, cidade: texto,
  clausula_pagamento_complementar: texto,
  painel_inteligencia: z.array(z.object({ texto: z.string(), status: z.enum(['ok', 'atencao']) })),
  testemunhas: z.array(z.object({ nome: texto, cpf: texto, rg: texto, profissao: texto, endereco: texto, email: texto })),
  corretor: z.object({ nome: texto, cpf: texto, creci: texto, email: texto, telefone: texto }).nullable().default(null),
  comissao: z.object({ valor: numero, percentual: numero, responsavel: z.enum(['comprador', 'vendedor']).nullable().default(null), momento_pagamento: texto }).nullable().default(null),
  certidoes: z.array(z.object({ tipo: texto, numero: texto, orgao_emissor: texto, data_emissao: texto, validade: texto })),
  intermediadores: z.array(z.object({ nome: z.string(), documento: texto, creci: texto, percentual: numero, valor: numero, dados_pagamento: texto })).optional(),
})

export function validarRespostaResumo(dados: unknown): ResumoNegociacao {
  const resultado = schema.safeParse(dados)
  if (!resultado.success) throw new Error('A análise retornou dados incompletos ou inválidos. Tente novamente.')
  return resultado.data
}
