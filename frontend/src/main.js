import { createApp } from 'vue'
import { createHead } from '@unhead/vue/client'

import App from './App.vue'
import router from './router'
import i18n from './i18n'

const LEGACY_FRONTEND_HOSTS = new Set([
  'temp-email.leeseven.online',
  'cloudflare-temp-email-web-1cd.pages.dev',
])

if (typeof window !== 'undefined' && LEGACY_FRONTEND_HOSTS.has(window.location.hostname)) {
  const target = new URL(window.location.href)
  target.protocol = 'https:'
  target.host = 'mail.leeseven.com'
  window.location.replace(target.toString())
}

const head = createHead()
const app = createApp(App)
app.use(i18n)
app.use(router)
app.use(head)
app.mount('#app')
