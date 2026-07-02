'use client'

import { cn } from '@/lib/utils'
import type { Fase } from '@/types/configuracoes'

interface Props {
  fases: Fase[]
  faseAtualId: string | null
  /** Decide se a fase no índice `idx` pode ser clicada — controla a regra de avanço de cada módulo. */
  podeClicar: (idx: number) => boolean
  onClicarFase: (fase: Fase, idx: number) => void
  disabled?: boolean
}

const ARROW_SIZE = 14 // px — tamanho da seta lateral

/** Retorna o clip-path correto de acordo com a posição na barra */
function clipPath(isFirst: boolean, isLast: boolean) {
  if (isFirst) {
    return `polygon(0 0, calc(100% - ${ARROW_SIZE}px) 0, 100% 50%, calc(100% - ${ARROW_SIZE}px) 100%, 0 100%)`
  }
  if (isLast) {
    return `polygon(${ARROW_SIZE}px 0, 100% 0, 100% 100%, 0 100%, ${ARROW_SIZE}px 50%)`
  }
  return `polygon(${ARROW_SIZE}px 0, calc(100% - ${ARROW_SIZE}px) 0, 100% 50%, calc(100% - ${ARROW_SIZE}px) 100%, 0 100%, ${ARROW_SIZE}px 50%)`
}

/** Barra de fases estilo Ploomes — breadcrumb com setas, fase atual destacada. */
export function FaseBreadcrumbBar({ fases, faseAtualId, podeClicar, onClicarFase, disabled }: Props) {
  const idxAtual = fases.findIndex((f) => f.id === faseAtualId)

  return (
    <div className="flex shrink-0 overflow-x-auto border-b border-gray-200 bg-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {fases.map((fase, idx) => {
        const isAtual    = idx === idxAtual
        const isPast     = idx < idxAtual
        const isClicavel = podeClicar(idx)
        const isFirst    = idx === 0
        const isLast     = idx === fases.length - 1

        // Cor de fundo: atual = cor da fase, passada = cinza, futura = cinza muito claro
        const bg = isAtual
          ? (fase.cor ?? 'var(--fonti-primary)')
          : isPast
            ? '#e5e7eb'   // gray-200
            : '#f9fafb'   // gray-50

        const textColor = isAtual ? '#ffffff' : isPast ? '#6b7280' : '#9ca3af'

        return (
          <button
            key={fase.id}
            disabled={!isClicavel || disabled}
            onClick={() => onClicarFase(fase, idx)}
            title={isClicavel ? `Mover para ${fase.nome}` : fase.nome}
            className={cn(
              'relative flex h-9 items-center justify-center whitespace-nowrap text-xs font-semibold transition-all select-none focus:outline-none',
              // padding extra para o recuo da seta
              isFirst ? 'pl-4' : 'pl-[calc(1rem+14px)]',
              isLast  ? 'pr-4' : 'pr-[calc(1rem+14px)]',
              // sobreposição: cada fase fica 14px à esquerda da anterior
              idx > 0 && '-ml-[14px]',
              // z-index crescente para que a fase atual fique na frente das seguintes
              idx === idxAtual && 'z-10',
              isPast    && 'z-[5]',
              !isPast && !isAtual && cn('z-[4]', isClicavel && 'cursor-pointer hover:brightness-95'),
            )}
            style={{
              clipPath: clipPath(isFirst, isLast),
              backgroundColor: bg,
              color: textColor,
              // fases futuras: simular borda com shadow inset
              boxShadow: !isPast && !isAtual ? 'inset 0 0 0 1px #e5e7eb' : undefined,
            }}
          >
            {fase.nome}
          </button>
        )
      })}
    </div>
  )
}
