'use client'

import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface RelatorioCard {
  id: string
  titulo: string
  descricao: string
  cor: string
}

const RELATORIOS: RelatorioCard[] = [
  { id: 'ponto_mensal',      titulo: 'Folha de Ponto Mensal',    descricao: 'Relatório completo de registro de ponto de todos os funcionários', cor: 'text-blue-600 bg-blue-50' },
  { id: 'banco_horas',       titulo: 'Banco de Horas',           descricao: 'Saldo de horas extras e débitos de cada funcionário',             cor: 'text-purple-600 bg-purple-50' },
  { id: 'funcionarios_ativ', titulo: 'Funcionários Ativos',      descricao: 'Lista de todos os funcionários ativos com dados cadastrais',       cor: 'text-green-600 bg-green-50' },
  { id: 'historico_ferias',  titulo: 'Histórico de Férias',      descricao: 'Registro de férias gozadas e programadas por funcionário',         cor: 'text-orange-500 bg-orange-50' },
  { id: 'comissoes',         titulo: 'Comissões Calculadas',      descricao: 'Relatório de comissões por funcionário e período',                 cor: 'text-emerald-600 bg-emerald-50' },
]

export function RelatoriosTab() {
  function handleExportar(id: string, tipo: 'pdf' | 'excel') {
    toast.info(`Exportação de ${tipo.toUpperCase()} em desenvolvimento.`)
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-700">Relatórios Disponíveis</h3>
        <p className="text-xs text-gray-400 mt-0.5">Exporte relatórios em PDF ou Excel para análise e documentação</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {RELATORIOS.map(r => (
          <div key={r.id} className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${r.cor}`}>
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{r.titulo}</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-snug">{r.descricao}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => handleExportar(r.id, 'pdf')}>
                <FileText className="h-3 w-3" /> PDF
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => handleExportar(r.id, 'excel')}>
                <FileText className="h-3 w-3" /> Excel
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
