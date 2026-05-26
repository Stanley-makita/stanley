export const TEMPLATE_DISTRATO_LOCACAO = {
  id: 'distrato_locacao',
  titulo: 'Distrato de Locação',
  descricao: 'Rescisão amigável de contrato de locação com acerto de valores entre as partes.',
  conteudo: `<h2 style="text-align:center">INSTRUMENTO PARTICULAR DE DISTRATO DE LOCAÇÃO</h2>

<p style="text-align:center">{{cidade_comarca}}, {{data_extenso}}</p>

<p>Pelo presente instrumento particular, as partes abaixo qualificadas:</p>

<p><strong>LOCADOR(A):</strong> {{locador_nome}}{{locador_conjuge}}, {{locador_profissao}}, portador(a) da CNH nº {{locador_cnh}}, RG nº {{locador_rg}}, CPF nº {{locador_cpf}}, residente e domiciliado(a) em {{locador_endereco}}.</p>

<p><strong>LOCATÁRIO(A):</strong> {{locatario_nome}}{{locatario_conjuge}}, {{locatario_profissao}}, RG nº {{locatario_rg}}, CPF nº {{locatario_cpf}}, residente e domiciliado(a) em {{locatario_endereco}}.</p>

<p><strong>ADMINISTRADORA:</strong> {{administradora_nome}}, CNPJ nº {{administradora_cnpj}}, representada por {{administradora_responsavel}}, CPF nº {{administradora_cpf}}, com sede em {{administradora_endereco}}.</p>

<p>Resolvem, de comum acordo, rescindir o contrato de locação referente ao imóvel: {{imovel_descricao_completa}}, inscrito na Prefeitura sob nº {{imovel_cadastro_prefeitura}}, mediante as condições abaixo:</p>

<h3>CLÁUSULA 1ª — DA RESCISÃO</h3>

<p>As partes acordam pela rescisão amigável do contrato de locação, ficando o(a) LOCATÁRIO(A) obrigado(a) a desocupar e entregar o imóvel em perfeitas condições de conservação e limpeza.</p>

<h3>CLÁUSULA 2ª — DOS VALORES DEVIDOS</h3>

<p>Fica apurado o seguinte acerto financeiro entre as partes:</p>

<p><strong>Multa rescisória total:</strong> {{valor_multa_total}} ({{valor_multa_extenso}})</p>

<p><strong>Aluguel proporcional do período de {{periodo_proporcional}}:</strong> {{valor_aluguel_proporcional}}</p>

<p><strong>Quota da administradora ({{percentual_administradora}}%):</strong> {{valor_quota_administradora}}</p>

<p><strong>Saldo líquido ao proprietário:</strong> {{valor_saldo_proprietario}}</p>

<h3>CLÁUSULA 3ª — DO PAGAMENTO AO PROPRIETÁRIO</h3>

<p>O repasse ao(à) LOCADOR(A) será efetuado pela ADMINISTRADORA no dia {{data_pagamento_proprietario}}, por transferência bancária para:</p>

<p>Banco: {{banco_administradora}} | Agência: {{agencia_administradora}} | Conta: {{conta_administradora}}<br/>
PIX: {{pix_administradora}}</p>

<h3>CLÁUSULA 4ª — DAS DISPOSIÇÕES GERAIS</h3>

<p>Rescindido o presente instrumento, nada mais as partes têm a reclamar entre si, dando-se plena, geral e irrevogável quitação para todos os fins de direito.</p>

<p>Elegem as partes o foro da Comarca de {{cidade_comarca}} para dirimir eventuais controvérsias.</p>

<br/><br/>

<p style="text-align:center">{{cidade_comarca}}, {{data_extenso}}</p>

<br/>

<p>________________________________________<br/>
<strong>{{locador_nome}}</strong><br/>
CPF: {{locador_cpf}}<br/>
LOCADOR(A)</p>

<br/>

<p>________________________________________<br/>
<strong>{{locatario_nome}}</strong><br/>
CPF: {{locatario_cpf}}<br/>
LOCATÁRIO(A)</p>

<br/>

<p>________________________________________<br/>
<strong>{{administradora_responsavel}}</strong><br/>
CPF: {{administradora_cpf}}<br/>
ADMINISTRADORA</p>
`,
}
