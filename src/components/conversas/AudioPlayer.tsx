'use client'

import { useState, useRef, useEffect } from 'react'
import { Play, Pause } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AudioPlayerProps {
  src: string
  className?: string
}

export function AudioPlayer({ src, className }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [tocando, setTocando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [duracao, setDuracao] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onLoaded = () => setDuracao(audio.duration)
    const onTime = () => setProgresso(audio.currentTime / audio.duration)
    const onEnded = () => { setTocando(false); setProgresso(0) }
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('ended', onEnded)
    }
  }, [])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (tocando) { audio.pause(); setTocando(false) }
    else { audio.play(); setTocando(true) }
  }

  function formatarTempo(s: number) {
    if (!isFinite(s)) return '0:00'
    const m = Math.floor(s / 60)
    const seg = Math.floor(s % 60)
    return `${m}:${seg.toString().padStart(2, '0')}`
  }

  return (
    <div className={cn('flex items-center gap-2 min-w-[180px]', className)}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        onClick={togglePlay}
        className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center shrink-0 transition-colors"
      >
        {tocando
          ? <Pause className="w-3.5 h-3.5" />
          : <Play className="w-3.5 h-3.5 ml-0.5" />
        }
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div
          className="h-1.5 bg-white/30 rounded-full overflow-hidden cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = (e.clientX - rect.left) / rect.width
            if (audioRef.current) {
              audioRef.current.currentTime = pct * duracao
              setProgresso(pct)
            }
          }}
        >
          <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progresso * 100}%` }} />
        </div>
        <span className="text-[10px] opacity-70">
          {formatarTempo(progresso * duracao)} / {formatarTempo(duracao)}
        </span>
      </div>
    </div>
  )
}
