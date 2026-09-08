-- Confiança de que o crédito do lead vai emitir (Certeza/Incerteza) — mesmo
-- conceito de processos.chance_emissao, só passa a ter sentido quando o lead
-- já chegou na aba Crédito (critérios já checados em `creditoLiberado`).
alter table leads
  add column chance_emissao text
  check (chance_emissao in ('certeza', 'incerteza'));
