-- ============================================================
-- Migration: 20260715_163_fonti_events_idempotencia.sql
-- Generaliza `fonti_events` (hoje usada só pelo bloco de comandos *fonti
-- fromMe, ver src/app/api/bot/whatsapp/webhook/route.ts) para servir como
-- mecanismo de idempotência de TODO o webhook do WhatsApp.
--
-- Contexto: diagnóstico completo em docs/protocolo-seguranca-recuperacao.md
-- e docs/sprint-protecao-imediata-etapa-a.md, motivado pelo incidente de
-- ~3h com duas instâncias WhatsApp (2026-07-14/15).
--
-- Esta migration SÓ altera schema. A generalização do webhook (código que
-- passa a usar esta estrutura para todo tipo de evento, não só *fonti
-- fromMe) é uma etapa separada e reversível independentemente — ver
-- commit seguinte. A migration NÃO é aplicada em produção neste commit.
-- ============================================================

BEGIN;

ALTER TABLE fonti_events
  ADD COLUMN id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN instancia_id UUID,
  ADD COLUMN tipo_evento TEXT,
  ADD COLUMN status TEXT NOT NULL DEFAULT 'processando';

-- ── Backfill dos registros legados ──────────────────────────────────────────
-- As 34 linhas existentes na tabela (levantadas em 2026-07-15, ver
-- docs/sprint-protecao-imediata-etapa-a.md) vieram EXCLUSIVAMENTE do fluxo
-- *fonti fromMe (único consumidor de fonti_events antes desta migration).
-- A instância de origem é irrecuperável: a empresa tinha 2 instâncias WhatsApp
-- ativas simultaneamente durante toda a janela desses registros (05/2026 em
-- diante), a tabela nunca guardou token/instância, e cross-referência contra
-- mensagens.metadata não encontrou nenhuma correspondência. Por isso o
-- sentinel abaixo é usado SOMENTE aqui, para backfill histórico — nunca deve
-- ser produzido por código novo (garantido pela constraint
-- fonti_events_sentinel_apenas_legado_check mais abaixo).
UPDATE fonti_events
SET instancia_id = '00000000-0000-0000-0000-000000000000',
    tipo_evento = 'legado_fonti_fromMe',
    status = 'processado'
WHERE tipo_evento IS NULL;

ALTER TABLE fonti_events
  ALTER COLUMN tipo_evento SET NOT NULL,
  ALTER COLUMN instancia_id SET NOT NULL;

-- ── Troca de chave primária: messageid isolado colidiria entre instâncias
-- diferentes (exatamente o cenário do incidente com duas instâncias) e entre
-- tipos de evento distintos que possam compartilhar o mesmo messageid. `id`
-- vira a chave técnica; a idempotência real é a UNIQUE composta abaixo.
ALTER TABLE fonti_events DROP CONSTRAINT fonti_events_pkey;
ALTER TABLE fonti_events ADD PRIMARY KEY (id);

ALTER TABLE fonti_events
  ADD CONSTRAINT fonti_events_messageid_instancia_tipo_key
  UNIQUE (messageid, instancia_id, tipo_evento);

-- Garante em nível de banco que o sentinel de backfill não pode ser
-- reutilizado por nenhum evento novo: só é permitido quando tipo_evento é
-- exatamente o rótulo de legado. Qualquer INSERT futuro que tente gravar o
-- sentinel com outro tipo_evento falha na constraint, não em revisão manual.
ALTER TABLE fonti_events
  ADD CONSTRAINT fonti_events_sentinel_apenas_legado_check
  CHECK (
    instancia_id <> '00000000-0000-0000-0000-000000000000'
    OR tipo_evento = 'legado_fonti_fromMe'
  );

ALTER TABLE fonti_events
  ADD CONSTRAINT fonti_events_status_check
  CHECK (status IN ('processando', 'processado', 'falhou', 'ignorado'));

COMMENT ON COLUMN fonti_events.instancia_id IS
  'NOT NULL por constraint de banco. Sentinel 00000000-0000-0000-0000-000000000000 existe SOMENTE nas linhas de backfill (tipo_evento=legado_fonti_fromMe), reforçado por fonti_events_sentinel_apenas_legado_check — nunca deve ser inserido por código novo. O webhook só grava um evento novo depois de resolver a instância com certeza; se não resolver, não grava e não processa.';

COMMENT ON COLUMN fonti_events.tipo_evento IS
  'Para eventos novos: payload.EventType da Uazapi (ex. "messages"). Para o backfill histórico: "legado_fonti_fromMe" (não confundir com um EventType real).';

COMMENT ON COLUMN fonti_events.status IS
  'Observabilidade/auditoria apenas — a decisão de reprocessar ou não um evento é dada pelo conflito na UNIQUE (messageid, instancia_id, tipo_evento) via INSERT ... ON CONFLICT DO NOTHING, não pelo valor de status.';

COMMIT;

-- ============================================================
-- ROLLBACK — DESTRUTIVO. NÃO EXECUTAR SEM EXPORTAR ANTES OS EVENTOS NOVOS.
--
-- Reverter esta migration depois que o webhook já estiver gravando eventos
-- novos (não-legado) DESCARTA PERMANENTEMENTE o histórico de idempotência
-- desses eventos — não há como reconstruir depois. Antes de rodar o bloco
-- abaixo:
--
--   1. Exportar todas as linhas com tipo_evento != 'legado_fonti_fromMe':
--      COPY (SELECT * FROM fonti_events WHERE tipo_evento != 'legado_fonti_fromMe')
--        TO '/caminho/seguro/fonti_events_backup_antes_rollback.csv' WITH CSV HEADER;
--      (ou, no SQL Editor do Supabase, exportar o resultado do SELECT equivalente)
--
--   2. Confirmar que o backup foi salvo em local acessível FORA do banco
--      (a coluna `id`/dedup não sobrevive ao rollback — se for necessário
--      restaurar depois, será um novo INSERT manual, não uma restauração
--      automática).
--
--   3. Só então rodar o bloco abaixo, removendo explicitamente cada
--      constraint adicionada nesta migration antes de remover as colunas:
--
-- BEGIN;
-- ALTER TABLE fonti_events DROP CONSTRAINT IF EXISTS fonti_events_status_check;
-- ALTER TABLE fonti_events DROP CONSTRAINT IF EXISTS fonti_events_sentinel_apenas_legado_check;
-- ALTER TABLE fonti_events DROP CONSTRAINT IF EXISTS fonti_events_messageid_instancia_tipo_key;
-- ALTER TABLE fonti_events DROP CONSTRAINT IF EXISTS fonti_events_pkey;
-- DELETE FROM fonti_events WHERE tipo_evento != 'legado_fonti_fromMe';
-- ALTER TABLE fonti_events
--   DROP COLUMN id,
--   DROP COLUMN instancia_id,
--   DROP COLUMN tipo_evento,
--   DROP COLUMN status;
-- ALTER TABLE fonti_events ADD PRIMARY KEY (messageid);
-- COMMIT;
-- ============================================================

-- ============================================================
-- VALIDAÇÃO PÓS-MIGRATION (rodar manualmente após aplicar em produção)
--
-- Confirma contagem preservada (>= 34, a contagem em 2026-07-15):
--   SELECT count(*) FROM fonti_events;
--
-- Confirma classificação do legado:
--   SELECT count(*) FROM fonti_events
--   WHERE tipo_evento = 'legado_fonti_fromMe'
--     AND instancia_id = '00000000-0000-0000-0000-000000000000';
--
-- Confirma que as constraints de idempotência existem:
--   SELECT conname, contype FROM pg_constraint WHERE conrelid = 'fonti_events'::regclass;
--   -- espera-se: fonti_events_pkey (p), fonti_events_messageid_instancia_tipo_key (u),
--   -- fonti_events_sentinel_apenas_legado_check (c), fonti_events_status_check (c)
--
-- Confirma que o sentinel não pode ser usado fora do legado (deve FALHAR):
--   INSERT INTO fonti_events (messageid, empresa_id, instancia_id, tipo_evento)
--   VALUES ('teste-validacao', '35f2c190-c358-4b36-85ea-1f1bacbe70af',
--           '00000000-0000-0000-0000-000000000000', 'messages');
--   -- esperado: erro de violação de fonti_events_sentinel_apenas_legado_check
-- ============================================================
