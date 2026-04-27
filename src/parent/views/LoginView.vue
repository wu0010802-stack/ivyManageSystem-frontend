<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { initLiff, liff } from '../services/liff'
import { liffLogin } from '../api/auth'
import { useParentAuthStore } from '../stores/parentAuth'

const router = useRouter()
const authStore = useParentAuthStore()

const status = ref('init') // init / loading / error
const errorMessage = ref('')

async function startLogin() {
  status.value = 'init'
  errorMessage.value = ''
  try {
    await initLiff()
  } catch (err) {
    status.value = 'error'
    errorMessage.value =
      err?.message || 'LIFF 初始化失敗，請確認 VITE_LIFF_ID 設定'
    return
  }

  if (!liff.isLoggedIn()) {
    // 觸發 LINE OAuth；登入完成後 LIFF 會帶回此頁，重新進入此函式
    liff.login({ redirectUri: window.location.href })
    return
  }

  // 已登入：取 id_token 送後端 verify
  status.value = 'loading'
  try {
    const idToken = liff.getIDToken()
    if (!idToken) throw new Error('無法取得 LINE id_token')
    const { data } = await liffLogin(idToken)
    if (data?.status === 'ok') {
      authStore.setUser(data.user)
      router.replace('/home')
    } else if (data?.status === 'need_binding') {
      router.replace({
        path: '/bind',
        query: { name_hint: data.name_hint || '' },
      })
    } else {
      throw new Error('伺服器回應未預期狀態')
    }
  } catch (err) {
    status.value = 'error'
    errorMessage.value =
      err?.displayMessage || err?.message || '登入失敗，請稍後再試'
  }
}

function manualRetry() {
  startLogin()
}

onMounted(startLogin)
</script>

<template>
  <div class="login-view">
    <div class="login-card">
      <div class="logo">
        <img src="/pwa-192x192.png" alt="logo" />
      </div>
      <h1 class="title">常春藤家長</h1>
      <p v-if="status === 'init'" class="hint">正在開啟 LINE 登入...</p>
      <p v-else-if="status === 'loading'" class="hint">驗證您的身分...</p>
      <template v-else-if="status === 'error'">
        <p class="error">{{ errorMessage }}</p>
        <button class="retry" @click="manualRetry">重試登入</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.login-view {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: linear-gradient(135deg, #3f7d48 0%, #5fa46a 100%);
}

.login-card {
  background: #fff;
  border-radius: 16px;
  padding: 32px 24px;
  width: 100%;
  max-width: 360px;
  text-align: center;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.logo img {
  width: 72px;
  height: 72px;
  border-radius: 16px;
}

.title {
  margin: 16px 0 24px;
  font-size: 22px;
  color: #3f7d48;
}

.hint {
  color: #555;
  font-size: 14px;
}

.error {
  color: #c0392b;
  font-size: 14px;
  margin-bottom: 16px;
  word-break: break-word;
}

.retry {
  margin-top: 8px;
  padding: 10px 24px;
  background: #3f7d48;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  cursor: pointer;
}

.retry:active {
  background: #336440;
}
</style>
