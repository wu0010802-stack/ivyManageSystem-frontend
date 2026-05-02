import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { initSyncBridge } from './stores/syncBridge'

import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-message.css'
import './assets/design-tokens.css'
import './assets/main.css'
import './assets/a11y.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

initSyncBridge()

app.mount('#app')
