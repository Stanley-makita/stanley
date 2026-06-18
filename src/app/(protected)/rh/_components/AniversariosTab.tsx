'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Cake, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFuncionarios } from '@/hooks/rh/useFuncionarios'
import { format, parseISO, getMonth, getYear, addMonths, subMonths, differenceInYears } from 'date-fns'
import { ptBR } from 'date-fns/locale'

function iniciais(nome: string) {
  return nome.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

export function AniversariosTab() {
  const [refDate, setRefDate] = useState(new Date())
  const { data: funcionarios = [] } = useFuncionarios()

  const mes = getMonth(refDate) + 1
  const ano = getYear(refDate)
  const hoje = new Date()

  const aniversariantes = funcionarios.filter(f => {
    if (!f.data_nascimento) return false
    return getMonth(parseISO(f.data_nascimento)) + 1 === mes
  }).sort((a, b) => {
    const da = parseISO(a.data_nascimento!)
    const db = parseISO(b.data_nascimento!)
    return da.getDate() - db.getDate()
  })

  const anivEmpresa = funcionarios.filter(f => {
    if (!f.data_admissao) return false
    const d = parseISO(f.data_admissao)
    return getMonth(d) + 1 === mes && getYear(d) < ano
  }).sort((a, b) => {
    const da = parseISO(a.data_admissao)
    const db = parseISO(b.data_admissao)
    return da.getDate() - db.getDate()
  })

  const proximos30 = funcionarios.filter(f => {
    if (!f.data_nascimento) return false
    const dn = parseISO(f.data_nascimento)
    const proxAniv = new Date(hoje.getFullYear(), dn.getMonth(), dn.getDate())
    if (proxAniv < hoje) proxAniv.setFullYear(hoje.getFullYear() + 1)
    const diff = (proxAniv.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
    return diff >= 0 && diff <= 30
  }).sort((a, b) => {
    const dn_a = parseISO(a.data_nascimento!)
    const dn_b = parseISO(b.data_nascimento!)
    const pa = new Date(hoje.getFullYear(), dn_a.getMonth(), dn_a.getDate())
    const pb = new Date(hoje.getFullYear(), dn_b.getMonth(), dn_b.getDate())
    if (pa < hoje) pa.setFullYear(hoje.getFullYear() + 1)
    if (pb < hoje) pb.setFullYear(hoje.getFullYear() + 1)
    return pa.getTime() - pb.getTime()
  })

  return (
    <div className="space-y-5">
      {/* Navegação de mês */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setRefDate(d => subMonths(d, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium w-36 text-center capitalize">
          {format(refDate, 'MMMM yyyy', { locale: ptBR })}
        </span>
        <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setRefDate(d => addMonths(d, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setRefDate(new Date())}>
          Hoje
        </Button>
      </div>

      {/* Cards mês */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Aniversariantes pessoais */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Cake className="h-4 w-4 text-pink-500" />
            <p className="text-sm font-semibold text-gray-700">
              Aniversariantes de {format(refDate, 'MMMM', { locale: ptBR })}
            </p>
          </div>
          {aniversariantes.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Nenhum aniversariante neste mês</p>
          ) : (
            <div className="space-y-2.5">
              {aniversariantes.map(f => (
                <div key={f.id} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-pink-100 flex items-center justify-center text-pink-700 text-xs font-bold shrink-0">
                    {iniciais(f.nome)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{f.nome}</p>
                    <p className="text-xs text-gray-400">
                      {format(parseISO(f.data_nascimento!), "dd 'de' MMMM", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Aniversário de empresa */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-semibold text-gray-700">
              Aniversário de Empresa — {format(refDate, 'MMMM', { locale: ptBR })}
            </p>
          </div>
          {anivEmpresa.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Nenhum aniversário de empresa neste mês</p>
          ) : (
            <div className="space-y-2.5">
              {anivEmpresa.map(f => {
                const anos = differenceInYears(new Date(ano, mes - 1, 1), parseISO(f.data_admissao))
                return (
                  <div key={f.id} className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-bold shrink-0">
                      {iniciais(f.nome)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{f.nome}</p>
                      <p className="text-xs text-gray-400">
                        {format(parseISO(f.data_admissao), "dd 'de' MMMM", { locale: ptBR })} • {anos} {anos === 1 ? 'ano' : 'anos'}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Próximos 30 dias */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Cake className="h-4 w-4 text-blue-400" />
          <p className="text-sm font-semibold text-gray-700">Próximos 30 dias</p>
        </div>
        {proximos30.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhum aniversário nos próximos 30 dias</p>
        ) : (
          <div className="space-y-2.5">
            {proximos30.map(f => (
              <div key={f.id} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 text-xs font-bold shrink-0">
                  {iniciais(f.nome)}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{f.nome}</p>
                  <p className="text-xs text-gray-400">
                    {format(parseISO(f.data_nascimento!), "dd 'de' MMMM", { locale: ptBR })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
