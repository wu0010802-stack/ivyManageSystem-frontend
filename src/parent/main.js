import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

import { useParentAuthStore } from './stores/parentAuth'

const app = createApp(App)
app.use(createPinia())
app.use(router)

// 全域 navigation guard：未登入使用者只能進公開頁（login / bind）
router.beforeEach((to) => {
  const authStore = useParentAuthStore()
  const isPublic = to.meta?.public === true
  if (!isPublic && !authStore.isAuthed()) {
    return { path: '/login', replace: true }
  }
  return true
})

app.mount('#app')
