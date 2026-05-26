export const TEMPLATE_PRESTACAO_SERVICOS = {
  id: 'prestacao_servicos',
  titulo: 'Prestação de Serviços',
  descricao: 'Contrato de prestação de serviços de assessoria imobiliária ou jurídica.',
  conteudo: `<h2 style="text-align:center">INSTRUMENTO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS</h2>

<p style="text-align:center">Contrato nº {{numero_contrato}}</p>

<p style="text-align:center">{{cidade}}, {{data_extenso}}</p>

<p>Pelo presente instrumento particular, as partes abaixo qualificadas:</p>

<p><strong>CONTRATANTE:</strong> {{contratante_nome}}, {{contratante_nacionalidade}}, {{contratante_estado_civil}}, {{contratante_profissao}}, portador(a) da CNH nº {{contratante_cnh}}, CPF nº {{contratante_cpf}}, residente e domiciliado(a) em {{contratante_endereco}}.</p>

<p><strong>CONTRATADA:</strong> Fontinhas e Fontinhas Ltda, CNPJ nº 77.543.700/0001-57, estabelecida na Av. Dr. Gastão Vidigal, 938 – Zona 08, Maringá – PR, 87.050-440, neste ato representada por seus sócios-administradores.</p>

<p>Têm entre si, justo e acordado, o presente contrato de prestação de serviços, mediante as cláusulas e condições seguintes:</p>

<h3>CLÁUSULA 1ª — DO OBJETO</h3>

<p>A CONTRATADA obriga-se a prestar ao(à) CONTRATANTE, junto à instituição financeira {{banco_instituicao}}, os seguintes serviços:</p>

<ul>{{servicos_contratados}}</ul>

<h3>CLÁUSULA 2ª — DOS HONORÁRIOS</h3>

<p>Pelos serviços prestados, o(a) CONTRATANTE pagará à CONTRATADA a importância de {{valor_honorarios}} ({{valor_honorarios_extenso}}), {{momento_pagamento}}.</p>

<p>O não pagamento nos prazos estipulados implicará em multa de 2% (dois por cento) sobre o valor total, acrescida de juros de mora de 1% (um por cento) ao mês, calculados pro rata die, sem prejuízo das demais disposições legais aplicáveis.</p>

<h3>CLÁUSULA 3ª — DAS OBRIGAÇÕES DA CONTRATANTE</h3>

<p>O(A) CONTRATANTE obriga-se a:</p>
<ul>
  <li>Fornecer à CONTRATADA todos os documentos necessários para a prestação dos serviços, na forma e nos prazos estabelecidos;</li>
  <li>Atender prontamente às convocações da CONTRATADA e das instituições financeiras envolvidas;</li>
  <li>Comunicar imediatamente qualquer alteração em sua situação cadastral, financeira ou patrimonial que possa influenciar no andamento dos serviços.</li>
</ul>

<h3>CLÁUSULA 4ª — DAS OBRIGAÇÕES DA CONTRATADA</h3>

<p>A CONTRATADA obriga-se a:</p>
<ul>
  <li>Empregar seus melhores esforços para a consecução do objeto deste contrato;</li>
  <li>Manter o(a) CONTRATANTE informado(a) sobre o andamento dos serviços;</li>
  <li>Guardar sigilo sobre todas as informações e documentos do(a) CONTRATANTE.</li>
</ul>

<h3>CLÁUSULA 5ª — DA RESCISÃO</h3>

<p>O presente contrato poderá ser rescindido, a qualquer tempo, por mútuo acordo das partes, mediante notificação por escrito com antecedência mínima de 15 (quinze) dias. Em caso de rescisão unilateral pelo(a) CONTRATANTE após o início efetivo dos serviços, serão devidos honorários proporcionais ao trabalho realizado até a data da rescisão.</p>

<h3>CLÁUSULA 6ª — DO FORO</h3>

<p>As partes elegem o foro da Comarca de {{foro_comarca}} para dirimir eventuais dúvidas ou litígios decorrentes do presente instrumento, com renúncia a qualquer outro, por mais privilegiado que seja.</p>

<br/><br/>

<p style="text-align:center">{{cidade}}, {{data_extenso}}</p>

<br/>

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
