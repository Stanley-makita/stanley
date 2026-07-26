-- ============================================================
-- Migration 200 — Reformulação da tela de Consórcio: Lista de Cotas
--
-- Um Negócio de Consórcio pode ter várias cotas independentes (grupos,
-- administradoras e prazos diferentes) — os campos singulares hoje em
-- `processos` (grupo_consorcio, cota_consorcio, valor_carta,
-- parcela_consorcio, prazo_meses) só suportam 1 cota por processo.
--
-- As colunas antigas NÃO são removidas nesta entrega — ficam como dívida
-- técnica documentada (usadas hoje por AbaResumoConsorcio/EditarConsorcioDrawer
-- e mantidas até a Lista de Cotas estar validada em produção por um tempo).
-- ============================================================

-- 1. Campos de referência geral do Negócio ("Dados da Carta") — usados nos
--    cards do topo quando as cotas reais (abaixo) ainda não existem ou são
--    uniformes. Prazo de referência da cota já existe (`prazo_meses`).
ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS bem_referencia_descricao TEXT,
  ADD COLUMN IF NOT EXISTS parcela_reduzida_percentual NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS prazo_grupo_meses INTEGER;

-- 2. Lista de Cotas — cada linha é uma cota real contratada, independente
--    das demais (mesmo processo pode ter N cotas de grupos/administradoras
--    diferentes, cada uma com seu próprio prazo/parcela).
CREATE TABLE IF NOT EXISTS processo_cotas (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                    UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  processo_id                   UUID        NOT NULL REFERENCES processos(id) ON DELETE CASCADE,

  administradora_nome           TEXT,
  grupo                         TEXT,
  cota                          TEXT,
  tipo_bem                      TEXT,  -- Imóvel / Veículo / Serviço — mesmas opções do formulário de Lead

  valor_carta                   NUMERIC(15,2),
  valor_parcela                 NUMERIC(15,2),
  parcela_reduzida_percentual   NUMERIC(5,2),
  prazo_cota_meses              INTEGER,
  prazo_grupo_meses             INTEGER,

  -- status_cota: estado da cota em si (não é sobre pagamento)
  status_cota                   TEXT NOT NULL DEFAULT 'ativo'
    CHECK (status_cota IN ('ativo', 'contemplado', 'cancelado', 'substituido')),

  -- status_pagamento: 'quitado' = A COTA INTEIRA quitada (fim do consórcio),
  -- não "parcela do mês em dia" — rótulo na UI precisa deixar isso explícito
  -- (ex. "Cota quitada"), pra não confundir com pagamento mensal em dia.
  status_pagamento              TEXT NOT NULL DEFAULT 'em_dia'
    CHECK (status_pagamento IN ('em_dia', 'atrasado', 'quitado')),

  data_adesao                   DATE,
  data_vencimento                DATE,
  proxima_assembleia_em          DATE,  -- estruturado (não só texto) — permite puxar em Agenda/notificações depois
  informacao_adicional           TEXT,  -- texto livre complementar, além da próxima assembleia

  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE processo_cotas ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_processo_cotas_processo ON processo_cotas(processo_id);

CREATE TRIGGER trg_processo_cotas_updated_at
  BEFORE UPDATE ON processo_cotas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Mesma graduação de processo_compradores/processo_vendedores: select/insert
-- livres pra qualquer usuário ativo da empresa; update restrito a perfil
-- analista/gerente/admin; delete físico restrito a gerente/admin (histórico
-- financeiro de cota não deve ser apagado por qualquer um — ver regra de
-- negócio: preferir status 'cancelado'/'substituido', DELETE só pra cadastro
-- feito por engano e nunca usado).
CREATE POLICY "proc_cotas_select" ON processo_cotas
  FOR SELECT USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true));
CREATE POLICY "proc_cotas_insert" ON processo_cotas
  FOR INSERT WITH CHECK (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true));
CREATE POLICY "proc_cotas_update" ON processo_cotas
  FOR UPDATE USING (empresa_id IN (SELECT empresa_id FROM usuarios u WHERE u.id = auth.uid() AND u.ativo = true AND u.perfil IN ('analista','gerente','admin')));
CREATE POLICY "proc_cotas_delete" ON processo_cotas
  FOR DELETE USING (empresa_id IN (SELECT empresa_id FROM usuarios u WHERE u.id = auth.uid() AND u.ativo = true AND u.perfil IN ('gerente','admin')));

-- 3. Backfill idempotente: processos Consórcio que já têm dado singular
--    preenchido e AINDA NÃO têm nenhuma linha em processo_cotas ganham uma
--    cota inicial com esses valores — evita lista vazia pra Consórcio já
--    existente. A condição NOT EXISTS garante que reexecutar este bloco (ou
--    a mesma lógica em outro ambiente) nunca duplica cota.
INSERT INTO processo_cotas (
  empresa_id, processo_id, administradora_nome, grupo, cota,
  valor_carta, valor_parcela, prazo_cota_meses,
  status_cota, status_pagamento, data_adesao
)
SELECT
  p.empresa_id, p.id, p.administradora, p.grupo_consorcio, p.cota_consorcio,
  p.valor_carta, p.parcela_consorcio, p.prazo_meses,
  'ativo', 'em_dia', p.data_inicio
FROM processos p
WHERE p.modalidade = 'Consorcio'
  AND (
    p.grupo_consorcio IS NOT NULL OR p.cota_consorcio IS NOT NULL
    OR p.valor_carta IS NOT NULL OR p.parcela_consorcio IS NOT NULL
    OR p.prazo_meses IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM processo_cotas pc WHERE pc.processo_id = p.id
  );
