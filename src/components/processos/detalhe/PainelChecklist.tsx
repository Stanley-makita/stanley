'use client'

import { ClipboardCheck } from 'lucide-react'

export interface ChecklistItem {
  id: string
  label: string
  obrigatorio: boolean
}

export const CHECKLISTS_POR_FASE: Record<string, ChecklistItem[]> = {
  'Preparação': [
    { id: 'cpf',   label: 'Verificar CPF do cliente',   obrigatorio: true  },
    { id: 'valor', label: 'Confirmar valor do imóvel',   obrigatorio: true  },
    { id: 'renda', label: 'Verificar renda declarada',   obrigatorio: false },
  ],
  'Coleta de Documentos': [
    { id: 'rg',       label: 'RG/CPF solicitado',                  obrigatorio: true  },
    { id: 'holerite', label: 'Holerite solicitado',                obrigatorio: true  },
    { id: 'comprov',  label: 'Comprovante residência solicitado',  obrigatorio: true  },
    { id: 'certidao', label: 'Certidão nascimento/casamento',      obrigatorio: false },
  ],
  'Análise de Crédito': [
    { id: 'docs',      label: 'Documentos conferidos',            obrigatorio: true  },
    { id: 'banco',     label: 'Enviado ao banco',                 obrigatorio: true  },
    { id: 'protocolo', label: 'Número do protocolo registrado',   obrigatorio: false },
  ],
}

interface Props {
  faseNome: string | null | undefined
  checkedItems: Set<string>
  onToggle: (id: string) => void
}

export function PainelChecklist({ faseNome, checkedItems, onToggle }: Props) {
  const itens = faseNome ? (CHECKLISTS_POR_FASE[faseNome] ?? null) : null
  const obrigatoriosPendentes = itens
    ? itens.filter(i => i.obrigatorio && !checkedItems.has(i.id)).length
    : 0

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-[#253B29]" />
          <span className="text-sm font-semibold text-[#253B29]">Checklist da fase</span>
        </div>
        {obrigatoriosPendentes > 0 && (
          <span className="text-xs bg-red-100 text-red-600 font-medium px-1.5 py-0.5 rounded-full">
            {obrigatoriosPendentes} pendente{obrigatoriosPendentes > 1 ? 's' : ''}
          </span>
        )}
        {itens && obrigatoriosPendentes === 0 && itens.length > 0 && (
          <span className="text-xs bg-green-100 text-green-600 font-medium px-1.5 py-0.5 rounded-full">
            ✓ Completo
          </span>
        )}
      </div>

      {/* Itens */}
      {!faseNome || !itens ? (
        <p className="text-xs text-gray-400 text-center py-3">
          Nenhum checklist configurado para esta fase.
        </p>
      ) : (
        <div className="space-y-2">
          {itens.map((item) => {
            const checked = checkedItems.has(item.id)
            return (
              <label
                key={item.id}
                className="flex items-start gap-2.5 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(item.id)}
                  className="mt-0.5 h-3.5 w-3.5 rounded accent-[#253B29] shrink-0 cursor-pointer"
                />
                <span className={`text-xs leading-relaxed ${checked ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                  {item.label}
                  {item.obrigatorio && (
                    <span className="ml-1 text-red-500 font-bold" title="Obrigatório">*</span>
                  )}
                </span>
              </label>
            )
          })}
          <p className="text-[10px] text-gray-400 pt-1">
            <span className="text-red-500">*</span> Itens obrigatórios para avançar de fase
          </p>
        </div>
      )}
    </div>
  )
}
