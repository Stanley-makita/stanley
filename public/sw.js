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

// Fase 3 — recebe o push e mostra a notificação do sistema operacional.
// Payload vem de enviarPush.ts: { titulo, corpo, url }. Nunca conteúdo
// sensível (CPF, renda, valor, texto integral da mensagem) — ver
// src/lib/push/enviarPush.ts / notificationService.ts.
self.addEventListener('push', (event) => {
  let dados = { titulo: 'Fonti', corpo: 'Você tem uma nova notificação.', url: '/' }
  try {
    if (event.data) dados = { ...dados, ...event.data.json() }
  } catch {
    // payload não era JSON válido — usa os valores padrão acima
  }

  event.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.corpo,
      icon: '/favicon-512.png',
      badge: '/favicon-512.png',
      data: { url: dados.url || '/' },
    }),
  )
})

// Ao tocar na notificação: foca uma aba do Fonti já aberta nessa URL, ou
// abre uma nova. Sempre fecha a notificação antes.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existente = clientsList.find((c) => new URL(c.url).origin === self.location.origin)
      if (existente) {
        await existente.focus()
        existente.navigate(url)
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
