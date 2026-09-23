-- Captação (aba Oportunidade): FGTS / Com Assessoria / Quem vai fazer o
-- registro — mesmo conceito que já existe em `processos` (migration
-- 20260907_288 pro responsavel_registro; tem_assessoria/valor_fgts já
-- existiam antes), agora disponível também no Lead, ANTES de virar
-- processo. A pedido do usuário (2026-09-23): permite ao comercial já
-- deixar essa intenção registrada na fase de Captação, e o formulário de
-- "+ Novo Processo" (Financiamento/CGI) passa a pré-preencher esses campos
-- a partir do Lead em vez de sempre começar em branco.
--
-- Só a intenção (boolean/enum) é capturada aqui — os valores em R$ (valor
-- do FGTS, valor da assessoria) continuam sendo definidos só depois, dentro
-- do processo já criado, porque na Captação ainda não há dados suficientes
-- pra calcular isso com precisão.
alter table leads
  add column if not exists fgts boolean,
  add column if not exists tem_assessoria boolean,
  add column if not exists responsavel_registro text
    check (responsavel_registro in ('fontinhas', 'cliente', 'corretor'));
