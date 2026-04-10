import { createApp } from 'vue'
import { createAuth0 } from '@auth0/auth0-vue'
import App from './App.vue'
import './style.css'

createApp(App)
  .use(
    createAuth0({
      domain: import.meta.env.VITE_AUTH0_DOMAIN,
      clientId: import.meta.env.VITE_AUTH0_CLIENT_ID,
      authorizationParams: {
        redirect_uri: window.location.origin,
        scope: 'openid profile email',
      },
      cacheLocation: 'localstorage',
    }),
  )
  .mount('#app')
