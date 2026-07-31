-- Estende usuario_atual_pode() (20260730_216) com o fallback padrão das
-- ações que ganham enforcement real em RLS nesta rodada: processos.criar,
-- processos.editar, usuarios.convidar, financeiro.editar, rh.ver, rh.editar,
-- pessoas.ver, pessoas.editar, pessoas.merge, pessoas.excluir,
-- biblioteca.publicar, biblioteca.excluir.
--
-- Os valores do CASE abaixo são fiéis ao que a RLS JÁ faz hoje (antes desta
-- migration), não ao que a matriz TS (PERMISSOES_PADRAO) promete — as duas
-- podem divergir (ex.: processos.editar na matriz TS inclui comercial, mas
-- a RLS de processos_update sempre foi só gerente/gestor/admin + dono via
-- operacional_id; a divergência é pré-existente e não é resolvida aqui,
-- só preservada fielmente pra não mudar comportamento).
--
-- rh.ver entra aqui porque a RLS de RH (20260721_177) nunca foi atualizada
-- quando essa ação foi destravada em Perfis de Acesso — hoje um admin pode
-- marcar "RH > Ver" pra outro perfil na tela, mas a RLS ainda bloqueia
-- todo mundo que não seja admin/gestor. Esta migration fecha esse gap.

CREATE OR REPLACE FUNCTION usuario_atual_pode(p_acao text) RETURNS boolean AS $$
DECLARE
  v_usuario_id  uuid := usuario_atual_id();
  v_perfil      usuario_perfil := usuario_atual_perfil();
  v_empresa_id  uuid := usuario_atual_empresa_id();
  v_permitido   boolean;
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
    WHEN 'processos.editar'   THEN v_perfil IN ('gerente', 'gestor', 'admin')
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
