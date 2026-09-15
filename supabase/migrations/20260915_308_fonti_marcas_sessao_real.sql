-- Bug real (apresentação pra equipe comercial, 2026-09-15): *fonti salva
-- num nome ambíguo (ex.: "Bruno" batendo com "Bruno Andresa" e "Bruno
-- Andresa dos santos") não achava NENHUM documento, mesmo com os
-- documentos certinho no banco — o retry de docs/fonti-comandos.ts não
-- ajudava porque o problema não era atraso, era a JANELA de busca errada.
--
-- Quando a ambiguidade é detectada sem uma sessão *fonti inicio já aberta,
-- o código cria uma linha nova em fonti_marcas só pra guardar
-- candidatos_pendentes — mas grava iniciado_at = now() nessa hora (o
-- momento em que o comercial digitou *salva, não o início de sessão real).
-- Esse mesmo campo iniciado_at é depois lido por obterMarcaInicio() e usado
-- como início da janela de busca de documentos em
-- vincularDocumentosRecentesPorTelefone — excluindo justamente os
-- documentos enviados ANTES do *salva, que é sempre o caso normal (manda
-- os docs primeiro, roda *salva depois).
--
-- Fix: nova coluna sessao_real distingue uma marca de sessão de verdade
-- (*fonti inicio / *fonti processo) de uma marca criada só pra guardar
-- candidatos_pendentes de uma ambiguidade. obterMarcaInicio() (código)
-- passa a só considerar iniciado_at quando sessao_real = true — senão
-- vincularDocumentosRecentesPorTelefone cai no fallback padrão de 15
-- minutos, que é o comportamento correto quando não há sessão real aberta.

ALTER TABLE fonti_marcas
  ADD COLUMN IF NOT EXISTS sessao_real BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN fonti_marcas.sessao_real IS
  'true = *fonti inicio/*fonti processo genuínos (iniciado_at é início de sessão real, usado como janela de busca de documentos). false = linha criada só pra guardar candidatos_pendentes de uma ambiguidade de *fonti salva sem sessão aberta — iniciado_at aqui não deve ser usado como janela.';
