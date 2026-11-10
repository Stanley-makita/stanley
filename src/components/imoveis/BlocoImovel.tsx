'use client'

import { useRegistrosImoveis } from '@/hooks/configuracoes/useRegistrosImoveis'
import type { Processo } from '@/types/processos'
import type { Imovel } from '@/types/imoveis'
import { ImovelVinculoCard } from './ImovelVinculoCard'
import { AvaliacoesEngenhariaImovel } from './AvaliacoesEngenhariaImovel'
import type { ImovelSelecionado } from '@/components/leads/SeletorImovelProcesso'
import { comTipoPretendidoSugerido } from '@/lib/oportunidade/tipoEDespesas'

interface Props {
  processo: Processo
  onUpdate: (campos: Partial<Omit<Processo, 'id' | 'empresa_id'>>) => void
  isPending?: boolean
}

export function BlocoImovel({ processo, onUpdate: onUpdateBruto, isPending }: Props) {
  const { data: registros = [] } = useRegistrosImoveis()
  // Tipo pretendido vazio → sugerido pelo imóvel cadastrado (nunca sobrescreve o escolhido).
  const onUpdate: Props['onUpdate'] = (campos) => onUpdateBruto(comTipoPretendidoSugerido(campos, processo.tipo_imovel))

  const snapshot: ImovelSelecionado = {
    imovel_id: processo.imovel_id ?? null,
    imovel_matricula: processo.imovel_matricula ?? null,
    imovel_tipo: processo.imovel_tipo ?? null,
    imovel_categoria: processo.imovel_categoria ?? null,
    imovel_area_construida: processo.imovel_area_construida ?? null,
    imovel_area_terreno: processo.imovel_area_terreno ?? null,
    imovel_rua: processo.imovel_rua ?? null,
    imovel_numero: processo.imovel_numero ?? null,
    imovel_complemento: processo.imovel_complemento ?? null,
    imovel_bairro: processo.imovel_bairro ?? null,
    imovel_cidade: processo.imovel_cidade ?? null,
    imovel_uf: processo.imovel_uf ?? null,
    imovel_registro_id: processo.imovel_registro_id ?? null,
    nome_imovel: processo.nome_imovel ?? '',
  }

  function handleVincular(imovel: Imovel) {
    onUpdate({
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
      nome_imovel: [imovel.rua, imovel.numero, imovel.bairro, imovel.cidade].filter(Boolean).join(', ') || processo.nome_imovel,
    })
  }

  function handleDesvincular() {
    onUpdate({
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
      onEditarSnapshot={onUpdate}
      onDesvincular={handleDesvincular}
      isPending={isPending}
      registros={registros}
      contextoLabel="este processo"
      slotExtra={<AvaliacoesEngenhariaImovel imovelId={processo.imovel_id} />}
    />
  )
}
