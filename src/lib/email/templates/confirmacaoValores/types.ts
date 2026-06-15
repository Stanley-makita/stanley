export interface DadosConfirmacaoValores {
  cliente_nome: string
  banco_nome: string
  engenharia_laudo: number | null
  compra_venda: number | null
  entrada: number | null
  fgts: number | null
  subsidio: number | null
  valor_financiado: number | null
  despesas_financiadas: number | null
  valor_total_financiado: number | null
  prazo_meses: number | null
  modalidade: string
  amortizacao: string | null
  taxa: string | null
  iof: number | null
  tarifa_banco: number | null
  observacoes: string | null
  usuario_nome: string
  usuario_funcao: string
  usuario_email: string
  usuario_telefone_whatsapp: string | null
}
