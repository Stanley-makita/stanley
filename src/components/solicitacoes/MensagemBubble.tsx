'use client'

import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function MensagemBubble({
  texto,
  autorNome,
  isPropio,
  isResponsavel,
  createdAt,
}: {
  texto: string
  autorNome: string
  isPropio: boolean
  isResponsavel?: boolean
  createdAt?: string
}) {
  // Cor baseada no papel: responsável (operacional) = verde, solicitante (comercial) = dourado
  const bubbleClass = isResponsavel
    ? 'bg-[#253B29]/8 border border-[#253B29]/20 text-[#253B29]'
    : 'bg-[#E7E0C4]/80 border border-[#C2AA6A]/30 text-[#253B29]'

  const timeClass = 'text-[#253B29]/40'

  return (
    <div className={`flex flex-col gap-0.5 ${isPropio ? 'items-end' : 'items-start'}`}>
      <p className="text-[10px] text-gray-400 px-1">{autorNome}</p>
      <div className={`max-w-[90%] rounded-lg px-2.5 py-1.5 text-xs ${bubbleClass}`}>
        <p className="whitespace-pre-wrap break-words">{texto}</p>
        {createdAt && (
          <p className={`text-[10px] mt-0.5 ${timeClass}`}>
            {formatDistanceToNow(new Date(createdAt), { addSuffix: true, locale: ptBR })}
          </p>
        )}
      </div>
    </div>
  )
}
