// Service Worker do Fonti — Fase 1 (PWA) + Fase 3 (push).
//
// IMPORTANTE: nunca adicionar um listener de 'fetch' aqui. O Next.js App
// Router depende de requisições sempre frescas (RSC payloads); um Service
// Worker cacheando respostas antigas quebraria a navegação normal do app.
// Este SW existe só pra permitir "Adicionar à Tela de Início" (Fase 1) e,
// depois, receber notificações push mesmo com o Fonti fechado (Fase 3) —
// nada de cache de assets, nada de uso offline.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Os listeners de 'push' e 'notificationclick' são adicionados na Fase 3
// (ver commit "fase 3"), quando o backend passa a de fato enviar push.
