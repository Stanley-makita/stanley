-- Aba Registro do Processo (módulo Registro): dados do protocolo no Cartório
-- de Registro de Imóveis. registro_status_protocolo='protocolado' dispara
-- avanço automático de fase (Preparação -> Protocolado) na aplicação, quando
-- a fase atual do processo ainda é Preparação (ver useAtualizarRegistro).
alter table processos
  add column registro_status_protocolo text
    check (registro_status_protocolo in ('protocolado', 'em_transito', 'registrado')),
  add column registro_numero_protocolo text,
  add column registro_cri text,
  add column registro_data_protocolado date,
  add column registro_data_prevista_entrega date,
  add column registro_diligencia boolean;
