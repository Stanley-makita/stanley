import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Testes estáticos sobre o CONTEÚDO das migrations desta branch (não executam
// SQL nenhum — apenas leem o arquivo e afirmam sobre o texto). Padrão novo neste
// repositório (não havia precedente), mas útil justamente porque o bug que esta
// branch corrige é sutil o bastante para passar despercebido numa leitura rápida:
// garante que 'gestor' foi de fato adicionado, que 'gerente' não foi removido, que
// nenhum perfil indevido foi incluído por engano, e que nenhuma migration introduz
// algo fora do escopo declarado (seed, DROP TABLE, referência a perfil_permissoes).

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../supabase/migrations')

function lerMigration(nome: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, nome), 'utf-8')
}

// Extrai o corpo da definição CREATE POLICY/FUNCTION de um nome (ignora
// qualquer DROP POLICY "nome" que apareça antes) — do CREATE até o próximo
// "CREATE POLICY"/"CREATE OR REPLACE FUNCTION"/fim do arquivo.
function corpoDaCreate(conteudo: string, nome: string): string {
  const marcador = `CREATE POLICY "${nome}"`
  const idx = conteudo.indexOf(marcador)
  if (idx === -1) return ''
  const resto = conteudo.slice(idx + marcador.length)
  const proximoCreate = resto.indexOf('CREATE POLICY')
  return proximoCreate === -1 ? resto : resto.slice(0, proximoCreate)
}

// Garantias genéricas aplicadas a toda migration desta branch.
function expectSemAchadosIndevidos(conteudo: string) {
  expect(conteudo).not.toMatch(/DROP TABLE/i)
  expect(conteudo).not.toMatch(/perfil_permissoes/)
  // "seed" aqui = INSERT de dados de negócio; as migrations desta branch são só DDL
  // (CREATE POLICY/FUNCTION), nenhuma deve inserir linha nenhuma.
  expect(conteudo).not.toMatch(/^\s*INSERT INTO/im)
}

// Toda policy FOR UPDATE ou FOR ALL declarada deve ter WITH CHECK em algum
// ponto do arquivo (não valida pareamento 1:1 por policy, só a presença geral —
// suficiente para pegar o caso "esqueceu de adicionar WITH CHECK na migration
// inteira", que é o erro real que se busca evitar aqui).
function expectContemWithCheckSeTemUpdateOuAll(conteudo: string) {
  if (/FOR UPDATE|FOR ALL/.test(conteudo)) {
    expect(conteudo).toMatch(/WITH CHECK/)
  }
}

describe('20260721_177_rh_rls_perfil.sql — RH', () => {
  const conteudo = lerMigration('20260721_177_rh_rls_perfil.sql')

  it('cria as policies das 9 tabelas de RH (select/insert/update/delete)', () => {
    for (const prefixo of [
      'rh_dep_empresa', 'rh_regra_empresa', 'rh_faixa_empresa', 'rh_cargo_empresa',
      'rh_func_empresa', 'rh_func_emp_empresa', 'rh_ponto_empresa', 'rh_ferias_empresa', 'rh_aus_empresa',
    ]) {
      for (const sufixo of ['_select', '_insert', '_update', '_delete']) {
        expect(conteudo).toContain(`${prefixo}${sufixo}`)
      }
    }
  })

  it("leitura restrita a admin+gestor, escrita só admin", () => {
    expect(conteudo).toContain("IN ('admin', 'gestor')")
    expect(conteudo).toContain("perfil = 'admin'")
  })

  it('não concede acesso a nenhum outro perfil (ex.: comercial, operacional, apoio)', () => {
    for (const perfil of ['comercial', 'operacional', 'apoio', 'juridico']) {
      expect(conteudo).not.toContain(`'${perfil}'`)
    }
  })

  it('sem achados indevidos e com WITH CHECK', () => {
    expectSemAchadosIndevidos(conteudo)
    expectContemWithCheckSeTemUpdateOuAll(conteudo)
  })
})

describe('20260721_178_pessoas_rls_perfil.sql — Pessoas', () => {
  const conteudo = lerMigration('20260721_178_pessoas_rls_perfil.sql')

  it('cria as policies de pessoas e pessoa_telefones (select/insert/update/delete)', () => {
    for (const prefixo of ['pessoas_empresa', 'pessoa_telefones_empresa']) {
      for (const sufixo of ['_select', '_insert', '_update', '_delete']) {
        expect(conteudo).toContain(`${prefixo}${sufixo}`)
      }
    }
  })

  it('SELECT exclui apoio e cliente (sem pessoas.ver na matriz)', () => {
    const selectPessoas = conteudo.split('pessoas_empresa_insert')[0]
    expect(selectPessoas).not.toContain("'apoio'")
    expect(selectPessoas).not.toContain("'cliente'")
  })

  it('inclui gestor no bug legado de pessoas_alt_select (histórico)', () => {
    expect(conteudo).toContain('pessoas_alt_select')
    expect(conteudo).toMatch(/IN \('admin', 'gerente', 'gestor'\)/)
  })

  it('sem achados indevidos e com WITH CHECK', () => {
    expectSemAchadosIndevidos(conteudo)
    expectContemWithCheckSeTemUpdateOuAll(conteudo)
  })
})

describe('20260721_179_gestor_biblioteca_financeiro.sql — Biblioteca e Financeiro', () => {
  const conteudo = lerMigration('20260721_179_gestor_biblioteca_financeiro.sql')

  it('inclui gestor mantendo gerente em todas as policies tocadas', () => {
    for (const policy of [
      'bk_categorias_write', 'bk_docs_select_publicado', 'bk_docs_write',
      'comissoes_insert', 'comissoes_update',
      'fin_lanc_insert', 'fin_lanc_update', 'fin_lanc_delete',
    ]) {
      expect(conteudo).toContain(policy)
    }
    expect(conteudo).toContain('gerente')
    expect(conteudo).toContain('gestor')
  })

  it('não remove analista de fin_lanc_insert', () => {
    const trecho = corpoDaCreate(conteudo, 'fin_lanc_insert')
    expect(trecho).toContain('analista')
  })

  it('sem achados indevidos e com WITH CHECK', () => {
    expectSemAchadosIndevidos(conteudo)
    expectContemWithCheckSeTemUpdateOuAll(conteudo)
  })
})

describe('20260721_180_gestor_config_cadastros.sql — Configurações e cadastros-base', () => {
  const conteudo = lerMigration('20260721_180_gestor_config_cadastros.sql')

  it('inclui gestor nas policies de metas, comissões padrão, fases, bancos, produtos, usuários e convites', () => {
    for (const policy of [
      'gestor_escreve_metas', 'gestor_atualiza_metas',
      'gestor_escreve_comissoes_padrao', 'gestor_atualiza_comissoes_padrao',
      'fases_insert', 'fases_update', 'bancos_insert', 'bancos_update',
      'produtos_insert', 'produtos_update',
      'usuarios_select', 'usuarios_update_rbac',
      'convites_select_gerencia', 'convites_insert_gerencia',
    ]) {
      expect(conteudo).toContain(policy)
    }
    expect(conteudo).toContain('gerente')
    expect(conteudo).toContain('gestor')
  })

  it('usuarios_select mantém analista (achado colateral do bug — não remove)', () => {
    expect(conteudo).toMatch(/IN \('admin', 'gerente', 'analista', 'gestor'\)/)
  })

  it('sem achados indevidos e com WITH CHECK', () => {
    expectSemAchadosIndevidos(conteudo)
    expectContemWithCheckSeTemUpdateOuAll(conteudo)
  })
})

describe('20260721_181_gestor_processos_operacao.sql — Processos e operação', () => {
  const conteudo = lerMigration('20260721_181_gestor_processos_operacao.sql')

  it('inclui gestor nas sub-tabelas de Processos, documentos, solicitações, leads e conversas', () => {
    for (const policy of [
      'proc_tarefas_update', 'proc_compradores_update', 'proc_compradores_delete',
      'proc_vendedores_update', 'proc_vendedores_delete',
      'proc_conta_mov_insert', 'proc_custas_insert', 'proc_custas_update',
      'membro_exclui_proprio_ou_gestor', 'sol_op_update',
      'leads_update_responsavel_ou_gerencia', 'empresa_conversas_select',
    ]) {
      expect(conteudo).toContain(policy)
    }
    expect(conteudo).toContain('gerente')
    expect(conteudo).toContain('gestor')
  })

  it('mantém analista nas sub-tabelas de Processos que já tinham', () => {
    for (const policy of ['proc_compradores_update', 'proc_vendedores_update', 'proc_conta_mov_insert', 'proc_custas_insert']) {
      const trecho = corpoDaCreate(conteudo, policy)
      expect(trecho).toContain('analista')
    }
  })

  it('sem achados indevidos e com WITH CHECK', () => {
    expectSemAchadosIndevidos(conteudo)
    expectContemWithCheckSeTemUpdateOuAll(conteudo)
  })
})

describe('20260721_182_gestor_checklist_fases_rpc.sql — Checklist, Fases e relatório', () => {
  const conteudo = lerMigration('20260721_182_gestor_checklist_fases_rpc.sql')

  it('inclui gestor em checklist_templates/items e fase_statuses', () => {
    for (const policy of [
      'checklist_templates_insert', 'checklist_templates_update', 'checklist_templates_delete',
      'checklist_items_insert', 'checklist_items_update', 'checklist_items_delete',
      'fase_statuses_insert', 'fase_statuses_update', 'fase_statuses_delete',
    ]) {
      expect(conteudo).toContain(policy)
    }
    expect(conteudo).toContain('gerente')
    expect(conteudo).toContain('gestor')
  })

  it('recria relatorio_por_equipe incluindo gestor no filtro de linhas', () => {
    expect(conteudo).toContain('CREATE OR REPLACE FUNCTION relatorio_por_equipe')
    expect(conteudo).toMatch(/IN \('comercial', 'admin', 'gerente', 'gestor'\)/)
  })

  it('não altera comunicacao_atualizar_relacionamento (bug mais amplo, fora de escopo)', () => {
    expect(conteudo).not.toContain('comunicacao_atualizar_relacionamento')
  })

  it('sem achados indevidos e com WITH CHECK', () => {
    expectSemAchadosIndevidos(conteudo)
    expectContemWithCheckSeTemUpdateOuAll(conteudo)
  })
})

describe('20260721_183_processos_rls_matriz.sql — Negócios (matriz oficial)', () => {
  const conteudo = lerMigration('20260721_183_processos_rls_matriz.sql')

  it('processos_insert inclui comercial e gestor, mantém os legados', () => {
    const trecho = corpoDaCreate(conteudo, 'processos_insert')
    for (const perfil of ['analista', 'consultor', 'gerente', 'gestor', 'comercial', 'admin']) {
      expect(trecho).toContain(perfil)
    }
    expect(trecho).not.toContain('operacional')
    expect(trecho).not.toContain('juridico')
  })

  it('processos_update inclui gestor na condição gerencial e preserva a condição do dono', () => {
    const trecho = corpoDaCreate(conteudo, 'processos_update')
    expect(trecho).toContain('operacional_id')
    expect(trecho).toMatch(/IN \('gerente', 'gestor', 'admin'\)/)
  })

  it('tem WITH CHECK explícito em processos_update', () => {
    const trecho = corpoDaCreate(conteudo, 'processos_update')
    expect(trecho).toContain('WITH CHECK')
  })

  it('sem achados indevidos', () => {
    expectSemAchadosIndevidos(conteudo)
  })
})
