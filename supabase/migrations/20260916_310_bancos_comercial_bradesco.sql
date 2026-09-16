-- Parametrização do Bradesco Comercial PF (financiamento de imóvel comercial,
-- pessoa física) — pedido do usuário (2026-09-16). Até agora, o motor bloqueava
-- TODO banco que não fosse Caixa para modalidade 'comercial' (engine.ts,
-- simularTodosBancos) — o Bradesco passa a ser liberado nessa modalidade.
--
-- Taxa/MIP/DFI específicos de comercial ficam em colunas NOVAS (não misturam
-- com taxa_anual/seguro_mip/seguro_dfi, que continuam sendo só do residencial
-- do mesmo banco) — mesma linha da tabela `bancos` (uma linha por banco físico,
-- simulador_key='bradesco'), reaproveitando toda a infraestrutura de override
-- já existente (Configurações > Bancos, carregarOverridesBancos, etc.), sem
-- precisar estender o tipo BancoId nem criar uma segunda "linha de banco".
--
-- LTV (70%), prazo máximo (240 meses) e parcela mínima (R$200) do comercial
-- são regra publicada pelo Bradesco, não taxa de mercado que varia — ficam
-- fixos em código (constantes.ts), não nesta tabela.

ALTER TABLE bancos
  ADD COLUMN IF NOT EXISTS taxa_anual_comercial NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS mip_comercial        NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS dfi_comercial        NUMERIC(9,6);

COMMENT ON COLUMN bancos.taxa_anual_comercial IS
  'Taxa de juros anual a.a. específica de financiamento de imóvel COMERCIAL (ex: 13.99 = 13,99%) — independente de taxa_anual (residencial). Hoje só lida pro Bradesco (simulador_key=bradesco). Vazio = sem taxa comercial confirmada ainda.';
COMMENT ON COLUMN bancos.mip_comercial IS
  'Alíquota MIP mensal (%) específica de comercial — independente de seguro_mip (residencial). Vazio = usa a tabela do residencial como proxy até haver dado real calibrado.';
COMMENT ON COLUMN bancos.dfi_comercial IS
  'Alíquota DFI mensal (%) específica de comercial — independente de seguro_dfi (residencial). Vazio = usa o valor do residencial como proxy até haver dado real calibrado.';
