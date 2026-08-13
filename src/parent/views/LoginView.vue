<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  clearLiffTokenRefreshMarker,
  forceLiffReloginOnce,
  initLiff,
  liff,
} from '../services/liff'
import { liffLogin, deviceSetup } from '../api/auth'
import {
  CONSENT_SCOPE_SERVICE_ESSENTIAL,
  getCurrentPolicy,
  getMyConsents,
  type PolicyVersionOut,
} from '../api/consent'
import { useParentAuthStore } from '../stores/parentAuth'
import { useFriendlyError } from '@/composables/useFriendlyError'
import type { FriendlyError } from '@/utils/errorCodeRegistry'
import BrandMark from '@/components/brand/BrandMark.vue'
import ConsentModal from '../components/ConsentModal.vue'
import { resolveSafeRedirect } from '../utils/safeRedirect'
import { useTenantBranding } from '@/composables/useTenantBranding'

const { branding } = useTenantBranding()

const route = useRoute()
const router = useRouter()
const authStore = useParentAuthStore()
const { getFriendly } = useFriendlyError()

// 深連結保存：guard 導來 /login 時會帶 ?redirect=<原本要去的頁>；redirect
// 來自 URL query（使用者可控），一律經 resolveSafeRedirect 驗證只能是站內
// 相對路徑，否則 fallback /home（防 open redirect，見 utils/safeRedirect.ts）。
function redirectAfterAuth() {
  router.replace(resolveSafeRedirect(route.query.redirect))
}

// choice：外部瀏覽器（或 /device-login 入口）不自動跳轉，讓家長自選登入方式
// （2026-08-13 A+D 裁定：修「設定碼入口被 LIFF 自動跳轉蓋掉、實際不可達」）。
const status = ref<'init' | 'loading' | 'consent' | 'error' | 'choice'>('init')
const pendingPolicy = ref<PolicyVersionOut | null>(null)
// friendly error 狀態：含 message + nextStep（命中 LINE_BINDING_* / LINE_PROFILE_FETCH_FAILED）
const errorState = ref<FriendlyError | null>(null)

// D 案：/device-login（meta.deviceOnly）＝園所設定碼單/QR 的印刷入口，
// 完全不觸發 LIFF；設定碼表單直接展開，附「改用 LINE 登入」連結。
const isDeviceOnly = computed(() => route.meta.deviceOnly === true)

function _setLocalError(message: string, nextStep?: string) {
  errorState.value = { message, nextStep, level: 'error' }
}

// 登入成功後的共用收尾：LIFF 登入與設定碼登入的後端回應 shape 完全一致
// （{status:'ok', user:{user_id,name,role}}），刻意共用同一條路徑，不要
// 分岔——否則兩條登入方式的 consent gate / 深連結行為會慢慢長歪。
async function completeLogin(user: unknown) {
  authStore.setUser(user)
  const needsConsent = await checkConsentRequired()
  if (needsConsent) {
    status.value = 'consent'
    return
  }
  redirectAfterAuth()
}

function isIdTokenExpiredError(err: unknown) {
  const e = err as Record<string, unknown> | null | undefined
  const resp = e?.response as Record<string, unknown> | undefined
  const detail = (resp?.data as Record<string, unknown>)?.detail || ''
  return resp?.status === 401 && /id_token|LINE/i.test(String(detail))
}

async function startLogin({ forceFresh = false } = {}) {
  status.value = 'init'
  errorState.value = null
  try {
    await initLiff()
  } catch (err: unknown) {
    status.value = 'error'
    _setLocalError(
      // 文案不再指向工程 env：LIFF ID 已改由園所的 LINE 設定提供（多租戶 4d/fb）。
      (err instanceof Error ? err.message : String(err)) || 'LINE 登入初始化失敗，請聯絡園所確認 LINE 設定',
      '請重新開啟 LIFF 頁面；持續發生請聯絡園所',
    )
    return
  }

  if (forceFresh) {
    clearLiffTokenRefreshMarker()
    forceLiffReloginOnce({ redirectUri: window.location.href, nowMs: Date.now() })
    return
  }

  if (!liff.isLoggedIn()) {
    // A 案分流：只有在 LINE App 內（LIFF in-client）才自動觸發 OAuth——
    // 外部瀏覽器整頁跳轉會把「使用設定碼登入」入口蓋掉，無 LINE 家長
    // 永遠到不了設定碼表單。外部瀏覽器改停在 choice 讓家長自選。
    if (liff.isInClient()) {
      // 觸發 LINE OAuth；登入完成後 LIFF 會帶回此頁，重新進入此函式
      liff.login({ redirectUri: window.location.href })
    } else {
      status.value = 'choice'
    }
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
      // P0c-3: 強制 consent 關卡 — 未對 current policy 簽 service_essential 即攔下
      await completeLogin(data.user)
    } else if (data?.status === 'need_binding') {
      clearLiffTokenRefreshMarker()
      // 把 redirect 一併轉給 /bind，讓「深連結 → 過期 → 登入 → 發現未綁定 →
      // 綁定成功」這條完整鏈路最終仍能回到原本要去的頁（見 BindView.vue）。
      const bindQuery: Record<string, string> = { name_hint: data.name_hint || '' }
      if (typeof route.query.redirect === 'string') bindQuery.redirect = route.query.redirect
      router.replace({ path: '/bind', query: bindQuery })
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
    status.value = 'error'
    // useFriendlyError 處理 LINE_BINDING_EXPIRED / LINE_BINDING_NOT_FOUND /
    // LINE_PROFILE_FETCH_FAILED 等 envelope code；未知 code fallback displayMessage
    errorState.value = getFriendly(err)
  }
}

function manualRetry() {
  // 使用者主動點重試：清掉 marker 後強制走完整 OAuth，確保拿新 id_token
  startLogin({ forceFresh: true })
}

// choice 狀態下使用者主動選 LINE 登入（外部瀏覽器；此時 initLiff 必已成功）
function startLineLogin() {
  liff.login({ redirectUri: window.location.href })
}

// /device-login 的「改用 LINE 登入」：導回 /login 並保留 redirect 等 query
// （/device-login 不 init LIFF，不能直接 liff.login）。
function goLineLoginEntry() {
  router.replace({ path: '/login', query: route.query })
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
  redirectAfterAuth()
}

// ── 設定碼登入（無 LINE / 換新裝置的家長）──────────────────────────────
// /device-login 入口直接展開表單（該頁的主要用途就是設定碼）。
const showDeviceSetup = ref(isDeviceOnly.value)
const deviceCode = ref('')
const deviceSetupSubmitting = ref(false)
const deviceSetupError = ref('')

async function submitDeviceSetup() {
  const code = deviceCode.value.trim()
  if (!code) {
    deviceSetupError.value = '請輸入設定碼'
    return
  }
  deviceSetupSubmitting.value = true
  deviceSetupError.value = ''
  try {
    const { data } = await deviceSetup(code)
    if (data?.status !== 'ok') throw new Error('伺服器回應未預期狀態')
    await completeLogin(data.user)
  } catch (err: unknown) {
    const e = err as { response?: { status?: number } }
    if (e?.response?.status === 429) {
      deviceSetupError.value = '嘗試次數過多，請稍後再試'
    } else {
      // 後端對「碼不存在／已過期／已使用」一律回同一個 BusinessError code
      // 避免碼枚舉；前端也不採用後端實際訊息字串，固定顯示這句，避免後端
      // 訊息未來變得更具體時前端不小心變成枚舉 oracle。
      deviceSetupError.value = '設定碼無效或已過期，請聯絡園所'
    }
  } finally {
    deviceSetupSubmitting.value = false
  }
}

onMounted(() => {
  if (isDeviceOnly.value) {
    // D 案：印刷入口完全不觸發 LIFF（無自動跳轉、無 LIFF 錯誤干擾）。
    status.value = 'choice'
    return
  }
  startLogin()
})
</script>

<template>
  <div class="login-view">
    <BrandMark variant="full" :size="120" class="welcome-mark" />
    <div class="login-card">
      <p class="welcome-eyebrow">歡迎回到</p>
      <h1 class="title">{{ branding.titles.parent_short }}</h1>

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
      <!-- A 案：外部瀏覽器不自動跳轉，家長自選登入方式（/device-login 只顯示
           設定碼區塊，LINE 入口在下方連結）。 -->
      <template v-else-if="status === 'choice'">
        <p class="hint" role="status" aria-live="polite">
          {{ isDeviceOnly ? '請輸入園所提供的設定碼' : '請選擇登入方式' }}
        </p>
        <button
          v-if="!isDeviceOnly"
          type="button"
          class="pt-action-btn line-login"
          data-testid="line-login-btn"
          @click="startLineLogin"
        >
          使用 LINE 登入
        </button>
      </template>
      <template v-else-if="status === 'error' && errorState">
        <div
          class="error"
          role="alert"
          aria-live="assertive"
          data-testid="login-error"
        >
          <p class="error-message">{{ errorState.message }}</p>
          <p
            v-if="errorState.nextStep"
            class="error-next-step"
            data-testid="login-error-next-step"
          >
            💡 {{ errorState.nextStep }}
          </p>
        </div>
        <button type="button" class="pt-action-btn retry" @click="manualRetry">
          <span class="material-symbols-rounded" aria-hidden="true">refresh</span>
          重試登入
        </button>
      </template>
    </div>

    <!-- 次要入口：無 LINE 或換新裝置的家長，用園所簽發的設定碼直接登入。
         跟主要 LIFF 流程共用 completeLogin（consent gate + 深連結導回），
         見 script 內註解。 -->
    <div v-if="status !== 'consent'" class="device-setup-block">
      <button
        v-if="!isDeviceOnly"
        type="button"
        class="device-setup-toggle"
        data-testid="device-setup-toggle"
        @click="showDeviceSetup = !showDeviceSetup"
      >
        沒有 LINE？使用園所提供的設定碼登入
      </button>

      <div v-if="showDeviceSetup" class="device-setup-form">
        <p class="device-setup-hint">
          設定碼由園所行政人員簽發，跟「LINE 綁定碼」不同——綁定碼是給已有 LINE
          的家長綁定小孩用的，設定碼是給沒有 LINE 或換新手機的家長直接登入用的。
        </p>
        <label for="device-setup-code" class="sr-only">設定碼</label>
        <input
          id="device-setup-code"
          v-model="deviceCode"
          type="text"
          data-testid="device-setup-input"
          inputmode="text"
          autocapitalize="characters"
          autocorrect="off"
          autocomplete="one-time-code"
          placeholder="例：ABCD1234EFGH"
          maxlength="20"
          @keydown.enter="submitDeviceSetup"
        />
        <button
          type="button"
          class="pt-action-btn device-setup-submit"
          data-testid="device-setup-submit"
          :disabled="deviceSetupSubmitting"
          @click="submitDeviceSetup"
        >
          {{ deviceSetupSubmitting ? '登入中…' : '使用設定碼登入' }}
        </button>
        <p
          v-if="deviceSetupError"
          class="device-setup-error"
          data-testid="device-setup-error"
          role="alert"
        >
          {{ deviceSetupError }}
        </p>
      </div>

      <!-- D 案印刷入口的返程：導回 /login（保留 redirect query）再走 LIFF -->
      <button
        v-if="isDeviceOnly"
        type="button"
        class="device-setup-toggle"
        data-testid="device-login-to-line"
        @click="goLineLoginEntry"
      >
        有 LINE？改用 LINE 登入
      </button>
    </div>

    <p class="legal">本服務由{{ branding.org_name }}提供</p>

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
.error .error-message {
  margin: 0;
  font-weight: 500;
}
.error .error-next-step {
  margin: 6px 0 0;
  padding-top: 6px;
  border-top: 1px dashed var(--coral-300, #ffb5ad);
  color: var(--pt-text-body, #5a4a4a);
  font-weight: 400;
  font-size: 13px;
  line-height: 1.5;
}

.retry {
  margin-top: 8px;
  width: 100%;
  min-height: 48px;
}

.line-login {
  margin-top: 8px;
  width: 100%;
  min-height: 48px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.device-setup-block {
  width: 100%;
  max-width: 360px;
  margin-top: 16px;
}

.device-setup-toggle {
  display: block;
  width: 100%;
  min-height: 44px;
  padding: 8px 12px;
  background: none;
  border: none;
  color: var(--pt-text-muted);
  font-size: 13px;
  text-decoration: underline;
  cursor: pointer;
}
.device-setup-toggle:focus-visible {
  outline: 2px solid var(--brand-primary, #0d9053);
  outline-offset: 2px;
  border-radius: 8px;
}

.device-setup-form {
  background: rgba(255, 255, 255, 0.85);
  border-radius: 18px;
  padding: 16px;
  border: 1px solid rgba(13, 144, 83, 0.12);
}

.device-setup-hint {
  margin: 0 0 12px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--pt-text-muted);
  text-align: left;
}

.device-setup-form input {
  width: 100%;
  min-height: 48px;
  padding: 10px 12px;
  font-size: 18px;
  letter-spacing: 4px;
  text-align: center;
  border: 2px solid var(--pt-border-light, #ecf5f9);
  border-radius: 12px;
  font-family: ui-monospace, 'SF Mono', 'Menlo', monospace;
  text-transform: uppercase;
  background: var(--cream, #fffcf2);
  font-weight: 700;
  color: var(--pt-text-strong);
  box-sizing: border-box;
  margin-bottom: 10px;
}
.device-setup-form input:focus-visible {
  outline: none;
  border-color: var(--brand-primary, #0d9053);
  background: var(--pt-surface-card, #fff);
}

.device-setup-submit {
  width: 100%;
  min-height: 44px;
}

.device-setup-error {
  margin: 10px 0 0;
  padding: 10px 12px;
  background: var(--coral-100, #ffe3e0);
  color: var(--coral-700, #b14545);
  border-radius: 10px;
  font-size: 13px;
  text-align: left;
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
