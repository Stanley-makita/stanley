-- Migration 316 — telefone_canonico_br não adiciona mais "9" indiscriminadamente
-- a QUALQUER número de 8 dígitos (sem DDD) — só a padrões de celular antigo.
--
-- Bug (achado 2026-09-22): a função assumia que todo número de 8 dígitos era um
-- celular sem o "9" (padrão antigo, pré-2012) e sempre prefixava um "9". Telefone
-- FIXO também tem 8 dígitos e NUNCA leva "9" — a função corrompia número fixo em
-- número de celular inexistente. Caso real: contato "Mileno" (44) 3123-5755,
-- fixo — virou "(44) 93123-5755" ao ser salvo via *fonti inicio/Nova Conversa.
-- O WhatsApp Business API (Uazapi) rejeitava o envio pra esse número forjado:
-- "failed to resolve LID for PN 5544931235755: USync returned no LID" — o
-- WhatsApp de verdade não tem esse número (com 9) cadastrado, só o original
-- sem 9. A conversa em si funcionava (o cliente escrevia pelo número real, o
-- webhook grava certo o que chega) — só o ENVIO pelo Fonti usava o número
-- forjado e falhava.
--
-- Fix: usa a convenção pública da ANATEL — depois do DDD, celular (mesmo no
-- formato antigo de 8 dígitos) sempre começa com 6, 7, 8 ou 9; fixo sempre
-- começa com 2, 3, 4 ou 5. Só adiciona "9" quando o 1º dígito indica celular.
-- Números de 8 dígitos começando com 2-5 (fixo) passam sem alteração — mantém
-- 8 dígitos, sem DDI+DDD+9+8 forçado.
--
-- Não corrige dados já gravados — só o registro da Mileno foi corrigido à parte
-- (pedido explícito: não varrer/corrigir outros contatos agora).

CREATE OR REPLACE FUNCTION telefone_canonico_br(p_telefone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits  TEXT := regexp_replace(p_telefone, '\D', '', 'g');
  v_sem_ddi TEXT;
  v_ddd     TEXT;
  v_resto   TEXT;
BEGIN
  IF v_digits LIKE '55%' THEN
    v_sem_ddi := substring(v_digits FROM 3);
  ELSE
    v_sem_ddi := v_digits;
  END IF;

  v_ddd   := substring(v_sem_ddi FROM 1 FOR 2);
  v_resto := substring(v_sem_ddi FROM 3);

  IF length(v_resto) = 8 AND substring(v_resto FROM 1 FOR 1) IN ('6', '7', '8', '9') THEN
    v_resto := '9' || v_resto;
  END IF;

  RETURN '55' || v_ddd || v_resto;
END;
$$;

NOTIFY pgrst, 'reload schema';
