import type { MetadataRoute } from 'next'

// Web App Manifest (convenção de arquivo do Next 14.2 App Router) — servido
// automaticamente em /manifest.webmanifest. Só o necessário pra instalação
// como PWA (Fase 1 do plano de push): sem isso, "Adicionar à Tela de Início"
// no Android abre uma aba de navegador comum, não um app em display standalone,
// e o Service Worker de push não tem como ser considerado "instalado" no iOS.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Fonti',
    short_name: 'Fonti',
    description: 'Sistema de gestão Fonti',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#253B29',
    icons: [
      { src: '/favicon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/favicon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
