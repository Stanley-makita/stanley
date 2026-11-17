import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { PERMISSOES_PADRAO } from '@/lib/auth/permissions'
import { type UsuarioPerfil } from '@/types/auth'

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../supabase/migrations')
const conteudo = fs.readFileSync(
  path.join(MIGRATIONS_DIR, '20261117_354_processos_update_respeita_permissao.sql'),
  'utf-8',
)

function migrationsPosteriores(numero: number): string[] {
  return fs.readdirSync(MIGRATIONS_DIR).filter((f) => {
    const m = f.match(/^\d{8}_(\d+)_/)
    return m && Number(m[1]) > numero
  })
}

describe('migration 354 — processos_update respeita processos.editar', () => {
  it('a policy de UPDATE usa usuario_atual_pode(processos.editar), não lista fixa de perfis', () => {
    const policy = conteudo.slice(conteudo.indexOf('CREATE POLICY "processos_update"'))
    expect(policy.match(/usuario_atual_pode\('processos\.editar'\)/g)).toHaveLength(2) // USING + WITH CHECK
    expect(policy).not.toMatch(/u\.perfil IN/)
  })

  it('fallback SQL de processos.editar = perfis que a tela de Permissões mostra com "Editar"', () => {
    const braco = conteudo.match(/WHEN 'processos\.editar'\s+THEN v_perfil IN \(([^)]*)\)/)
    expect(braco).not.toBeNull()
    const noSql = braco![1].split(',').map((s) => s.trim().replace(/'/g, '')).sort()
    const naTela = (Object.keys(PERMISSOES_PADRAO) as UsuarioPerfil[])
      .filter((p) => PERMISSOES_PADRAO[p].includes('processos.editar'))
      .sort()
    expect(noSql).toEqual(naTela)
  })

  it('nenhuma migration posterior redefine processos_update ou usuario_atual_pode sem passar por aqui', () => {
    // Regressão real: a 315 recriou a policy a partir de uma versão antiga e apagou a
    // permissão configurável da 221. Se precisar redefinir, atualize este teste junto.
    for (const f of migrationsPosteriores(354)) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8')
      expect(sql, f).not.toMatch(/POLICY "processos_update"/)
      expect(sql, f).not.toMatch(/FUNCTION (public\.)?usuario_atual_pode\(/)
    }
  })
})
