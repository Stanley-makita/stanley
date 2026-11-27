/** Textos do histórico de alterações da Pessoa (tela /pessoas/[id]). */

export const CAMPO_LABELS: Record<string, string> = {
  nome: 'Nome', email: 'E-mail', cpf: 'CPF', data_nascimento: 'Nascimento', telefone: 'Telefone',
  rg: 'RG', orgao_emissor: 'Órgão emissor', data_emissao: 'Data de emissão do RG',
  sexo: 'Sexo', profissao: 'Profissão', estado_civil: 'Estado civil', nacionalidade: 'Nacionalidade',
  cidade_nascimento: 'Cidade de nascimento', estado_nascimento: 'UF de nascimento',
  filiacao_mae: 'Nome da mãe', filiacao_pai: 'Nome do pai',
  registro_cnh: 'Registro CNH', validade_cnh: 'Validade CNH', primeira_habilitacao_cnh: '1ª habilitação',
  renda_formal: 'Renda formal', renda_informal: 'Renda informal', patrimonio_total: 'Patrimônio total',
  endereco_rua: 'Rua', endereco_numero: 'Número', endereco_complemento: 'Complemento',
  endereco_bairro: 'Bairro', endereco_cidade: 'Cidade', endereco_uf: 'UF', endereco_cep: 'CEP',
  empresa_nome: 'Empresa', empresa_cnpj: 'CNPJ da empresa',
  municipio_trabalho: 'Município de trabalho', uf_trabalho: 'UF de trabalho',
  conta_bancaria_banco: 'Banco', conta_bancaria_agencia: 'Agência',
  conta_bancaria_numero: 'Conta', conta_bancaria_digito: 'Dígito da conta',
  residente_exterior: 'Residente no exterior', pep: 'PEP', autoriza_oferta_marketing: 'Autoriza marketing',
  conjuge_nome: 'Nome do cônjuge', conjuge_cpf: 'CPF do cônjuge', conjuge_data_nascimento: 'Nasc. cônjuge',
  conjuge_telefone: 'Tel. cônjuge', conjuge_profissao: 'Profissão do cônjuge',
  conjuge_renda_formal: 'Renda formal cônjuge', conjuge_renda_informal: 'Renda informal cônjuge',
  regime_casamento: 'Regime de bens', data_casamento: 'Data do casamento',
  observacoes: 'Observações', tipo: 'Tipo',
}

export const ORIGEM_LABELS: Record<string, string> = {
  leads: 'via Captação',
  pessoas: 'via Cadastro',
  processos: 'via Negócios',
  ocr: 'via Extrair dados (OCR)',
}

const VALOR_LABELS: Record<string, Record<string, string>> = {
  estado_civil: {
    solteiro: 'Solteiro(a)', casado: 'Casado(a)', divorciado: 'Divorciado(a)', viuvo: 'Viúvo(a)',
    separado: 'Separado(a)', uniao_estavel: 'União estável',
  },
  regime_casamento: {
    comunhao_parcial: 'Comunhão Parcial', comunhao_total: 'Comunhão Total',
    comunhao_universal: 'Comunhão Universal', separacao_total: 'Separação Total',
    separacao_obrigatoria: 'Separação Obrigatória', participacao_final: 'Participação Final',
  },
  sexo: { M: 'Masculino', F: 'Feminino', masculino: 'Masculino', feminino: 'Feminino' },
}

const CAMPOS_MOEDA = new Set([
  'renda_formal', 'renda_informal', 'patrimonio_total', 'conjuge_renda_formal', 'conjuge_renda_informal',
])

export function rotuloCampo(campo: string): string {
  return CAMPO_LABELS[campo] ?? campo.replace(/_/g, ' ')
}

export function formatarValorAlteracao(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '(vazio)'
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não'
  if (CAMPOS_MOEDA.has(campo) && !Number.isNaN(Number(valor))) {
    return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }
  const texto = String(valor)
  const mapa = VALOR_LABELS[campo]
  if (mapa?.[texto]) return mapa[texto]
  const data = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
  if (data) return `${data[3]}/${data[2]}/${data[1]}`
  return texto
}

interface AlteracaoMinima {
  campos_alterados: string[]
  valores_anteriores: Record<string, unknown> | null
}

/**
 * Registro gravado antes da correção (2026-11): telas que gravavam TODOS os campos do
 * formulário a cada "Salvar", sem o valor anterior — não dá para saber o que mudou.
 */
export function eRegistroAntigo(a: AlteracaoMinima): boolean {
  const anteriores = a.valores_anteriores ?? {}
  return a.campos_alterados.length > 0 && Object.keys(anteriores).length === 0
}

/** Resumo de uma linha: "CPF e E-mail", "Nome, CPF e mais 3". */
export function resumoCampos(a: AlteracaoMinima, max = 3): string {
  if (eRegistroAntigo(a)) return 'salvou o cadastro (registro antigo)'
  const nomes = a.campos_alterados.map(rotuloCampo)
  if (nomes.length <= max) {
    return nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
  }
  return `${nomes.slice(0, max).join(', ')} e mais ${nomes.length - max}`
}
