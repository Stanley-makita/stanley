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
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { useAuth } from '@/hooks/auth/useAuth'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { useAgendaBadge } from '@/hooks/useAgendaBadge'
import { useLeadsBadge } from '@/hooks/leads/useLeadsBadge'
import { useSolicitacoesBadge } from '@/hooks/solicitacoes/useSolicitacoesBadge'
import { useConversasBadge } from '@/hooks/conversas/useConversasBadge'

const navItemsTop = [
  { href: '/dashboard',         label: 'Dashboard',    icon: LayoutDashboard, mobileHidden: true },
  { href: '/leads',             label: 'Captação',     icon: Users },
  { href: '/pessoas',           label: 'Pessoas',      icon: UserCircle },
  { href: '/imoveis',           label: 'Imóveis',      icon: Building2,      mobileHidden: true },
]

const navItemsBottom = [
  { href: '/conversas',         label: 'Conversas',    icon: MessageSquare },
  { href: '/operacional',       label: 'Operacional',  icon: ClipboardList },
  { href: '/simuladores',       label: 'Simuladores',  icon: Calculator },
  { href: '/relatorios',        label: 'Relatórios',   icon: BarChart2,      mobileHidden: true },
  { href: '/notificacoes',      label: 'Notificações', icon: Bell,           mobileHidden: true },
  { href: '/agenda',            label: 'Agenda',       icon: Calendar,       mobileHidden: true },
  { href: '/base-conhecimento', label: 'Biblioteca',   icon: BookOpen,       mobileHidden: true },
]

const GESTAO_ROUTES = ['/gestao', '/rh', '/financeiro', '/configuracoes']

interface SidebarProps {
  className?: string
  onNavigate?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export function Sidebar({ className, onNavigate, collapsed = false, onToggleCollapse }: SidebarProps) {
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

  const linkCls = (active: boolean) => cn(
    'flex items-center rounded-lg text-sm font-medium transition-colors',
    collapsed ? 'justify-center px-0 py-3 w-full' : 'gap-3 px-3 py-3',
    active
      ? 'bg-fonti-accent/15 text-white'
      : 'text-white/80 hover:bg-white/10 hover:text-white'
  )

  return (
    <aside
      className={cn('flex h-screen flex-col bg-fonti-primary text-white transition-[width] duration-200 ease-in-out', className)}
      style={{ width: collapsed ? '56px' : 'clamp(192px, 14vw, 240px)' }}
    >
      {/* Logo */}
      <div className={cn('flex items-center border-b border-white/10 shrink-0', collapsed ? 'justify-center px-0 py-3' : 'gap-2.5 px-4 py-4')}>
        <Image
          src="/logo-fonti.png"
          alt="Fonti"
          width={collapsed ? 32 : 38}
          height={collapsed ? 32 : 38}
          className="rounded-xl object-contain shrink-0"
          priority
        />
        {!collapsed && (
          <span className="text-lg font-bold tracking-wide text-white">Fonti</span>
        )}
      </div>

      {/* Nav principal */}
      <nav className={cn('flex-1 py-4 space-y-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', collapsed ? 'px-1' : 'px-3')}>
        {navItemsTop.map(({ href, label, icon: Icon, mobileHidden }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          const isLeads = href === '/leads'
          return (
            <div key={href} className={cn('relative', mobileHidden && 'hidden lg:block')}>
              <Link href={href} onClick={onNavigate} className={linkCls(active)} title={collapsed ? label : undefined}>
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && label}
              </Link>
              {isLeads && leadsBadge > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-[16px] rounded-full bg-fonti-accent text-fonti-primary text-[9px] font-bold flex items-center justify-center px-0.5 pointer-events-none">
                  {leadsBadge > 99 ? '99+' : leadsBadge}
                </span>
              )}
            </div>
          )
        })}

        {/* ── Negócios ── */}
        {(() => {
          const active = pathname === '/negocios' || pathname.startsWith('/negocios/') || pathname.startsWith('/processos')
          return (
            <Link href="/negocios" onClick={onNavigate} className={linkCls(active)} title={collapsed ? 'Negócios' : undefined}>
              <Briefcase className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && 'Negócios'}
            </Link>
          )
        })()}

        {navItemsBottom.map(({ href, label, icon: Icon, mobileHidden }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          const isAgenda = href === '/agenda'
          const isOperacional = href === '/operacional'
          const isConversas = href === '/conversas'
          return (
            <div key={href} className={cn('relative', mobileHidden && 'hidden lg:block')}>
              <Link href={href} onClick={onNavigate} className={linkCls(active)} title={collapsed ? label : undefined}>
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && label}
              </Link>
              {isAgenda && agendaBadge > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-[16px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5 pointer-events-none">
                  {agendaBadge > 99 ? '99+' : agendaBadge}
                </span>
              )}
              {isOperacional && operacionalBadge > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-[16px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5 pointer-events-none">
                  {operacionalBadge > 99 ? '99+' : operacionalBadge}
                </span>
              )}
              {isConversas && conversasBadge > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-[16px] rounded-full bg-fonti-accent text-fonti-primary text-[9px] font-bold flex items-center justify-center px-0.5 pointer-events-none">
                  {conversasBadge > 99 ? '99+' : conversasBadge}
                </span>
              )}
            </div>
          )
        })}

        {/* ── Gestão (grupo colapsável) — apenas desktop ── */}
        <div className="my-2 border-t border-white/10 hidden lg:block" />
        <div className="hidden lg:block">
          {collapsed ? (
            <Link
              href="/gestao"
              onClick={onNavigate}
              className={linkCls(isGestaoAtivo)}
              title="Gestão"
            >
              <ShieldCheck className="h-[18px] w-[18px] shrink-0" />
            </Link>
          ) : (
            <>
              <button
                onClick={() => setGestaoAberto(v => !v)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors',
                  isGestaoAtivo
                    ? 'bg-fonti-accent/15 text-white'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                )}
              >
                <ShieldCheck className="h-[18px] w-[18px] shrink-0" />
                Gestão
                <ChevronDown className={cn('ml-auto h-3.5 w-3.5 transition-transform duration-200', gestaoAberto && 'rotate-180')} />
              </button>
              {gestaoAberto && (
                <div className="ml-4 mt-0.5 border-l border-white/10 pl-2 space-y-0.5">
                  {isGestor && (
                    <Link href="/gestao" onClick={onNavigate} className={linkCls(pathname === '/gestao' || pathname.startsWith('/gestao/'))}>
                      <ShieldCheck className="h-[18px] w-[18px] shrink-0" />
                      Painel
                    </Link>
                  )}
                  <Link href="/rh" onClick={onNavigate} className={linkCls(pathname === '/rh' || pathname.startsWith('/rh/'))}>
                    <UserCheck className="h-[18px] w-[18px] shrink-0" />
                    RH
                  </Link>
                  <Link href="/financeiro" onClick={onNavigate} className={linkCls(pathname === '/financeiro' || pathname.startsWith('/financeiro/'))}>
                    <DollarSign className="h-[18px] w-[18px] shrink-0" />
                    Financeiro
                  </Link>
                  {isAdmin && (
                    <Link href="/configuracoes" onClick={onNavigate} className={linkCls(pathname === '/configuracoes' || pathname.startsWith('/configuracoes/'))}>
                      <Settings className="h-[18px] w-[18px] shrink-0" />
                      Configurações
                    </Link>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className={cn('border-t border-white/10 pt-3 pb-4 space-y-1', collapsed ? 'px-1' : 'px-3')}>
        {/* Botão recolher/expandir — apenas desktop */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className={cn(
              'hidden lg:flex w-full items-center rounded-lg text-sm text-white/50 hover:bg-white/10 hover:text-white transition-colors py-2',
              collapsed ? 'justify-center px-0' : 'gap-3 px-3'
            )}
          >
            {collapsed
              ? <PanelLeftOpen className="h-4 w-4" />
              : <><PanelLeftClose className="h-4 w-4" /><span>Recolher menu</span></>
            }
          </button>
        )}

        {/* Usuário */}
        {usuario && !collapsed && (
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-fonti-accent/30 flex items-center justify-center shrink-0">
              <span className="text-fonti-accent text-xs font-bold uppercase">{usuario.nome.charAt(0)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white truncate">{usuario.nome}</p>
              <p className="text-xs text-white/40 truncate capitalize">{usuario.perfil}</p>
            </div>
          </div>
        )}
        {usuario && collapsed && (
          <div className="flex justify-center py-2" title={usuario.nome}>
            <div className="w-8 h-8 rounded-full bg-fonti-accent/30 flex items-center justify-center shrink-0">
              <span className="text-fonti-accent text-xs font-bold uppercase">{usuario.nome.charAt(0)}</span>
            </div>
          </div>
        )}

        <button
          onClick={sair}
          title={collapsed ? 'Sair' : undefined}
          className={cn(
            'w-full flex items-center rounded-lg text-sm text-white/60 hover:bg-white/10 hover:text-white transition-colors py-2.5',
            collapsed ? 'justify-center px-0' : 'gap-3 px-3'
          )}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && 'Sair'}
        </button>
      </div>
    </aside>
  )
}
