import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../supabase/migrations')

function lerMigration(nome: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, nome), 'utf-8')
}

describe('migration 283 — usuario_atual_pode resolve perfil customizado', () => {
  const conteudo = lerMigration('20260904_283_usuario_atual_pode_perfil_customizado.sql')

  it('adiciona o branch para perfil customizado antes da consulta a perfil_permissoes', () => {
    const idxBranchCustomizado = conteudo.indexOf("IF v_perfil = 'customizado'")
    const idxConsultaPerfilPermissoes = conteudo.indexOf('FROM perfil_permissoes')
    expect(idxBranchCustomizado).toBeGreaterThan(-1)
    expect(idxConsultaPerfilPermissoes).toBeGreaterThan(-1)
    expect(idxBranchCustomizado).toBeLessThan(idxConsultaPerfilPermissoes)
  })

  it('consulta perfil_customizado_permissoes, não perfil_permissoes, dentro do branch customizado', () => {
    const inicio = conteudo.indexOf("IF v_perfil = 'customizado'")
    const fimBranch = conteudo.indexOf('END IF;', inicio)
    const trechoBranch = conteudo.slice(inicio, fimBranch)
    expect(trechoBranch).toMatch(/FROM perfil_customizado_permissoes/)
    expect(trechoBranch).not.toMatch(/FROM perfil_permissoes/)
  })

  it('retorna COALESCE(..., false) no branch customizado — nunca cai no CASE de fallback dos 7 perfis fixos', () => {
    const inicio = conteudo.indexOf("IF v_perfil = 'customizado'")
    const fimBranch = conteudo.indexOf('END IF;', inicio)
    const trechoBranch = conteudo.slice(inicio, fimBranch)
    expect(trechoBranch).toMatch(/COALESCE\(v_permitido, false\)/)
  })

  it('não altera o CASE de fallback final dos 7 perfis fixos', () => {
    expect(conteudo).toMatch(/WHEN 'leads\.ver_todas'\s+THEN v_perfil <> 'comercial'/)
    expect(conteudo).toMatch(/WHEN 'leads\.redistribuir' THEN v_perfil IN \('gestor', 'gerente', 'apoio', 'comercial'\)/)
  })

  it('preserva os 18 braços do CASE de fallback herdados da migration 257 (usuario_atual_pode não pode ser truncado por CREATE OR REPLACE)', () => {
    const acoesEsperadas = [
      'leads.ver_todas',
      'leads.redistribuir',
      'processos.criar',
      'processos.editar',
      'processos.retroceder_fase',
      'processos.reabrir',
      'usuarios.convidar',
      'financeiro.editar',
      'rh.ver',
      'rh.editar',
      'pessoas.ver',
      'pessoas.editar',
      'pessoas.merge',
      'pessoas.excluir',
      'biblioteca.publicar',
      'biblioteca.excluir',
    ]

    const inicioCase = conteudo.indexOf('RETURN CASE p_acao')
    const fimCase = conteudo.indexOf('END;', inicioCase)
    const trechoCase = conteudo.slice(inicioCase, fimCase)

    for (const acao of acoesEsperadas) {
      expect(trechoCase).toMatch(new RegExp(`WHEN '${acao.replace('.', '\\.')}'`))
    }

    // Amostra representativa citada na revisão final: cobre os 4 arms que
    // não são leads.* e confirma que não foram silenciosamente removidos.
    expect(trechoCase).toMatch(/WHEN 'processos\.criar'\s+THEN v_perfil IN \('analista', 'consultor', 'gerente', 'gestor', 'comercial', 'admin'\)/)
    expect(trechoCase).toMatch(/WHEN 'pessoas\.merge'\s+THEN v_perfil IN \('admin', 'gerente', 'gestor'\)/)
    expect(trechoCase).toMatch(/WHEN 'biblioteca\.publicar' THEN v_perfil IN \('admin', 'gerente', 'gestor'\)/)
    expect(trechoCase).toMatch(/WHEN 'rh\.editar'\s+THEN v_perfil = 'admin'/)
  })
})
