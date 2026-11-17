-- Migration 354 — processos_update volta a respeitar a permissão configurável
-- `processos.editar` (regressão da migration 315).
--
-- Bug real (2026-11-17): a Claudia (perfil Jurídico) preenchia Protocolo /
-- Nº do Protocolo / Datas / Diligência na aba Registro e clicava nas fases
-- (Protocolado) — a tela dizia "salvo"/"Fase avançada", mas nada mudava.
-- No banco: 10 linhas em processo_fases_historico dizendo "Protocolado" em
-- 3 negócios que continuavam em "Preparação", com protocolo vazio.
--
-- Causa (duas camadas):
-- 1. A 221 tinha trocado a lista fixa de perfis da policy por
--    usuario_atual_pode('processos.editar'). A 315 (comercial pode editar) foi
--    escrita a partir da versão ANTERIOR (183) e voltou para
--    `u.perfil IN ('gerente','gestor','admin')` — apagando a permissão
--    configurável. Desde então, quem tem "Editar Negócios" liberado em
--    Configurações > Perfis de Acesso (Apoio e Assistente têm linha explícita,
--    perfis customizados, exceções individuais) é barrado pela RLS SEM ERRO
--    (0 linhas atualizadas).
-- 2. O fallback de usuario_atual_pode('processos.editar') (sem linha em
--    perfil_permissoes) era só gerente/gestor/admin, enquanto a matriz da tela
--    (PERMISSOES_PADRAO, src/lib/auth/permissions.ts) mostra "Editar" marcado
--    para comercial, operacional, jurídico e analista. O admin via a permissão
--    liberada e o banco recusava.
--
-- Fix:
-- - policy: dono (operacional/comercial/jurídico do processo) OU
--   usuario_atual_pode('processos.editar');
-- - fallback de processos.editar = PERMISSOES_PADRAO (comercial, operacional,
--   juridico, analista, gerente, gestor, admin). A carteira comercial continua
--   valendo: UPDATE com WHERE só alcança linhas que a policy de SELECT deixa ver.
--
-- CREATE OR REPLACE substitui a função inteira: corpo copiado verbatim da
-- última definição viva (migration 20260904_283), mudando só o braço
-- 'processos.editar'.

CREATE OR REPLACE FUNCTION usuario_atual_pode(p_acao text) RETURNS boolean AS $$
DECLARE
  v_usuario_id              uuid := usuario_atual_id();
  v_perfil                  usuario_perfil := usuario_atual_perfil();
  v_empresa_id               uuid := usuario_atual_empresa_id();
  v_permitido                boolean;
  v_perfil_customizado_id    uuid;
BEGIN
  IF v_perfil = 'admin' THEN
    RETURN true;
  END IF;

  SELECT permitido INTO v_permitido
    FROM usuario_permissoes
   WHERE usuario_id = v_usuario_id AND acao = p_acao
   LIMIT 1;
  IF FOUND THEN
    RETURN v_permitido;
  END IF;

  IF v_perfil = 'customizado' THEN
    SELECT perfil_customizado_id INTO v_perfil_customizado_id
      FROM usuarios WHERE id = v_usuario_id;

    SELECT permitido INTO v_permitido
      FROM perfil_customizado_permissoes
     WHERE perfil_customizado_id = v_perfil_customizado_id AND acao = p_acao
     LIMIT 1;

    RETURN COALESCE(v_permitido, false);
  END IF;

  SELECT permitido INTO v_permitido
    FROM perfil_permissoes
   WHERE empresa_id = v_empresa_id AND perfil = v_perfil AND acao = p_acao
   LIMIT 1;
  IF FOUND THEN
    RETURN v_permitido;
  END IF;

  RETURN CASE p_acao
    WHEN 'leads.ver_todas'    THEN v_perfil <> 'comercial'
    WHEN 'leads.redistribuir' THEN v_perfil IN ('gestor', 'gerente', 'apoio', 'comercial')
    WHEN 'processos.criar'    THEN v_perfil IN ('analista', 'consultor', 'gerente', 'gestor', 'comercial', 'admin')
    WHEN 'processos.editar'   THEN v_perfil IN ('comercial', 'operacional', 'juridico', 'analista', 'gerente', 'gestor', 'admin')
    WHEN 'processos.retroceder_fase' THEN v_perfil IN ('gerente', 'gestor', 'admin')
    WHEN 'processos.reabrir'  THEN v_perfil IN ('gerente', 'gestor', 'admin')
    WHEN 'usuarios.convidar'  THEN v_perfil IN ('admin', 'gerente', 'gestor')
    WHEN 'financeiro.editar'  THEN v_perfil IN ('gerente', 'gestor', 'admin')
    WHEN 'rh.ver'             THEN v_perfil IN ('admin', 'gestor')
    WHEN 'rh.editar'          THEN v_perfil = 'admin'
    WHEN 'pessoas.ver'        THEN v_perfil IN ('admin', 'gestor', 'comercial', 'operacional', 'juridico', 'gerente', 'analista', 'consultor')
    WHEN 'pessoas.editar'     THEN v_perfil IN ('admin', 'gestor', 'comercial', 'operacional', 'gerente', 'analista')
    WHEN 'pessoas.merge'      THEN v_perfil IN ('admin', 'gerente', 'gestor')
    WHEN 'pessoas.excluir'    THEN v_perfil IN ('admin', 'gestor', 'gerente')
    WHEN 'biblioteca.publicar' THEN v_perfil IN ('admin', 'gerente', 'gestor')
    WHEN 'biblioteca.excluir'  THEN v_perfil IN ('admin', 'gerente', 'gestor')
    ELSE false
  END;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

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
          OR u.id = processos.juridico_id
          OR usuario_atual_pode('processos.editar')
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
          OR u.id = processos.juridico_id
          OR usuario_atual_pode('processos.editar')
        )
    )
  );
