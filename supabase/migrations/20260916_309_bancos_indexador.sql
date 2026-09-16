-- Campo "indexador" (correção do saldo devedor) na tabela bancos — sobrescreve o
-- default fixado em BANCOS_CONFIG (src/lib/simuladorFinanciamento/constantes.ts),
-- mesmo padrão de taxa_anual/ltv_maximo/etc (migration 20260623_108).
--
-- Pedido do usuário (2026-09-16): PDF de simulação deve destacar o indexador de
-- cada banco pro cliente não confundir (ex.: Inter é IPCA, os demais bancos padrão
-- são TR) — e precisa ser editável aqui porque um banco pode trocar de indexador.
-- Só informativo/exibição — não afeta o cálculo da parcela.

ALTER TABLE bancos
  ADD COLUMN IF NOT EXISTS indexador TEXT CHECK (indexador IN ('TR', 'IPCA'));

COMMENT ON COLUMN bancos.indexador IS
  'Indexador de correção do saldo devedor (TR ou IPCA) — sobrescreve o default do código. Só informativo, exibido no PDF/WhatsApp da simulação.';

-- Preenche os bancos já cadastrados com o default hoje usado no código, pra quem
-- já tinha vínculo com o simulador não ficar sem indexador até editar manualmente.
UPDATE bancos SET indexador = 'IPCA' WHERE simulador_key = 'inter' AND indexador IS NULL;
UPDATE bancos SET indexador = 'TR'   WHERE simulador_key IN ('caixa', 'itau', 'bradesco', 'santander', 'bb') AND indexador IS NULL;
