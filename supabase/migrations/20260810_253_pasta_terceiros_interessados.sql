-- ============================================================
-- Migration: 20260810_253_pasta_terceiros_interessados.sql
-- Nova pasta fixa "Terceiros Interessados" no Construtor de Contratos
-- (procurador, cônjuge não incluído como parte, herdeiro, etc. — alguém
-- que não é comprador, vendedor nem o próprio imóvel, mas cujos
-- documentos precisam constar no processo). Mesmo padrão da migration
-- 157 (catalogo_pastas_processo).
-- ============================================================

INSERT INTO catalogo_pastas_processo (codigo, nome, ordem_exibicao) VALUES
  ('terceiros', '01B Terceiros Interessados', 15);
