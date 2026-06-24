import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import ConfirmationService from 'primevue/confirmationservice'
import ToastService from 'primevue/toastservice'
import Tooltip from 'primevue/tooltip'
import Ripple from 'primevue/ripple'

import App from './App.vue'
import router from './router/router'
import { useVersionStore } from '@/stores/version'

// Styles
import 'primeicons/primeicons.css'
import './assets/fonts.css'
import './assets/tailwind.css'

const app = createApp(App)

// Pinia (State Management)
const pinia = createPinia()
app.use(pinia)

// Router
app.use(router)

// PrimeVue with customized Aura theme
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      prefix: 'p',
      darkModeSelector: '.dark'
    }
  },
  ripple: true
})

// PrimeVue Services
app.use(ConfirmationService)
app.use(ToastService)

// Directives
app.directive('tooltip', Tooltip)
app.directive('ripple', Ripple)

// Fire-and-forget — fetch backend version before mount without delaying render.
// The store updates reactively once the response arrives.
useVersionStore().fetchBackend()

app.mount('#app')
