import type { Metadata } from 'next'
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
