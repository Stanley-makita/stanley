-- Compromissos avulsos na Agenda (sem processo/lead pai) — "Novo Compromisso".
-- Qualquer usuário da empresa pode criar/ver compromisso de qualquer colega
-- (mesmo padrão liberal já usado em processo_tarefas: SELECT livre por
-- empresa, INSERT exige só criado_por = auth.uid(), sem checar usuario_id).
--
-- Ao criar, a rota /api/agenda/compromissos dispara WhatsApp pro dono do
-- compromisso e, se local = 'sede_fontinhas', também pro usuário marcado
-- como recepção (empresas.recepcao_usuario_id, configurável em Configurações
-- pra cobrir férias/ausência).

CREATE TYPE compromisso_local AS ENUM ('sede_fontinhas', 'externo', 'online', 'outro');

CREATE TABLE compromissos (
  id             UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID               NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id     UUID               NOT NULL REFERENCES usuarios(id),
  criado_por     UUID               NOT NULL REFERENCES usuarios(id),
  titulo         TEXT               NOT NULL,
  descricao      TEXT,
  local          compromisso_local  NOT NULL DEFAULT 'externo',
  data           DATE               NOT NULL,
  hora_inicio    TIME,
  hora_fim       TIME,
  concluido      BOOLEAN            NOT NULL DEFAULT false,
  concluido_em   TIMESTAMPTZ,
  notificado_em  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ        NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ        NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);

ALTER TABLE compromissos ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_compromissos_empresa ON compromissos(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_compromissos_usuario ON compromissos(usuario_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_compromissos_data ON compromissos(data) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_compromissos_updated_at
  BEFORE UPDATE ON compromissos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE POLICY "compromissos_select" ON compromissos
  FOR SELECT
  USING (
    empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true)
    AND deleted_at IS NULL
  );

CREATE POLICY "compromissos_insert" ON compromissos
  FOR INSERT
  WITH CHECK (
    criado_por = auth.uid()
    AND empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true)
  );

CREATE POLICY "compromissos_update" ON compromissos
  FOR UPDATE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
        AND (u.id = compromissos.usuario_id OR u.id = compromissos.criado_por OR u.perfil IN ('gerente', 'gestor', 'admin'))
    )
  );

CREATE POLICY "compromissos_delete" ON compromissos
  FOR DELETE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
        AND (u.id = compromissos.criado_por OR u.perfil = 'admin')
    )
  );

-- Usuário responsável por avisar a recepção física (Sede Fontinhas) —
-- configurável em Configurações, trocável em caso de férias/ausência.
-- Update de `empresas` já é restrito a perfil admin (policy "empresas_update").
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS recepcao_usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;

-- Novos tipos de notificação in-app (sino) — dono do compromisso e recepção.
-- Sem ALTER TYPE aqui: nesta produção `notificacoes.tipo` já é TEXT livre,
-- não o enum `tipo_notificacao` original das migrations mais antigas (drift
-- pré-existente, fora do controle de migrations) — qualquer valor novo já é
-- aceito direto, sem precisar liberar nada.

-- notificacoes.entidade precisa aceitar 'compromisso' pro deep-link do sino
-- (mesmo padrão de entidade/entidade_id já usado por processo/lead/tarefa).
-- Lista inclui 'solicitacao' porque já existem linhas em produção com esse
-- valor — outro drift pré-existente fora do controle de migrations: a
-- constraint real já era mais ampla que a da migration original 008.
ALTER TABLE notificacoes DROP CONSTRAINT IF EXISTS notificacoes_entidade_check;
ALTER TABLE notificacoes
  ADD CONSTRAINT notificacoes_entidade_check
    CHECK (entidade IN ('processo', 'lead', 'tarefa', 'solicitacao', 'compromisso'));
