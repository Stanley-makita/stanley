-- Migration 234: Adiciona política de RLS de DELETE em `simulacoes_central`.
-- A tabela nunca teve policy de DELETE (só SELECT/INSERT/UPDATE, ver migration
-- 099) — qualquer DELETE sempre retornava 204 (sucesso) mas afetava 0 linhas,
-- silenciosamente. Afetava tanto o botão "Excluir" já existente no histórico
-- de simulações do Lead (HistoricoSimulacoesLead.tsx) quanto o novo botão
-- "Remover simulação" nas simulações de consórcio Itaú da aba de Negócio.

DROP POLICY IF EXISTS "sc_delete" ON simulacoes_central;

CREATE POLICY "sc_delete" ON simulacoes_central
  FOR DELETE USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
  );
