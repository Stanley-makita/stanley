-- Corrige bug da migration 20260801_229: o backfill usava
-- `(SELECT id FROM empresas LIMIT 1)`, sem ORDER BY, num banco que tem
-- (por engano, de algum setup anterior) DUAS linhas em `empresas` com o
-- mesmo nome "Fontinhas Assessoria". O LIMIT 1 pegou a empresa errada pra
-- `corretores` (a `usuarios`/`leads` usam a outra) — isso deixou os
-- corretores vinculados a leads "invisíveis" pra RLS dos usuários reais,
-- quebrando a aba Crédito do Lead (join corretor:corretores(...) vinha
-- null, .nome estourava).
--
-- `imobiliarias` está vazia hoje (sem impacto), mas corrige também por
-- segurança caso algum registro apareça antes desta migration ser notada.
--
-- Achado real, via query direta: usuarios/leads usam 35f2c190-c358-4b36-
-- 85ea-1f1bacbe70af; corretores tinha cbdc5206-242a-45bc-ba66-6b9b4aa760bf.

UPDATE corretores
   SET empresa_id = '35f2c190-c358-4b36-85ea-1f1bacbe70af'
 WHERE empresa_id = 'cbdc5206-242a-45bc-ba66-6b9b4aa760bf';

UPDATE imobiliarias
   SET empresa_id = '35f2c190-c358-4b36-85ea-1f1bacbe70af'
 WHERE empresa_id = 'cbdc5206-242a-45bc-ba66-6b9b4aa760bf';
