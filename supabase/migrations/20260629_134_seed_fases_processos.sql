-- Cria fases do módulo 'processos' para empresas que só têm fases de 'leads'
-- Causa: seed_fases_bancos.sql não especificava 'modulo', usando o default 'leads'
-- Efeito: VisaoCards passava modulo='processos' mas não havia fases cadastradas

INSERT INTO fases (empresa_id, nome, cor, ordem, modulo, ativo)
SELECT
  e.id,
  f.nome,
  f.cor,
  f.ordem,
  'processos',
  true
FROM empresas e
CROSS JOIN (VALUES
  ('Prospecção',      '#94a3b8', 1),
  ('Simulação',       '#60a5fa', 2),
  ('Documentação',    '#f59e0b', 3),
  ('Em análise',      '#a78bfa', 4),
  ('Aprovado',        '#34d399', 5),
  ('Em contratação',  '#C2AA6A', 6),
  ('Concluído',       '#253B29', 7)
) AS f(nome, cor, ordem)
WHERE NOT EXISTS (
  -- Só cria se a empresa ainda não tem nenhuma fase de processos
  SELECT 1 FROM fases
  WHERE empresa_id = e.id
    AND modulo = 'processos'
    AND ativo = true
)
ON CONFLICT (empresa_id, modulo, nome) DO NOTHING;
