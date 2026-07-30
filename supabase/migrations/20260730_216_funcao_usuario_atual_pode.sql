-- Função de resolução de permissão em 3 camadas, para uso dentro de RLS
-- policies e triggers (onde o código TS de resolverPermissao/PERMISSOES_PADRAO
-- não alcança): exceção individual (usuario_permissoes) → perfil
-- (perfil_permissoes) → padrão do sistema (CASE abaixo, espelhando
-- PERMISSOES_PADRAO em src/lib/auth/permissions.ts).
--
-- Importante: o CASE final só cobre as ações que hoje têm enforcement real em
-- RLS/trigger (leads.ver_todas, leads.redistribuir) — não é uma cópia
-- completa da matriz de permissões (essa continua vivendo só em código, pra
-- tudo que é controlado por UI). Ao dar enforcement de banco a uma ação nova,
-- adicione o WHEN aqui E mantenha a matriz TS em sincronia manual (não há
-- import cruzado entre TS e SQL).
--
-- admin sempre true, sem consultar nenhuma tabela — mesma garantia dada pelo
-- código (resolverPermissao) e pela tela de Perfis de Acesso ("não editável
-- para admin"), aqui replicada pra nunca haver divergência entre o que a UI
-- promete e o que o banco decide.

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
    ELSE false
  END;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
