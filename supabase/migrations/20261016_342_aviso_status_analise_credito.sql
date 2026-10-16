-- Aviso por WhatsApp ao comercial do cliente quando o status de uma análise de
-- crédito muda (pedido da equipe comercial, 03/10/2026). A rota
-- /api/analises-credito/[id]/aviso-status espera 1 minuto e só avisa se o status
-- final for diferente do último avisado — esta coluna guarda esse "último avisado"
-- (evita aviso repetido quando o status vai e volta: Aprovado → Pendente → Aprovado).
--
-- Análises que já existem nascem com o status atual como "já avisado": nada é
-- disparado retroativamente.

ALTER TABLE lead_analises_credito
  ADD COLUMN IF NOT EXISTS ultimo_status_avisado TEXT
    CHECK (ultimo_status_avisado IN ('em_analise', 'aprovado', 'recusado', 'pendente'));

UPDATE lead_analises_credito
SET ultimo_status_avisado = status
WHERE ultimo_status_avisado IS NULL;
