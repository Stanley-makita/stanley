-- ============================================================
-- Migration: 20260713_158_pasta_id_documentos.sql
-- Estrutura de Pastas por Processo — Entrega 2, parte 2/2
--
-- Adiciona a dimensão "pasta" aos documentos, decidida por vínculo (não fixa
-- no documento) — um mesmo documento do Acervo reaproveitado em processos
-- diferentes pode estar em pastas diferentes em cada um, coerente com o
-- resto do modelo (estado "por vínculo" já é tratado separado do documento
-- em si). Ambas colunas nullable: documento fora de contexto de Processo
-- (Acervo solto da Pessoa) não tem pasta.
-- ============================================================

ALTER TABLE documento_vinculos
  ADD COLUMN pasta_id UUID REFERENCES catalogo_pastas_processo(id);
  -- usado quando entidade_tipo = 'processo' (dominio acervo_documental reaproveitado)

ALTER TABLE documentos
  ADD COLUMN pasta_id UUID REFERENCES catalogo_pastas_processo(id);
  -- usado quando dominio = 'processo_trabalho' (documento é dono direto do
  -- processo, não passa por documento_vinculos)

CREATE INDEX idx_documento_vinculos_pasta ON documento_vinculos (pasta_id) WHERE pasta_id IS NOT NULL;
CREATE INDEX idx_documentos_pasta ON documentos (pasta_id) WHERE pasta_id IS NOT NULL;

-- documento_vinculos não tinha policy de UPDATE (só SELECT/INSERT pro usuário
-- autenticado, e ALL pro service_role) — necessária agora pra "mover de
-- pasta" funcionar sem passar por service role. Mesmo escopo por empresa já
-- usado nas outras policies desta tabela.
CREATE POLICY "documento_vinculos_update" ON documento_vinculos FOR UPDATE
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1));

-- Sugestão de pasta por tipo documental (prioridade 2 da inferência — só usada
-- quando o documento não pertence a uma pessoa com papel definido no
-- processo, ver prioridade 1 na UI). Nunca obrigatório, sempre sobrescrevível
-- pelo operador.
ALTER TABLE catalogo_tipos_documento
  ADD COLUMN pasta_sugerida_codigo TEXT REFERENCES catalogo_pastas_processo(codigo);

UPDATE catalogo_tipos_documento SET pasta_sugerida_codigo = 'comprador'
  WHERE codigo IN ('rg','cnh','cpf','certidao_nascimento','certidao_casamento',
                    'certidao_divorcio','passaporte','rne','comprovante_renda',
                    'comprovante_endereco','extrato_bancario','extrato_fgts','imposto_renda');
-- Matrícula sugere "02 Imóvel" (não "10 Contrato Registrado") — só a matrícula
-- definitiva registrada é movida manualmente pra lá quando chega; sem nova
-- coluna/flag de "estágio" da matrícula por enquanto.
UPDATE catalogo_tipos_documento SET pasta_sugerida_codigo = 'imovel' WHERE codigo = 'matricula';
UPDATE catalogo_tipos_documento SET pasta_sugerida_codigo = 'contrato_emitido' WHERE codigo = 'contrato';
