-- Achado real de auditoria do Fonti (2026-09-17): criação de Lead em workflow-captacao.ts
-- fazia um SELECT (buscarLeadAbertoPorPessoa) seguido de INSERT sem nenhum lock/constraint
-- no banco. Duas mensagens *cria cliente quase simultâneas pra mesma Pessoa (double-tap do
-- operador, retry do WhatsApp) podiam ambas ler "nenhum lead aberto" antes de qualquer uma
-- commitar o INSERT, e ambas criar um Lead novo duplicado — diferente de `pessoas`, que já
-- tem constraint única (empresa_id, telefone) WHERE ativo=true explorada em pessoa.ts.
--
-- Índice único parcial replicando EXATAMENTE o predicado de "lead aberto" já usado em
-- buscarLeadAbertoPorPessoa (workflow-captacao.ts): impede duas linhas de `leads` para a
-- mesma pessoa dentro da mesma empresa enquanto nenhuma delas estiver finalizada
-- (aprovado/reprovado/convertido_em_processo/concluido/cancelado) ou soft-deletada.
create unique index if not exists leads_pessoa_aberto_unico
  on leads (empresa_id, pessoa_id)
  where deleted_at is null
    and pessoa_id is not null
    and status_analise not in ('aprovado', 'reprovado', 'convertido_em_processo', 'concluido', 'cancelado');
