'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  UserCircle,
  DollarSign,
  BarChart2,
  Bell,
  Calendar,
  BookOpen,
  Settings,
  LogOut,
  MessageSquare,
  ShieldCheck,
  ClipboardList,
  Briefcase,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'

const navItems = [
  { href: '/dashboard',         label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/leads',             label: 'Leads',        icon: Users },
  { href: '/pessoas',           label: 'Pessoas',      icon: UserCircle },
  { href: '/conversas',         label: 'Conversas',    icon: MessageSquare },
  { href: '/operacional',       label: 'Operacional',  icon: ClipboardList },
  { href: '/financeiro',        label: 'Financeiro',   icon: DollarSign },
  { href: '/relatorios',        label: 'Relatórios',   icon: BarChart2 },
  { href: '/notificacoes',      label: 'Notificações', icon: Bell },
  { href: '/agenda',            label: 'Agenda',       icon: Calendar },
  { href: '/base-conhecimento', label: 'Biblioteca',   icon: BookOpen },
]

const negociosItems = [
  { href: '/negocios/financiamento', label: 'Financiamento' },
  { href: '/negocios/consorcio',     label: 'Consórcio' },
  { href: '/negocios/contrato',      label: 'Contrato' },
  { href: '/negocios/registro',      label: 'Registro' },
]

const adminItems = [
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const { data: usuario } = useUsuarioAtual()
  const [negociosAberto, setNegociosAberto] = useState(
    () => pathname.startsWith('/negocios') || pathname.startsWith('/processos')
  )

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const isAdmin = usuario?.perfil === 'admin'
  const isGestor = usuario?.perfil === 'admin' || usuario?.perfil === 'gerente'

  return (
    <aside className="flex flex-col w-60 min-h-screen bg-[#253B29] text-white">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="w-9 h-9 bg-[#C2AA6A] rounded-lg flex items-center justify-center shrink-0">
          <span className="text-[#253B29] font-bold text-lg">F</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">Fontinhas</p>
          <p className="text-xs text-white/50 truncate">Assessoria</p>
        </div>
      </div>

      {/* Nav principal */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-white/15 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}

        {/* ── Negócios submenu ── */}
        <button
          onClick={() => setNegociosAberto((v) => !v)}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
            pathname.startsWith('/negocios') || pathname.startsWith('/processos')
              ? 'bg-white/15 text-white'
              : 'text-white/70 hover:bg-white/10 hover:text-white'
          )}
        >
          <Briefcase className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Negócios</span>
          {negociosAberto
            ? <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        </button>

        {negociosAberto && (
          <div className="ml-3 border-l border-white/10 pl-2 space-y-0.5">
            {negociosItems.map(({ href, label }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                    active
                      ? 'bg-white/15 text-white'
                      : 'text-white/60 hover:bg-white/10 hover:text-white'
                  )}
                >
                  {label}
                </Link>
              )
            })}
          </div>
        )}

        {isGestor && (
          <>
            <div className="my-2 border-t border-white/10" />
            {[{ href: '/gestao', label: 'Gestão', icon: ShieldCheck }].map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link key={href} href={href}
                  className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    active ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                  )}>
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              )
            })}
          </>
        )}

        {isAdmin && (
          <>
            <div className="my-2 border-t border-white/10" />
            {adminItems.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    active
                      ? 'bg-white/15 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              )
            })}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 border-t border-white/10 pt-3 space-y-1">
        {usuario && (
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-[#C2AA6A]/30 flex items-center justify-center shrink-0">
              <span className="text-[#C2AA6A] text-xs font-bold uppercase">
                {usuario.nome.charAt(0)}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white truncate">{usuario.nome}</p>
              <p className="text-xs text-white/40 truncate capitalize">{usuario.perfil}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </aside>
  )
}
