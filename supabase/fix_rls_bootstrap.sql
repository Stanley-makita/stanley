-- ============================================================
-- CORREÇÃO COMPLETA: RLS recursion + bootstrap admin
-- Rodar inteiro no Supabase SQL Editor (role: postgres)
-- ============================================================

-- 1. Funções SECURITY DEFINER (rodam como postgres, bypassam RLS)
CREATE OR REPLACE FUNCTION minha_empresa_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT empresa_id FROM usuarios WHERE id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION meu_perfil()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT perfil::text FROM usuarios WHERE id = auth.uid() LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION minha_empresa_id() TO authenticated;
GRANT EXECUTE ON FUNCTION meu_perfil() TO authenticated;

-- 2. Corrigir policies de usuarios (auto-referência = recursão infinita)
DROP POLICY IF EXISTS "usuarios_select" ON usuarios;
DROP POLICY IF EXISTS "usuarios_select_empresa" ON usuarios;
DROP POLICY IF EXISTS "usuarios_insert" ON usuarios;
DROP POLICY IF EXISTS "usuarios_update" ON usuarios;
DROP POLICY IF EXISTS "usuarios_update_rbac" ON usuarios;

CREATE POLICY "usuarios_select" ON usuarios
  FOR SELECT USING (deleted_at IS NULL AND empresa_id = minha_empresa_id());

CREATE POLICY "usuarios_insert" ON usuarios
  FOR INSERT WITH CHECK (meu_perfil() = 'admin');

CREATE POLICY "usuarios_update" ON usuarios
  FOR UPDATE USING (id = auth.uid() OR meu_perfil() IN ('admin', 'gerente'))
  WITH CHECK (id = auth.uid() OR meu_perfil() IN ('admin', 'gerente'));

-- 3. Corrigir policies de empresas
DROP POLICY IF EXISTS "empresas_select" ON empresas;
DROP POLICY IF EXISTS "empresas_update" ON empresas;

CREATE POLICY "empresas_select" ON empresas
  FOR SELECT USING (id = minha_empresa_id());

CREATE POLICY "empresas_update" ON empresas
  FOR UPDATE USING (id = minha_empresa_id() AND meu_perfil() = 'admin')
  WITH CHECK (id = minha_empresa_id() AND meu_perfil() = 'admin');

-- 4. Corrigir policies de fases
DROP POLICY IF EXISTS "fases_select" ON fases;
DROP POLICY IF EXISTS "fases_insert" ON fases;
DROP POLICY IF EXISTS "fases_update" ON fases;
DROP POLICY IF EXISTS "fases_delete" ON fases;

CREATE POLICY "fases_select" ON fases
  FOR SELECT USING (empresa_id = minha_empresa_id());

CREATE POLICY "fases_insert" ON fases
  FOR INSERT WITH CHECK (empresa_id = minha_empresa_id() AND meu_perfil() IN ('admin','gerente'));

CREATE POLICY "fases_update" ON fases
  FOR UPDATE USING (empresa_id = minha_empresa_id() AND meu_perfil() IN ('admin','gerente'));

CREATE POLICY "fases_delete" ON fases
  FOR DELETE USING (empresa_id = minha_empresa_id() AND meu_perfil() = 'admin');

-- 5. Corrigir policies de bancos
DROP POLICY IF EXISTS "bancos_select" ON bancos;
DROP POLICY IF EXISTS "bancos_insert" ON bancos;
DROP POLICY IF EXISTS "bancos_update" ON bancos;
DROP POLICY IF EXISTS "bancos_delete" ON bancos;

CREATE POLICY "bancos_select" ON bancos
  FOR SELECT USING (empresa_id = minha_empresa_id());

CREATE POLICY "bancos_insert" ON bancos
  FOR INSERT WITH CHECK (empresa_id = minha_empresa_id() AND meu_perfil() IN ('admin','gerente'));

CREATE POLICY "bancos_update" ON bancos
  FOR UPDATE USING (empresa_id = minha_empresa_id() AND meu_perfil() IN ('admin','gerente'));

CREATE POLICY "bancos_delete" ON bancos
  FOR DELETE USING (empresa_id = minha_empresa_id() AND meu_perfil() = 'admin');

-- 6. Inserir empresa (se não existir)
INSERT INTO empresas (nome, email, telefone, site)
VALUES ('Fontinhas Assessoria', 'fontinhascontato@gmail.com', '(44) 3262-1685', 'fontinhasassessoria.com.br')
ON CONFLICT DO NOTHING;

-- 7. Inserir usuário admin vinculado à empresa
INSERT INTO usuarios (id, empresa_id, nome, email, perfil, ativo)
SELECT
  'cb06e53b-ab4d-4f91-bf2c-56692a1413c2'::uuid,
  e.id,
  'Marcio Fontinhas',
  'marciofontinhas1605@gmail.com',
  'admin',
  true
FROM empresas e
LIMIT 1
ON CONFLICT (id) DO UPDATE SET
  empresa_id = EXCLUDED.empresa_id,
  perfil     = EXCLUDED.perfil,
  ativo      = EXCLUDED.ativo;

-- 8. Preencher auth_user_id (necessário para trigger JWT e AuthContext)
UPDATE usuarios SET auth_user_id = id WHERE auth_user_id IS NULL;

-- 9. Fases padrão
INSERT INTO fases (empresa_id, nome, cor, ordem, ativo)
SELECT e.id, f.nome, f.cor, f.ordem, true
FROM empresas e,
(VALUES
  ('Prospecção',    '#94a3b8', 1),
  ('Simulação',     '#60a5fa', 2),
  ('Documentação',  '#f59e0b', 3),
  ('Em análise',    '#a78bfa', 4),
  ('Aprovado',      '#34d399', 5),
  ('Em contratação','#C2AA6A', 6),
  ('Concluído',     '#253B29', 7)
) AS f(nome, cor, ordem)
LIMIT 1
ON CONFLICT (empresa_id, nome) DO NOTHING;

-- 10. Bancos padrão
INSERT INTO bancos (empresa_id, nome, ativo)
SELECT e.id, b.nome, true
FROM empresas e,
(VALUES
  ('Caixa Econômica Federal'),
  ('Banco do Brasil'),
  ('Bradesco'),
  ('Itaú'),
  ('Santander'),
  ('Safra'),
  ('Inter'),
  ('Sicoob')
) AS b(nome)
LIMIT 1
ON CONFLICT DO NOTHING;

-- Verificação final
SELECT 'empresas' AS tabela, count(*)::text AS registros FROM empresas
UNION ALL SELECT 'usuarios', count(*)::text FROM usuarios
UNION ALL SELECT 'fases', count(*)::text FROM fases
UNION ALL SELECT 'bancos', count(*)::text FROM bancos;
