import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

// 共用設計 tokens（字級 / 間距 / 圓角 / 陰影 / 動效 / semantic colors）。
// 各角色 app 共用同一份基礎尺度，避免「四個產品」的視覺語言分裂。
// 角色 accent 由 parent app 在自己 root style 覆寫 --brand-*。
import '@/assets/design-tokens.css'

import { useParentAuthStore } from './stores/parentAuth'
import { getMe } from './api/profile'

const app = createApp(App)
app.use(createPinia())
app.use(router)

// 全域 navigation guard：未登入使用者只能進公開頁（login / bind）
//
// sessionStorage 內的 user 不是 source of truth：cookie 有效但 sessionStorage 被清空
// （新分頁、隱私視窗、瀏覽器重啟）時會誤判未登入。
// 因此首次進非公開頁時先 probe `/parent/me` 一次，成功則 hydrate store；失敗（401）由
// axios interceptor 處理重導，guard 直接放行讓 interceptor 接手即可。
let bootProbe = null
async function ensureSessionProbed(authStore) {
  if (authStore.isAuthed()) return
  if (!bootProbe) {
    bootProbe = getMe()
      .then((res) => {
        const user = res?.data
        if (user) authStore.setUser(user)
      })
      .catch(() => {
        // 401 → interceptor 已導向 /login；其他錯誤就讓後續 guard 邏輯把人送到 /login
      })
  }
  await bootProbe
}

router.beforeEach(async (to) => {
  const authStore = useParentAuthStore()
  const isPublic = to.meta?.public === true

  if (!isPublic) {
    await ensureSessionProbed(authStore)
    if (!authStore.isAuthed()) {
      return { path: '/login', replace: true }
    }
  }
  return true
})

app.mount('#app')
