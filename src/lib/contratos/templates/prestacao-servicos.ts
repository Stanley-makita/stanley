export const TEMPLATE_PRESTACAO_SERVICOS = {
  id: 'prestacao_servicos',
  titulo: 'Prestação de Serviços',
  descricao: 'Contrato de prestação de serviços de assessoria imobiliária.',
  conteudo: `
<p style="text-align:center"><strong>CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE ASSESSORIA</strong></p>
<p style="text-align:center"><strong>Nº {{numero_contrato_assessoria}}</strong></p>

<br/>

<p>Pelo presente instrumento particular, as partes abaixo qualificadas celebram o presente Contrato de Prestação de Serviços de Assessoria, que se regerá pelas seguintes cláusulas e condições:</p>

<br/>

<p><strong>1. DAS PARTES</strong></p>

<br/>

<p><strong>CONTRATANTE:</strong> {{contratante_nome}}, CPF nº {{contratante_cpf}}.</p>

<br/>

<p><strong>CONTRATADA:</strong> <strong>FONTINHAS E FONTINHAS LTDA</strong>, CNPJ nº 77.543.700/0001-57, estabelecida na Av. Dr. Gastão Vidigal, 938 – Zona 08, Maringá – PR, CEP 87.050-440, neste ato representada por seus sócios-administradores.</p>

<br/>

<p><strong>2. OBJETO DO CONTRATO / SERVIÇOS CONTRATADOS</strong></p>

<br/>

<p>A CONTRATADA prestará ao CONTRATANTE os seguintes serviços de assessoria:</p>

<br/>

<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
  <tr>
    <td style="width:48px;padding:4px 0;vertical-align:top;font-family:'Courier New',monospace;font-size:13px;">{{check_financiamento}}</td>
    <td style="padding:4px 0;font-size:13px;">Formalização do Financiamento Imobiliário</td>
  </tr>
  <tr>
    <td style="width:48px;padding:4px 0;vertical-align:top;font-family:'Courier New',monospace;font-size:13px;">{{check_itbi}}</td>
    <td style="padding:4px 0;font-size:13px;">Assessoria de ITBI</td>
  </tr>
  <tr>
    <td style="width:48px;padding:4px 0;vertical-align:top;font-family:'Courier New',monospace;font-size:13px;">{{check_registro}}</td>
    <td style="padding:4px 0;font-size:13px;">Assessoria Registro</td>
  </tr>
  <tr>
    <td style="width:48px;padding:4px 0;vertical-align:top;font-family:'Courier New',monospace;font-size:13px;">{{check_juridico}}</td>
    <td style="padding:4px 0;font-size:13px;">Contrato / Jurídico</td>
  </tr>
</table>

<br/>

<p><strong>3. VALOR E FORMA DE PAGAMENTO</strong></p>

<br/>

<p>Pelos serviços contratados, o CONTRATANTE pagará à CONTRATADA o valor total de <strong>{{valor_total_servicos}}</strong> ({{valor_total_servicos_extenso}}).</p>

<br/>

<p><strong>4. DAS OBRIGAÇÕES DA CONTRATANTE</strong></p>

<br/>

<p>O CONTRATANTE obriga-se a:</p>

<p>a) Fornecer à CONTRATADA todos os documentos necessários para a prestação dos serviços, nos prazos estabelecidos;</p>
<p>b) Atender prontamente às convocações da CONTRATADA e das instituições financeiras envolvidas;</p>
<p>c) Comunicar imediatamente qualquer alteração em sua situação cadastral, financeira ou patrimonial que possa influenciar no andamento dos serviços.</p>

<br/>

<p><strong>5. DAS OBRIGAÇÕES DA CONTRATADA</strong></p>

<br/>

<p>A CONTRATADA obriga-se a:</p>

<p>a) Empregar seus melhores esforços para a consecução do objeto deste contrato;</p>
<p>b) Manter o CONTRATANTE informado sobre o andamento dos serviços;</p>
<p>c) Guardar sigilo sobre todas as informações e documentos do CONTRATANTE.</p>

<br/>

<p><strong>6. DA RESCISÃO</strong></p>

<br/>

<p>O presente contrato poderá ser rescindido, a qualquer tempo, por mútuo acordo das partes, mediante notificação por escrito com antecedência mínima de 15 (quinze) dias. Em caso de rescisão unilateral pelo CONTRATANTE após o início efetivo dos serviços, serão devidos honorários proporcionais ao trabalho realizado até a data da rescisão.</p>

<br/>

<p><strong>7. DO FORO</strong></p>

<br/>

<p>As partes elegem o foro da Comarca de Maringá/PR para dirimir eventuais dúvidas ou litígios decorrentes do presente instrumento, com renúncia a qualquer outro, por mais privilegiado que seja.</p>

<br/>

<p>Maringá/PR, {{data_extenso}}.</p>

<br/><br/>

<p>________________________________________<br/>
<strong>{{contratante_nome}}</strong><br/>
CPF: {{contratante_cpf}}<br/>
CONTRATANTE</p>

<br/>

<p>________________________________________<br/>
<strong>Fontinhas e Fontinhas Ltda</strong><br/>
CNPJ: 77.543.700/0001-57<br/>
CONTRATADA</p>

<br/>

<p>Testemunhas:<br/><br/>
1. ________________________________________<br/>
Nome: [A PREENCHER]<br/>
CPF: [A PREENCHER]<br/><br/>
2. ________________________________________<br/>
Nome: [A PREENCHER]<br/>
CPF: [A PREENCHER]</p>
`,
}
