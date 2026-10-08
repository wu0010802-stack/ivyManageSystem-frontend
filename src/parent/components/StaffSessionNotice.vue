<script setup lang="ts">
/**
 * 「你現在不是家長身分」全頁提示。
 *
 * 管理端與家長端同源、共用同一顆 httpOnly cookie `access_token`
 * （後端 utils/cookie.py `_COOKIE_PATH = "/api"`，get_current_user 只認這一顆），
 * 所以同一個瀏覽器誰最後登入誰就擁有兩邊的身分。先登管理端再開家長端時，
 * 家長端每支 API 都會被 require_parent_role() 擋成 403 —— 沒有這個提示的話，
 * 使用者看到的只是滿頁 api 錯誤，完全看不出問題出在身分。
 *
 * 兩條出路都保留：清掉員工 session（會一併登出管理端，講清楚再讓他按），
 * 或直接去家長登入頁重新登入（新的家長 token 會蓋掉那顆 cookie，管理端
 * 這時才反過來被登出）。
 */
import { ref, watch } from 'vue'
import { useStaffSessionGate } from '@/parent/composables/useStaffSessionGate'
import { fetchStaffSessionIdentity, logoutStaffSession } from '@/parent/api/auth'

const gate = useStaffSessionGate()
const identityName = ref<string | null>(null)
const identityRole = ref<string | null>(null)
const busy = ref(false)

const ROLE_LABELS: Record<string, string> = {
  admin: '管理員',
  principal: '園長',
  hr: '人資',
  supervisor: '主管',
  teacher: '教師',
  staff: '員工',
}

watch(gate.visible, async (val) => {
  if (!val) {
    identityName.value = null
    identityRole.value = null
    return
  }
  try {
    const { data } = await fetchStaffSessionIdentity()
    const me = (data ?? {}) as { name?: string | null; role?: string | null }
    identityName.value = me.name ?? null
    identityRole.value = me.role ?? null
  } catch {
    /* 只是附加資訊；取不到就顯示通用文案，不能因此讓提示消失 */
  }
})

function gotoLogin(): void {
  gate.reset()
  window.location.hash = '#/login'
}

async function doLogout(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    await logoutStaffSession()
  } catch {
    /* 後端登出失敗仍要放人走，別把使用者卡在遮罩裡 */
  }
  try {
    const { clearParentLocalState } = await import('@/parent/composables/useParentLogout')
    await clearParentLocalState()
  } catch {
    /* 本地清理失敗不阻斷導頁 */
  }
  busy.value = false
  gotoLogin()
}
</script>

<template>
  <div
    v-if="gate.visible.value"
    class="staff-session-notice"
    data-testid="staff-session-notice"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="staff-session-notice-title"
  >
    <div class="ssn-card">
      <span class="ssn-icon" aria-hidden="true">🔒</span>
      <h1 id="staff-session-notice-title">目前不是以家長身分登入</h1>

      <p class="ssn-body">
        這個瀏覽器現在的登入身分是<strong>{{
          identityRole ? (ROLE_LABELS[identityRole] ?? identityRole) : '園所員工'
        }}</strong><template v-if="identityName">（{{ identityName }}）</template>。
        家長端只接受家長帳號，所以頁面上的資料全部會被擋下來。
      </p>

      <p class="ssn-hint">
        管理端和家長端共用同一份登入狀態，同一個瀏覽器只能是其中一種身分。
        想同時開兩邊，請把其中一邊放到無痕視窗或另一個瀏覽器。
      </p>

      <div class="ssn-actions">
        <button
          type="button"
          class="ssn-btn ssn-btn-primary"
          data-testid="staff-session-logout"
          :disabled="busy"
          @click="doLogout"
        >
          登出目前身分並重新登入
          <small>會一併登出管理端</small>
        </button>
        <button
          type="button"
          class="ssn-btn ssn-btn-text"
          data-testid="staff-session-goto-login"
          @click="gotoLogin"
        >
          直接前往家長登入頁
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.staff-session-notice {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--m3-surface, #f7fbf3);
  color: var(--m3-on-surface, #181d18);
}

.ssn-card {
  width: 100%;
  max-width: 420px;
  display: grid;
  justify-items: center;
  gap: 12px;
  text-align: center;
}

.ssn-icon {
  font-size: 40px;
  line-height: 1;
}

.ssn-card h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.ssn-body {
  margin: 0;
  font-size: 15px;
  line-height: 1.6;
}

.ssn-hint {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--m3-on-surface-variant, #424940);
}

.ssn-actions {
  display: grid;
  gap: 8px;
  width: 100%;
  margin-top: 8px;
}

.ssn-btn {
  width: 100%;
  padding: 12px 16px;
  border: none;
  border-radius: 20px;
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.ssn-btn small {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  font-weight: 400;
  opacity: 0.85;
}

.ssn-btn-primary {
  background: var(--brand-primary, #0d9053);
  color: var(--m3-on-primary, #ffffff);
}

.ssn-btn-primary:disabled {
  opacity: 0.6;
  cursor: progress;
}

.ssn-btn-text {
  background: transparent;
  color: var(--brand-primary, #0d9053);
}
</style>
