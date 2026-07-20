'use client'

import { useRegistrosImoveis } from '@/hooks/configuracoes/useRegistrosImoveis'
import { useEditarLead } from '@/hooks/leads/useEditarLead'
import type { Lead } from '@/types/leads'
import type { Imovel } from '@/types/imoveis'
import { ImovelVinculoCard } from '@/components/imoveis/ImovelVinculoCard'
import type { ImovelSelecionado } from '@/components/leads/SeletorImovelProcesso'

interface Props {
  lead: Lead
}

export function BlocoImovelLead({ lead }: Props) {
  const { data: registros = [] } = useRegistrosImoveis()
  const editar = useEditarLead()

  const snapshot: ImovelSelecionado = {
    imovel_id: lead.imovel_id ?? null,
    imovel_matricula: lead.imovel_matricula ?? null,
    imovel_tipo: lead.imovel_tipo ?? null,
    imovel_categoria: lead.imovel_categoria ?? null,
    imovel_area_construida: lead.imovel_area_construida ?? null,
    imovel_area_terreno: lead.imovel_area_terreno ?? null,
    imovel_rua: lead.imovel_rua ?? null,
    imovel_numero: lead.imovel_numero ?? null,
    imovel_complemento: lead.imovel_complemento ?? null,
    imovel_bairro: lead.imovel_bairro ?? null,
    imovel_cidade: lead.imovel_cidade ?? null,
    imovel_uf: lead.imovel_uf ?? null,
    imovel_registro_id: lead.imovel_registro_id ?? null,
    nome_imovel: lead.nome_imovel ?? '',
  }

  function salvar(patch: Partial<ImovelSelecionado>) {
    editar.mutate({ id: lead.id, ...patch })
  }

  function handleVincular(imovel: Imovel) {
    salvar({
      imovel_id: imovel.id,
      imovel_matricula: imovel.matricula,
      imovel_tipo: imovel.tipo,
      imovel_categoria: imovel.categoria,
      imovel_area_construida: imovel.area_construida,
      imovel_area_terreno: imovel.area_terreno,
      imovel_rua: imovel.rua,
      imovel_numero: imovel.numero,
      imovel_complemento: imovel.apto_unidade,
      imovel_bairro: imovel.bairro,
      imovel_cidade: imovel.cidade,
      imovel_uf: imovel.uf,
      imovel_registro_id: imovel.registro_imoveis_id,
      nome_imovel: [imovel.rua, imovel.numero, imovel.bairro, imovel.cidade].filter(Boolean).join(', ') || lead.nome_imovel || '',
    })
  }

  function handleDesvincular() {
    salvar({
      imovel_id: null,
      imovel_matricula: null,
      imovel_tipo: null,
      imovel_categoria: null,
      imovel_area_construida: null,
      imovel_area_terreno: null,
      imovel_rua: null,
      imovel_numero: null,
      imovel_complemento: null,
      imovel_bairro: null,
      imovel_cidade: null,
      imovel_uf: null,
      imovel_registro_id: null,
      nome_imovel: '',
    })
  }

  return (
    <ImovelVinculoCard
      snapshot={snapshot}
      onVincular={handleVincular}
      onEditarSnapshot={salvar}
      onDesvincular={handleDesvincular}
      isPending={editar.isPending}
      registros={registros}
      contextoLabel="este lead"
    />
  )
}
