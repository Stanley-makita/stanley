-- ============================================================
-- 336 — Consórcio: tipo de lance (fixo / livre) por cota e no negócio (02-03/10/2026, pedido do Marcio).
--
-- processo_cotas.tipo_lance: o lance de CADA cota (formulário "Nova cota" / editar cota).
-- processos.tipo_lance: o padrão do negócio ("Dados da Carta") — vale para a cota sem tipo marcado.
-- Usado na exportação de Negócios › Consórcio (grupo, cota, cliente, CPF, tipo de lance).
-- Nulo = não informado. Rodar primeiro no STAGING, depois na produção no merge.
-- ============================================================

ALTER TABLE processo_cotas ADD COLUMN IF NOT EXISTS tipo_lance text;
ALTER TABLE processos      ADD COLUMN IF NOT EXISTS tipo_lance text;

ALTER TABLE processo_cotas DROP CONSTRAINT IF EXISTS chk_processo_cotas_tipo_lance;
ALTER TABLE processo_cotas ADD CONSTRAINT chk_processo_cotas_tipo_lance CHECK (tipo_lance IS NULL OR tipo_lance IN ('fixo', 'livre'));
ALTER TABLE processos DROP CONSTRAINT IF EXISTS chk_processos_tipo_lance;
ALTER TABLE processos ADD CONSTRAINT chk_processos_tipo_lance CHECK (tipo_lance IS NULL OR tipo_lance IN ('fixo', 'livre'));

COMMENT ON COLUMN processo_cotas.tipo_lance IS 'Lance da cota: fixo | livre (nulo = não informado; cai no processos.tipo_lance).';
COMMENT ON COLUMN processos.tipo_lance      IS 'Lance padrão do consórcio (Dados da Carta): fixo | livre.';

NOTIFY pgrst, 'reload schema';
