-- Migration 315 — processos_update (RLS) passa a permitir o COMERCIAL do
-- processo editar, não só o operacional/gerente/gestor/admin.
--
-- Bug (achado 2026-09-22, com evidência no banco): a policy `processos_update`
-- (migration 20260721_183) só libera UPDATE pra `u.id = processos.operacional_id`
-- ou perfil em ('gerente','gestor','admin'). O comercial responsável pelo negócio
-- (`processos.comercial_id`) NUNCA estava incluído. O modal "Dados do Negócio"
-- (EditarProcessoDrawer.tsx, botão "$ Negócio") é mostrado e usável por qualquer
-- perfil, inclusive comercial — mas o UPDATE batia na RLS, o Postgres/PostgREST
-- filtra a linha da atualização (0 rows affected) SEM devolver erro, e o código
-- (useAtualizarDadosProcesso, mutationFn só checa `if (error) throw`) reportava
-- sucesso ("Dados financeiros atualizados com sucesso.") mesmo sem gravar nada.
-- Confirmado: processo #proc-065, comercial_id = Andresa (perfil comercial,
-- não é operacional_id nem tem perfil elevado) — taxa_juros/sistema_amortizacao/
-- prazo/dia continuavam NULL e `updated_at` não mudava após "salvar" repetido.
--
-- Fix: comercial do processo (dono do negócio pro lado comercial, é quem
-- preenche os dados financeiros na prática — a UI já assume isso) ganha a
-- mesma permissão de UPDATE que operacional/juridico já tinham por serem o
-- responsável designado. Segue restrito ao PRÓPRIO processo (comercial_id =
-- usuário), não abre pra qualquer comercial editar qualquer negócio.

DROP POLICY "processos_update" ON processos;
CREATE POLICY "processos_update" ON processos
  FOR UPDATE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
        AND (
          u.id = processos.operacional_id
          OR u.id = processos.comercial_id
          OR u.perfil IN ('gerente', 'gestor', 'admin')
        )
    )
    AND deleted_at IS NULL
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
        AND (
          u.id = processos.operacional_id
          OR u.id = processos.comercial_id
          OR u.perfil IN ('gerente', 'gestor', 'admin')
        )
    )
  );
