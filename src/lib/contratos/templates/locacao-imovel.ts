export const TEMPLATE_LOCACAO_IMOVEL = {
  id: 'locacao_imovel',
  titulo: 'Locação de Imóvel',
  descricao: 'Contrato de locação residencial ou comercial com fiador e condições de pagamento.',
  conteudo: `<h2 style="text-align:center">INSTRUMENTO PARTICULAR DE CONTRATO DE LOCAÇÃO</h2>

<p style="text-align:center">{{cidade_comarca}}, {{data_extenso}}</p>

<p>Pelo presente instrumento particular, as partes abaixo qualificadas:</p>

<p><strong>LOCADOR(A):</strong> {{locador_nome}}{{locador_conjuge}}, {{locador_profissao}}, RG nº {{locador_rg}}, CPF nº {{locador_cpf}}, residente e domiciliado(a) em {{locador_endereco}}.</p>

<p><strong>LOCATÁRIO(A):</strong> {{locatario_nome}}{{locatario_conjuge}}, {{locatario_profissao}}, RG nº {{locatario_rg}}, CPF nº {{locatario_cpf}}, residente e domiciliado(a) em {{locatario_endereco}}.</p>

<p><strong>FIADOR(A):</strong> {{fiador_nome}}{{fiador_conjuge}}, {{fiador_profissao}}, RG nº {{fiador_rg}}, CPF nº {{fiador_cpf}}, residente e domiciliado(a) em {{fiador_endereco}}.</p>

<p>Têm entre si, justo e contratado, o presente contrato de locação mediante as cláusulas e condições seguintes:</p>

<h3>CLÁUSULA 1ª — DO OBJETO</h3>

<p>O(A) LOCADOR(A) cede em locação ao(à) LOCATÁRIO(A) o imóvel situado em {{imovel_endereco}}, com área de {{imovel_area}}, descrito como: {{imovel_descricao_completa}}, inscrito na Prefeitura sob nº {{imovel_cadastro_prefeitura}}.</p>

<h3>CLÁUSULA 2ª — DA FINALIDADE</h3>

<p>O imóvel destina-se exclusivamente a fins de {{finalidade_locacao}}, sendo vedada qualquer alteração de uso sem prévia autorização escrita do(a) LOCADOR(A).</p>

<h3>CLÁUSULA 3ª — DO PRAZO</h3>

<p>A locação tem prazo de {{prazo_locacao_meses}} meses, com início em {{data_inicio}} e término em {{data_fim}}, renovando-se automaticamente caso nenhuma das partes manifeste intenção de rescisão com antecedência mínima de 30 dias.</p>

<h3>CLÁUSULA 4ª — DO ALUGUEL</h3>

<p>O aluguel mensal é de {{valor_aluguel}} ({{valor_aluguel_extenso}}), com vencimento todo dia {{dia_vencimento}} de cada mês, devendo ser pago por transferência bancária para:</p>

<p>Banco: {{banco_locador}} | Agência: {{agencia_locador}} | Conta: {{conta_locador}}</p>

<h3>CLÁUSULA 5ª — DA FIANÇA</h3>

<p>O(A) FIADOR(A) acima qualificado(a) assume, solidariamente com o(a) LOCATÁRIO(A), todas as obrigações decorrentes do presente contrato, inclusive aluguéis, encargos, multas, danos e despesas de cobrança judicial ou extrajudicial.</p>

<h3>CLÁUSULA 6ª — DO FORO</h3>

<p>As partes elegem o Foro da Comarca de {{foro_comarca}} para dirimir eventuais controvérsias oriundas do presente contrato, renunciando a qualquer outro.</p>

<br/><br/>

<p style="text-align:center">{{cidade_comarca}}, {{data_extenso}}</p>

<br/>

<p>________________________________________<br/>
<strong>{{locador_nome}}</strong><br/>
CPF: {{locador_cpf}} — LOCADOR(A)<br/>
E-mail: {{email_locador}}</p>

<br/>

<p>________________________________________<br/>
<strong>{{locatario_nome}}</strong><br/>
CPF: {{locatario_cpf}} — LOCATÁRIO(A)<br/>
E-mail: {{email_locatario}}</p>

<br/>

<p>________________________________________<br/>
<strong>{{fiador_nome}}</strong><br/>
CPF: {{fiador_cpf}} — FIADOR(A)<br/>
E-mail: {{email_fiador}}</p>
`,
}
