'use client'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CorretoresLista } from './CorretoresLista'
import { ImobiliariasLista } from './ImobiliariasLista'
import { ParceirosLista } from './ParceirosLista'

export function ParceirosComerciaisConfig() {
  return (
    <Tabs defaultValue="corretores">
      <TabsList>
        <TabsTrigger value="corretores">Corretores</TabsTrigger>
        <TabsTrigger value="imobiliarias">Imobiliárias/Construtoras</TabsTrigger>
        <TabsTrigger value="parceiros">Parceiros</TabsTrigger>
      </TabsList>
      <TabsContent value="corretores" className="pt-4">
        <CorretoresLista />
      </TabsContent>
      <TabsContent value="imobiliarias" className="pt-4">
        <ImobiliariasLista />
      </TabsContent>
      <TabsContent value="parceiros" className="pt-4">
        <ParceirosLista />
      </TabsContent>
    </Tabs>
  )
}
