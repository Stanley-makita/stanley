import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL('https://fonti.app.br'),
  title: 'Fonti',
  description: 'Sistema de gestão Fonti',
  openGraph: {
    url: 'https://fonti.app.br',
    siteName: 'Fonti',
    locale: 'pt_BR',
    type: 'website',
  },
  alternates: {
    canonical: '/',
  },
  // PWA: iOS só permite instalar/ativar push dentro do app adicionado à Tela
  // de Início — este bloco é o que faz o Safari oferecer "Adicionar à Tela
  // de Início" corretamente (o manifest.ts cuida do Android/desktop).
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Fonti',
  },
}

export const viewport: Viewport = {
  themeColor: '#253B29',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
