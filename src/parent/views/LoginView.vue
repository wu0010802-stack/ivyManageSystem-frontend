<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  clearLiffTokenRefreshMarker,
  forceLiffReloginOnce,
  initLiff,
  liff,
} from '../services/liff'
import { liffLogin } from '../api/auth'
import {
  CONSENT_SCOPE_SERVICE_ESSENTIAL,
  getCurrentPolicy,
  getMyConsents,
  type PolicyVersionOut,
} from '../api/consent'
import { useParentAuthStore } from '../stores/parentAuth'
import BrandMark from '@/components/brand/BrandMark.vue'
import ConsentModal from '../components/ConsentModal.vue'

const router = useRouter()
const authStore = useParentAuthStore()

const status = ref<'init' | 'loading' | 'consent' | 'error'>('init')
const errorMessage = ref('')
const pendingPolicy = ref<PolicyVersionOut | null>(null)

function isIdTokenExpiredError(err: unknown) {
  const e = err as Record<string, unknown> | null | undefined
  const resp = e?.response as Record<string, unknown> | undefined
  const detail = (resp?.data as Record<string, unknown>)?.detail || ''
  return resp?.status === 401 && /id_token|LINE/i.test(String(detail))
}

async function startLogin({ forceFresh = false } = {}) {
  status.value = 'init'
  errorMessage.value = ''
  try {
    await initLiff()
  } catch (err: unknown) {
    status.value = 'error'
    errorMessage.value =
      (err instanceof Error ? err.message : String(err)) || 'LIFF 初始化失敗，請確認 VITE_LIFF_ID 設定'
    return
  }

  if (forceFresh) {
    clearLiffTokenRefreshMarker()
    forceLiffReloginOnce({ redirectUri: window.location.href, nowMs: Date.now() })
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
      clearLiffTokenRefreshMarker()
      authStore.setUser(data.user)
      // P0c-3: 強制 consent 關卡 — 未對 current policy 簽 service_essential 即攔下
      const needsConsent = await checkConsentRequired()
      if (needsConsent) {
        status.value = 'consent'
        return
      }
      router.replace('/home')
    } else if (data?.status === 'need_binding') {
      clearLiffTokenRefreshMarker()
      router.replace({
        path: '/bind',
        query: { name_hint: data.name_hint || '' },
      })
    } else {
      throw new Error('伺服器回應未預期狀態')
    }
  } catch (err: unknown) {
    // id_token 過期 → 自動嘗試一次完整 OAuth 重認證
    // helper 內 sessionStorage marker 確保同 callback window 內只重 login 一次
    if (
      isIdTokenExpiredError(err) &&
      forceLiffReloginOnce({ redirectUri: window.location.href, nowMs: Date.now() })
    ) {
      return
    }
    const e = err as Record<string, unknown>
    status.value = 'error'
    errorMessage.value =
      String(e?.displayMessage || e?.message || '登入失敗，請稍後再試')
  }
}

function manualRetry() {
  // 使用者主動點重試：清掉 marker 後強制走完整 OAuth，確保拿新 id_token
  startLogin({ forceFresh: true })
}

async function checkConsentRequired(): Promise<boolean> {
  /**
   * 判斷是否需顯示 consent modal。
   * - true：首次登入或 policy 升版未重簽
   * - false：service_essential 已對 current policy 簽過
   *
   * 容錯：fetch 失敗時 fail-open（不攔截）避免 backend 暫停服務時鎖死家長。
   * Risk-accepted：未實作 consent 時 backend 故障可能短暫繞過告知，但
   * 法律風險 << UX 鎖死風險。後續可改 fail-closed by setting.
   */
  try {
    const [{ data: policy }, { data: consents }] = await Promise.all([
      getCurrentPolicy(),
      getMyConsents(),
    ])
    pendingPolicy.value = policy
    const essential = consents.current_status.find(
      s => s.scope === CONSENT_SCOPE_SERVICE_ESSENTIAL,
    )
    if (!essential || essential.consented !== true) return true
    if (essential.policy_version_id !== policy.id) return true
    return false
  } catch (err) {
    console.warn('[consent] check failed, fail-open:', err)
    return false
  }
}

function onConsented() {
  status.value = 'loading'
  router.replace('/home')
}

onMounted(() => startLogin())
</script>

<template>
  <div class="login-view">
    <BrandMark variant="full" :size="120" class="welcome-mark" />
    <div class="login-card">
      <p class="welcome-eyebrow">歡迎回到</p>
      <h1 class="title">常春藤家長</h1>

      <div v-if="status === 'init' || status === 'loading'" class="loader">
        <span class="loader-dot" />
        <span class="loader-dot" />
        <span class="loader-dot" />
      </div>

      <p
        v-if="status === 'init'"
        class="hint"
        role="status"
        aria-live="polite"
      >
        正在開啟 LINE 登入…
      </p>
      <p
        v-else-if="status === 'loading'"
        class="hint"
        role="status"
        aria-live="polite"
      >
        驗證您的身分…
      </p>
      <template v-else-if="status === 'error'">
        <p class="error" role="alert" aria-live="assertive">
          {{ errorMessage }}
        </p>
        <button type="button" class="pt-action-btn retry" @click="manualRetry">
          <span class="material-symbols-rounded" aria-hidden="true">refresh</span>
          重試登入
        </button>
      </template>
    </div>

    <p class="legal">本服務由常春藤幼兒園提供</p>

    <ConsentModal
      v-if="status === 'consent' && pendingPolicy"
      :policy="pendingPolicy"
      @consented="onConsented"
    />
  </div>
</template>

<style scoped>
.login-view {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(ellipse at 50% 20%, rgba(13, 144, 83, 0.06), transparent 60%),
    linear-gradient(180deg, var(--cream, #fffcf2) 0%, var(--leaf-100, #dcf4e6) 100%);
}

.welcome-mark {
  margin: 24px auto 24px;
  display: block;
}

.login-card {
  background: rgba(255, 255, 255, 0.85);
  border-radius: 24px;
  padding: 32px 28px;
  width: 100%;
  max-width: 360px;
  text-align: center;
  border: 1px solid rgba(13, 144, 83, 0.12);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.9) inset,
    0 8px 24px rgba(13, 144, 83, 0.08),
    0 24px 56px rgba(13, 144, 83, 0.10);
}

.welcome-eyebrow {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--pt-text-muted);
  text-transform: uppercase;
}

.title {
  margin: 4px 0 20px;
  font-size: 26px;
  font-weight: 800;
  color: var(--brand-primary, #0d9053);
  letter-spacing: -0.01em;
}

.loader {
  display: inline-flex;
  gap: 6px;
  margin: 12px 0;
}
.loader-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--brand-primary, #0d9053);
  animation: loader-bounce 1.2s ease-in-out infinite;
}
.loader-dot:nth-child(2) { animation-delay: 0.15s; }
.loader-dot:nth-child(3) { animation-delay: 0.30s; }

@keyframes loader-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

.hint {
  color: var(--pt-text-muted);
  font-size: 14px;
  margin: 4px 0 0;
}

.error {
  color: var(--coral-700, #b14545);
  font-size: 14px;
  margin: 8px 0 16px;
  word-break: break-word;
  background: var(--coral-100, #ffe3e0);
  padding: 12px 14px;
  border-radius: 12px;
  text-align: left;
}

.retry {
  margin-top: 8px;
  width: 100%;
  min-height: 48px;
}

.legal {
  margin: 24px 0 0;
  font-size: 11px;
  color: var(--pt-text-faint);
  letter-spacing: 0.02em;
}

@media (prefers-reduced-motion: reduce) {
  .loader-dot { animation: none; opacity: 0.6; }
}
</style>
