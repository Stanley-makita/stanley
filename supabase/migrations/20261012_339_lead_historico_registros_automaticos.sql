-- Notas da Captação = só texto digitado (decisão do Marcio, 06/10/2026).
-- Quatro registros AUTOMÁTICOS eram gravados em lead_historico com
-- tipo = 'comentario' (o mesmo das notas digitadas) e apareciam no painel de
-- Notas como se alguém tivesse escrito. O código agora grava esses quatro como
-- 'acao_operacional' (continuam no Histórico); aqui reclassificamos os já gravados.
--   1. Simulação enviada  — src/app/api/simulacoes/[id]/compartilhar/route.ts
--   2. Documento enviado   — src/app/api/documentos/[id]/compartilhar/route.ts
--   3. Indicação QR Code em lead existente — src/app/api/parceiros/webhook/indicacao/route.ts
--   4. Resumo do *cria cliente/ *fonti     — src/lib/workflows/workflow-captacao.ts
-- 'acao_operacional' já é aceito pelo CHECK lead_historico_tipo_check (migration 171).
-- Conferir antes (só leitura):
--   SELECT count(*) FROM lead_historico WHERE tipo = 'comentario' AND ( ...mesmas condições... );

UPDATE lead_historico
   SET tipo = 'acao_operacional'
 WHERE tipo = 'comentario'
   AND (
        descricao LIKE 'Simulação "%" enviada para %'
     OR descricao LIKE 'Documento "%" enviado para %'
     OR descricao LIKE 'Nova indicação recebida via QR Code%'
     OR descricao ~ '^Lead (criado|atualizado) via WhatsApp por '
   );
