-- Achado real de auditoria do Fonti (2026-09-17): o debounce de mensagens encaminhadas
-- simultaneamente (fonti-comandos.ts, processarRespostaPendente) fazia um SELECT do
-- texto_acumulado atual, montava a concatenação em JS, e só depois fazia o UPDATE — não
-- atômico. Duas requisições HTTP verdadeiramente concorrentes (duas mensagens do mesmo
-- operador processadas por invocações serverless diferentes) podiam ler o mesmo estado
-- antigo antes de qualquer uma escrever; a que grava por último "vence" pelo
-- ultima_msg_em, mas seu texto_acumulado não contém o texto da outra mensagem, que é
-- perdido silenciosamente do parser.
--
-- Esta função faz leitura+concatenação+escrita num único UPDATE (atômico por linha no
-- Postgres — duas transações concorrentes na mesma linha serializam via lock de linha,
-- a segunda sempre lê o resultado já commitado da primeira), eliminando a janela de corrida.
--
-- p_fallback_pendente: réplica o comportamento anterior de `buscarSimulaPendente() ?? pendente`
-- — se `simula_pendente` já expirou/foi limpo (NULL na linha), usa este snapshot (a pendência
-- que o caller já tinha em mãos de uma leitura anterior) como base em vez de gravar um objeto
-- incompleto (só com texto_acumulado/ultima_msg_em, sem motivo/dadosCapturados/usouConsulta).
create or replace function acumular_texto_simula_pendente(
  p_conversa_id uuid,
  p_novo_texto text,
  p_ultima_msg_em timestamptz,
  p_expira timestamptz,
  p_fallback_pendente jsonb default null
)
returns jsonb
language plpgsql
as $$
declare
  v_simula_pendente jsonb;
begin
  update conversas
  set simula_pendente = jsonb_set(
        jsonb_set(
          coalesce(simula_pendente, p_fallback_pendente, '{}'::jsonb),
          '{texto_acumulado}',
          to_jsonb(
            case
              when coalesce(coalesce(simula_pendente, p_fallback_pendente)->>'texto_acumulado', '') = ''
                then p_novo_texto
              else (coalesce(simula_pendente, p_fallback_pendente)->>'texto_acumulado') || E'\n' || p_novo_texto
            end
          )
        ),
        '{ultima_msg_em}',
        to_jsonb(p_ultima_msg_em::text)
      ),
      simula_pendente_expira = p_expira
  where id = p_conversa_id
  returning simula_pendente into v_simula_pendente;

  return v_simula_pendente;
end;
$$;
