'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Paperclip, Mic, MicOff, X, Smile, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'

interface EmojiPickerProps {
  data: object
  onEmojiSelect: (emoji: { native: string }) => void
  locale?: string
  theme?: string
  previewPosition?: string
  skinTonePosition?: string
}

const EmojiPickerLib = dynamic(
  () => import('@emoji-mart/react').then((m) => m.default as React.ComponentType<EmojiPickerProps>),
  { ssr: false }
)

type TipoMidia = 'text' | 'image' | 'video' | 'audio' | 'document' | 'ptt'

interface AnexoPendente {
  tipo: TipoMidia
  base64: string
  mimeType: string
  nome?: string
  previewUrl?: string
}

interface PainelComposicaoProps {
  conversaId: string
  telefone: string
  disabled?: boolean
  onEnviado?: () => void
}

const LIMITE_MB: Record<string, number> = { image: 5, video: 15, audio: 10, document: 20, ptt: 10 }

function fileParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function detectarTipo(mime: string): TipoMidia {
  if (mime.startsWith('image/'))  return 'image'
  if (mime.startsWith('video/'))  return 'video'
  if (mime.startsWith('audio/'))  return 'audio'
  return 'document'
}

export function PainelComposicao({ conversaId, telefone, disabled, onEnviado }: PainelComposicaoProps) {
  const [texto, setTexto] = useState('')
  const [anexo, setAnexo] = useState<AnexoPendente | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [tempoGravacao, setTempoGravacao] = useState(0)
  const [emojiAberto, setEmojiAberto] = useState(false)
  const [emojiData, setEmojiData] = useState<object | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Carrega dados do emoji-mart
  useEffect(() => {
    if (emojiAberto && !emojiData) {
      import('@emoji-mart/data').then((m) => setEmojiData(m.default))
    }
  }, [emojiAberto, emojiData])

  async function enviar(tipoOverride?: TipoMidia, arquivoOverride?: string, mimeOverride?: string, nomeOverride?: string) {
    const tipo: TipoMidia = tipoOverride ?? (anexo ? anexo.tipo : 'text')
    const temTexto = texto.trim().length > 0
    const temAnexo = !!anexo || !!arquivoOverride

    if (!temTexto && !temAnexo) return

    setEnviando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''

      const res = await fetch('/api/bot/whatsapp/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversa_id: conversaId,
          telefone,
          tipo,
          texto: temTexto ? texto.trim() : undefined,
          arquivo: arquivoOverride ?? anexo?.base64,
          nome_arquivo: nomeOverride ?? anexo?.nome,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Erro ao enviar')
      }
      setTexto('')
      setAnexo(null)
      textareaRef.current?.focus()
      onEnviado?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível enviar. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  async function processarArquivo(file: File) {
    const tipo = detectarTipo(file.type)
    const limiteMB = LIMITE_MB[tipo] ?? 20
    if (file.size > limiteMB * 1024 * 1024) {
      toast.error(`Arquivo muito grande. Limite: ${limiteMB}MB para ${tipo}.`)
      return
    }
    const base64 = await fileParaBase64(file)
    const previewUrl = tipo === 'image' ? URL.createObjectURL(file) : undefined
    setAnexo({ tipo, base64, mimeType: file.type, nome: file.name, previewUrl })
    setEmojiAberto(false)
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items)
    const imgItem = items.find((i) => i.type.startsWith('image/'))
    if (imgItem) {
      e.preventDefault()
      const file = imgItem.getAsFile()
      if (file) processarArquivo(file)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }

  async function iniciarGravacao() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const reader = new FileReader()
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1]
          await enviar('ptt', base64, 'audio/webm')
        }
        reader.readAsDataURL(blob)
        setTempoGravacao(0)
      }
      mr.start()
      mediaRecorderRef.current = mr
      setGravando(true)
      timerRef.current = setInterval(() => setTempoGravacao((t) => t + 1), 1000)
    } catch {
      toast.error('Não foi possível acessar o microfone.')
    }
  }

  function pararGravacao() {
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
    if (timerRef.current) clearInterval(timerRef.current)
    setGravando(false)
  }

  const onSelectEmoji = useCallback((emoji: { native: string }) => {
    setTexto((t) => t + emoji.native)
    setEmojiAberto(false)
    textareaRef.current?.focus()
  }, [])

  const formatarTempo = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  if (disabled) {
    return (
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 text-center">
        <p className="text-xs text-gray-400">Conversa encerrada — não é possível enviar mensagens.</p>
      </div>
    )
  }

  return (
    <div className="border-t border-gray-200 bg-white">
      {/* Preview de anexo */}
      {anexo && (
        <div className="px-4 pt-3 flex items-start gap-3">
          <div className="relative">
            {anexo.tipo === 'image' && anexo.previewUrl ? (
              <img src={anexo.previewUrl} alt="Prévia" className="h-16 w-16 object-cover rounded-lg border border-gray-200" />
            ) : (
              <div className="h-16 w-16 rounded-lg border border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-1">
                <FileText className="w-5 h-5 text-gray-400" />
                <span className="text-[9px] text-gray-400 truncate max-w-[56px] px-1">{anexo.nome}</span>
              </div>
            )}
            <button
              onClick={() => setAnexo(null)}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-700 text-white flex items-center justify-center hover:bg-red-500 transition-colors"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-700 truncate">{anexo.nome ?? anexo.tipo}</p>
            <p className="text-[11px] text-gray-400 capitalize">{anexo.tipo}</p>
          </div>
        </div>
      )}

      {/* Emoji picker */}
      {emojiAberto && (
        <div className="absolute bottom-16 left-4 z-50 shadow-xl rounded-xl overflow-hidden">
          {emojiData && (
            <EmojiPickerLib
              data={emojiData}
              onEmojiSelect={onSelectEmoji}
              locale="pt"
              theme="light"
              previewPosition="none"
              skinTonePosition="none"
            />
          )}
        </div>
      )}

      {/* Modo gravação */}
      {gravando ? (
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm text-gray-700 font-medium">Gravando… {formatarTempo(tempoGravacao)}</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
            onClick={pararGravacao}
          >
            <MicOff className="w-3.5 h-3.5" />
            Enviar áudio
          </Button>
        </div>
      ) : (
        <div className="px-3 py-2.5 flex items-end gap-2">
          {/* Emoji */}
          <button
            onClick={() => setEmojiAberto((v) => !v)}
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0',
              emojiAberto && 'text-fonti-accent bg-fonti-accent/10'
            )}
            title="Emojis"
          >
            <Smile className="w-4.5 h-4.5" />
          </button>

          {/* Anexar arquivo */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
            title="Anexar imagem, vídeo ou documento"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,audio/*,.pdf,.docx,.xlsx,.zip"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) processarArquivo(f); e.target.value = '' }}
          />

          {/* Textarea */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              placeholder={anexo ? 'Adicione uma legenda (opcional)…' : 'Digite uma mensagem… (Cole imagens com Ctrl+V)'}
              rows={1}
              className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-fonti-primary/30 focus:border-fonti-primary/30 max-h-32 overflow-y-auto"
              style={{ minHeight: '38px' }}
              onInput={(e) => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 128)}px`
              }}
            />
          </div>

          {/* Gravar áudio ou Enviar */}
          {!texto.trim() && !anexo ? (
            <button
              onMouseDown={iniciarGravacao}
              onTouchStart={(e) => { e.preventDefault(); iniciarGravacao() }}
              onMouseUp={pararGravacao}
              onTouchEnd={pararGravacao}
              className="w-9 h-9 rounded-full bg-fonti-primary flex items-center justify-center text-white hover:bg-fonti-primary-hover transition-colors shrink-0"
              title="Segurar para gravar áudio"
            >
              <Mic className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => enviar()}
              disabled={enviando}
              className="w-9 h-9 rounded-full bg-fonti-primary flex items-center justify-center text-white hover:bg-fonti-primary-hover disabled:opacity-50 transition-colors shrink-0"
              title="Enviar (Enter)"
            >
              {enviando
                ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <Send className="w-3.5 h-3.5" />
              }
            </button>
          )}
        </div>
      )}
    </div>
  )
}
