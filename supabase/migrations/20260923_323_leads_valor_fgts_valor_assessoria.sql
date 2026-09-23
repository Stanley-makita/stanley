-- Complementa a migration 20260923_322: além da intenção (fgts/tem_assessoria
-- boolean), a aba Oportunidade do Lead passa a capturar também o VALOR em R$
-- de cada um, exatamente como já acontece no modal "Dados do Negócio" do
-- Processo. Pedido do usuário (2026-09-23, mesma sessão): o comercial pode
-- já digitar o valor estimado na Captação, e esse valor deve acompanhar o
-- lead quando ele virar Processo pelo "+ Novo Processo" (Financiamento/CGI),
-- pré-preenchendo o campo lá em vez de abrir vazio.
alter table leads
  add column if not exists valor_fgts numeric(12,2),
  add column if not exists valor_assessoria numeric(12,2);
