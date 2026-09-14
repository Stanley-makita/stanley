-- Fix: trg_sincronizar_lead_numero_proposta (leads e processos) disparava em
-- QUALQUER UPDATE na linha de lead_analises_credito (AFTER UPDATE sem
-- restrição de coluna) — não só quando numero_proposta/banco_definido
-- mudavam. Resultado: editar qualquer outro campo da análise decisiva
-- (ex.: data_resposta, valor_imovel) re-executava
-- `UPDATE processos SET numero_proposta = NEW.numero_proposta`, usando o
-- numero_proposta (muitas vezes NULL/desatualizado) da própria análise —
-- apagando silenciosamente o valor digitado manualmente em "Dados do
-- Negócio" (EditarProcessoDrawer) e no equivalente de Lead logo depois de
-- salvo. Mesmo problema no ramo de leads.
--
-- Fix: restringe o trigger a disparar só quando numero_proposta ou
-- banco_definido de fato mudam (AFTER UPDATE OF ...), preservando o
-- comportamento de sincronização pretendido sem sobrescrever edições
-- manuais não relacionadas.

DROP TRIGGER IF EXISTS trg_sincronizar_lead_numero_proposta ON lead_analises_credito;

CREATE TRIGGER trg_sincronizar_lead_numero_proposta
  AFTER INSERT OR UPDATE OF numero_proposta, banco_definido ON lead_analises_credito
  FOR EACH ROW EXECUTE FUNCTION fn_sincronizar_lead_numero_proposta();
