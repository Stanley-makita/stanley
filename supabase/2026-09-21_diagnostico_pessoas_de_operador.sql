-- SOMENTE LEITURA. Pessoas que têm telefone de um usuário interno (operador) e o que ficou
-- preso a elas por causa do bug corrigido na migration 314.
SELECT
  u.nome                                   AS operador,
  p.id                                     AS pessoa_id,
  p.nome                                   AS nome_da_pessoa,
  p.status_identidade,
  (SELECT count(*) FROM leads l WHERE l.pessoa_id = p.id AND l.deleted_at IS NULL)        AS leads_abertos,
  (SELECT string_agg(l.nome, ' | ') FROM leads l WHERE l.pessoa_id = p.id AND l.deleted_at IS NULL) AS nomes_dos_leads,
  (SELECT count(*) FROM documentos d WHERE d.pessoa_id = p.id AND d.deleted_at IS NULL)   AS documentos
FROM usuarios u
JOIN pessoa_telefones pt
  ON pt.empresa_id = u.empresa_id AND pt.ativo = true
 AND pt.telefone IN (telefone_canonico_br(u.telefone_whatsapp), telefone_canonico_br(u.telefone))
JOIN pessoas p ON p.id = pt.pessoa_id AND p.deleted_at IS NULL
WHERE u.ativo = true
ORDER BY u.nome, p.created_at;
