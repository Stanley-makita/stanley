'use client'

import { useState, useEffect, useRef } from 'react'
import { MessageCircle, X, Send, Loader2 } from 'lucide-react'

interface Mensagem {
  role: 'user' | 'bot'
  conteudo: string
}

interface Props {
  empresaId: string
}

function getSessionId(): string {
  const key = 'chat_session_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

export function ChatWidget({ empresaId }: Props) {
  const [aberto, setAberto] = useState(false)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [input, setInput] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [sessionId, setSessionId] = useState<string>('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSessionId(getSessionId())
  }, [])

  useEffect(() => {
    if (aberto && mensagens.length === 0) {
      setMensagens([{
        role: 'bot',
        conteudo: 'Olá! Sou o assistente virtual da Fontinhas Assessoria. Posso te ajudar com financiamento imobiliário, consórcio ou crédito com garantia de imóvel. Como posso te ajudar hoje?',
      }])
    }
    if (aberto) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [aberto, mensagens.length])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens, carregando])

  async function enviar() {
    const texto = input.trim()
    if (!texto || carregando || !sessionId) return

    setInput('')
    setMensagens((prev) => [...prev, { role: 'user', conteudo: texto }])
    setCarregando(true)

    try {
      const res = await fetch('/api/bot/site/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem: texto, session_id: sessionId, empresa_id: empresaId }),
      })
      const data = await res.json()
      setMensagens((prev) => [...prev, { role: 'bot', conteudo: data.resposta ?? 'Desculpe, ocorreu um erro. Tente novamente.' }])
    } catch {
      setMensagens((prev) => [...prev, { role: 'bot', conteudo: 'Erro de conexão. Tente novamente.' }])
    } finally {
      setCarregando(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Janela de chat */}
      {aberto && (
        <div className="w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
          style={{ height: '500px' }}>
          {/* Header */}
          <div className="bg-[#253B29] px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#C2AA6A] flex items-center justify-center text-[#253B29] font-bold text-sm">
                F
              </div>
              <div>
                <p className="text-white text-sm font-semibold leading-tight">Fontinhas Assessoria</p>
                <p className="text-white/60 text-xs">Assistente virtual</p>
              </div>
            </div>
            <button
              onClick={() => setAberto(false)}
              className="text-white/70 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50">
            {mensagens.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-snug whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-[#253B29] text-white rounded-br-sm'
                      : 'bg-white text-gray-800 border border-gray-100 rounded-bl-sm shadow-sm'
                  }`}
                >
                  {m.conteudo}
                </div>
              </div>
            ))}
            {carregando && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-3 py-2 shadow-sm">
                  <div className="flex gap-1 items-center h-5">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 p-3 bg-white flex gap-2 items-center shrink-0">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite sua mensagem..."
              disabled={carregando}
              className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-[#253B29] transition-colors disabled:opacity-50 bg-gray-50"
            />
            <button
              onClick={enviar}
              disabled={!input.trim() || carregando}
              className="w-9 h-9 rounded-xl bg-[#253B29] hover:bg-[#1a2b1e] text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Botão flutuante */}
      <button
        onClick={() => setAberto(!aberto)}
        className="w-14 h-14 rounded-full bg-[#253B29] hover:bg-[#1a2b1e] text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center"
        aria-label="Abrir chat"
      >
        {aberto ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>
    </div>
  )
}
