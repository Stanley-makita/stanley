'use client'

import { Input } from './input'
import { cn } from '@/lib/utils'

interface InputMoedaProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

function paraExibicao(valor: string): string {
  const centavos = Math.round((Number(valor) || 0) * 100)
  return (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Input de moeda com mascara BRL (digita da direita pra esquerda, ultimos
 * 2 digitos sao centavos). Recebe/emite valor como string decimal simples
 * (ex: "1000.00"), compativel com o Number(...) ja usado nos formularios. */
export function InputMoeda({ value, onChange, placeholder, className, disabled }: InputMoedaProps) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digitos = e.target.value.replace(/\D/g, '')
    const centavos = digitos ? parseInt(digitos, 10) : 0
    onChange(centavos ? (centavos / 100).toFixed(2) : '')
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
      <Input
        type="text"
        inputMode="numeric"
        value={value ? paraExibicao(value) : ''}
        onChange={handleChange}
        placeholder={placeholder ?? '0,00'}
        className={cn('pl-9 text-right tabular-nums', className)}
        disabled={disabled}
      />
    </div>
  )
}
