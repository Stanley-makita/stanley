'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  UserCircle,
  Building2,
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
  Calculator,
  UserCheck,
  ChevronDown,
} from 'lucide-react'
import { useAuth } from '@/hooks/auth/useAuth'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { useAgendaBadge } from '@/hooks/useAgendaBadge'
import { useLeadsBadge } from '@/hooks/leads/useLeadsBadge'
import { useSolicitacoesBadge } from '@/hooks/solicitacoes/useSolicitacoesBadge'
import { useConversasBadge } from '@/hooks/conversas/useConversasBadge'

const navItemsTop = [
  { href: '/dashboard',         label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/leads',             label: 'Comercial',    icon: Users },
  { href: '/pessoas',           label: 'Pessoas',      icon: UserCircle },
  { href: '/imoveis',           label: 'Imóveis',      icon: Building2 },
]

const navItemsBottom = [
  { href: '/conversas',         label: 'Conversas',    icon: MessageSquare },
  { href: '/operacional',       label: 'Operacional',  icon: ClipboardList },
  { href: '/simuladores',       label: 'Simuladores',  icon: Calculator },
  { href: '/relatorios',        label: 'Relatórios',   icon: BarChart2 },
  { href: '/notificacoes',      label: 'Notificações', icon: Bell },
  { href: '/agenda',            label: 'Agenda',       icon: Calendar },
  { href: '/base-conhecimento', label: 'Biblioteca',   icon: BookOpen },
]

const GESTAO_ROUTES = ['/gestao', '/rh', '/financeiro', '/configuracoes']

interface SidebarProps {
  className?: string
  onNavigate?: () => void
}

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const pathname = usePathname()
  const { data: usuario } = useUsuarioAtual()
  const { sair } = useAuth()
  const { data: agendaBadge = 0 } = useAgendaBadge()
  const { data: leadsBadge = 0 } = useLeadsBadge()
  const { data: operacionalBadge = 0 } = useSolicitacoesBadge()
  const { data: conversasBadge = 0 } = useConversasBadge()

  const isAdmin = usuario?.perfil === 'admin'
  const isGestor = usuario?.perfil === 'admin' || usuario?.perfil === 'gerente'

  const isGestaoAtivo = GESTAO_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))
  const [gestaoAberto, setGestaoAberto] = useState(isGestaoAtivo)

  useEffect(() => {
    if (isGestaoAtivo) setGestaoAberto(true)
  }, [pathname])

  return (
    <aside className={cn('flex h-screen w-60 flex-col bg-fonti-primary text-white', className)}>
      {/* Logo */}
      <div className="flex items-center justify-center px-4 py-4 border-b border-white/10">
        <Image
          src="/images/logos/logotipo retangular fontinhas assessoria.jpg"
          alt="Fontinhas Assessoria"
          width={180}
          height={90}
          className="object-contain"
          priority
        />
      </div>

      {/* Nav principal */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItemsTop.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          const isLeads = href === '/leads'
          return (
            <div key={href} className="relative">
              <Link
                href={href}
                onClick={onNavigate}
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
              {isLeads && leadsBadge > 0 && (
                <span className="absolute top-1 right-2 min-w-[18px] h-[18px] rounded-full bg-fonti-accent text-fonti-primary text-[10px] font-bold flex items-center justify-center px-1 pointer-events-none">
                  {leadsBadge > 99 ? '99+' : leadsBadge}
                </span>
              )}
            </div>
          )
        })}

        {/* ── Negócios ── */}
        {(() => {
          const negociosActive = pathname === '/negocios'
            || pathname.startsWith('/negocios/')
            || pathname.startsWith('/processos')
          return (
            <Link
              href="/negocios"
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                negociosActive
                  ? 'bg-white/15 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              )}
            >
              <Briefcase className="h-4 w-4 shrink-0" />
              Negócios
            </Link>
          )
        })()}

        {navItemsBottom.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          const isAgenda = href === '/agenda'
          const isOperacional = href === '/operacional'
          const isConversas = href === '/conversas'
          return (
            <div key={href} className="relative">
              <Link
                href={href}
                onClick={onNavigate}
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
              {isAgenda && agendaBadge > 0 && (
                <span className="absolute top-1 right-2 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 pointer-events-none">
                  {agendaBadge > 99 ? '99+' : agendaBadge}
                </span>
              )}
              {isOperacional && operacionalBadge > 0 && (
                <span className="absolute top-1 right-2 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 pointer-events-none">
                  {operacionalBadge > 99 ? '99+' : operacionalBadge}
                </span>
              )}
              {isConversas && conversasBadge > 0 && (
                <span className="absolute top-1 right-2 min-w-[18px] h-[18px] rounded-full bg-fonti-accent text-fonti-primary text-[10px] font-bold flex items-center justify-center px-1 pointer-events-none">
                  {conversasBadge > 99 ? '99+' : conversasBadge}
                </span>
              )}
            </div>
          )
        })}

        {/* ── Gestão (grupo colapsável) ── */}
        <div className="my-2 border-t border-white/10" />
        <div>
          <button
            onClick={() => setGestaoAberto(v => !v)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isGestaoAtivo
                ? 'bg-white/15 text-white'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            )}
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            Gestão
            <ChevronDown className={cn(
              'ml-auto h-3.5 w-3.5 transition-transform duration-200',
              gestaoAberto && 'rotate-180'
            )} />
          </button>

          {gestaoAberto && (
            <div className="ml-4 mt-0.5 border-l border-white/10 pl-2 space-y-0.5">
              {isGestor && (
                <Link
                  href="/gestao"
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    pathname === '/gestao' || pathname.startsWith('/gestao/')
                      ? 'bg-white/15 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  Painel
                </Link>
              )}
              <Link
                href="/rh"
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  pathname === '/rh' || pathname.startsWith('/rh/')
                    ? 'bg-white/15 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                <UserCheck className="h-4 w-4 shrink-0" />
                RH
              </Link>
              <Link
                href="/financeiro"
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  pathname === '/financeiro' || pathname.startsWith('/financeiro/')
                    ? 'bg-white/15 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                <DollarSign className="h-4 w-4 shrink-0" />
                Financeiro
              </Link>
              {isAdmin && (
                <Link
                  href="/configuracoes"
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    pathname === '/configuracoes' || pathname.startsWith('/configuracoes/')
                      ? 'bg-white/15 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <Settings className="h-4 w-4 shrink-0" />
                  Configurações
                </Link>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 border-t border-white/10 pt-3 space-y-1">
        {usuario && (
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-fonti-accent/30 flex items-center justify-center shrink-0">
              <span className="text-fonti-accent text-xs font-bold uppercase">
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
          onClick={sair}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </aside>
  )
}
