'use client'

import { Package } from 'lucide-react'

export function ProdutosLista() {
  return (
    <div className="text-center py-12 text-gray-500">
      <Package className="h-10 w-10 mx-auto mb-3 text-gray-300" />
      <p className="text-sm font-medium text-gray-600 mb-1">Produtos em breve</p>
      <p className="text-xs text-gray-400">
        O cadastro de produtos e modalidades de crédito será disponibilizado em breve.
      </p>
    </div>
  )
}
