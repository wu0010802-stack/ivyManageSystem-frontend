<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ParentLayout from './layouts/ParentLayout.vue'
import ConsentModal from './components/ConsentModal.vue'
import ParentLogoutOverlay from './components/ParentLogoutOverlay.vue'
import StaffSessionNotice from './components/StaffSessionNotice.vue'
import ErrorBoundary from '@/components/common/ErrorBoundary.vue'
import { useConsentGate } from './composables/useConsentGate'
import { getCurrentPolicy, type PolicyVersionOut } from './api/consent'
import { reportClientEvent } from './utils/clientEvents'
import { sanitizeUrl } from '@/utils/sentry'

const gate = useConsentGate()
const consentPolicy = ref<PolicyVersionOut | null>(null)

// gate.visible 變 true 時取得當期 policy（供 ConsentModal prop 使用）
watch(gate.visible, async (val) => {
  if (val && consentPolicy.value === null) {
    try {
      const { data } = await getCurrentPolicy()
      consentPolicy.value = data
    } catch {
      // 取 policy 失敗時靜默；modal 因 policy 為 null 不會渲染
      // 避免 consent gate 本身因 policy 請求失敗而無限循環
    }
  }
  if (!val) {
    consentPolicy.value = null
  }
})

/**
 * 路由過場動畫方向判斷：
 *  - tab 切換（meta.tab 不同）：fade
 *  - 深層導航（路徑深度增加 + 同 tab）：slide-forward（左→右）
 *  - 返回（路徑深度減少 + 同 tab）：slide-back（右→左）
 *  - 同層（首頁切首頁、tab 切換已切走）：fade
 *
 * 為什麼不用 history.state.position？
 *  - Vue Router 4 在 push/replace 階段更新 position，beforeEach 拿到的舊值
 *    不一定可靠；用 path depth 作為純函式判斷更穩定，且符合家長端
 *    多為「root → detail」的階層導航結構。
 */
const router = useRouter()
const transitionName = ref('parent-fade')

function pathDepth(p: string | undefined | null): number {
  if (!p) return 0
  return p.split('/').filter(Boolean).length
}

router.beforeEach((to, from) => {
  // 首次進入：from.name 為 undefined，不做動畫
  if (!from.name) {
    transitionName.value = 'parent-none'
    return
  }
  // tab 切換 → fade
  if (to.meta?.tab !== from.meta?.tab) {
    transitionName.value = 'parent-fade'
    return
  }
  const dt = pathDepth(to.path) - pathDepth(from.path)
  if (dt > 0) transitionName.value = 'parent-slide-forward'
  else if (dt < 0) transitionName.value = 'parent-slide-back'
  else transitionName.value = 'parent-fade'
})

/**
 * ErrorBoundary 攔到子樹錯誤時的回報（SPEC-023 批次 3 Task 3）。
 * 只有家長端接這個事件——ErrorBoundary 是 admin/parent 共用元件，管理端不監聽
 * 此事件就完全無副作用，理由見 ErrorBoundary.vue 的 emit 註解。
 */
function onBoundaryError(payload: { error: unknown; variant: string }) {
  const err = payload.error
  reportClientEvent('error_boundary', {
    message: err instanceof Error ? err.message : String(err),
    // 過 sanitizeUrl 與 api/index.ts 的四個掛點一致：路徑裡的 id 要遮掉，
    // 別讓遙測欄位變成另一條 PII 出口。（2026-09-05 複審 F3）
    // sanitizeUrl 的參數型別是 unknown，回傳型別也跟著是 unknown；
    // 這裡傳進去的必定是字串，用 String() 收斂而不是 as 硬轉。
    route_name: String(sanitizeUrl(router.currentRoute.value.path)),
  })
}
</script>

<template>
  <ParentLayout>
    <!-- 全域錯誤邊界：單頁元件 render/computed throw 時降級成 fallback，
         而非白屏整個家長端 App（parent entry 無 app.config.errorHandler）。 -->
    <ErrorBoundary variant="parent" @error-captured="onBoundaryError">
      <router-view v-slot="{ Component, route }">
        <transition :name="transitionName" mode="out-in">
          <component :is="Component" :key="route.fullPath" />
        </transition>
      </router-view>
    </ErrorBoundary>
  </ParentLayout>

  <!-- P2-4 re-consent modal：interceptor 攔 403 X-Consent-Required 後顯示 -->
  <ConsentModal
    v-if="gate.visible.value && consentPolicy"
    :policy="consentPolicy"
    @consented="gate.resolve()"
  />

  <!-- 登出網路/LIFF 清理期間以不透明遮罩阻擋舊帳號 PII 與任何互動。 -->
  <ParentLogoutOverlay />

  <!-- 這個瀏覽器目前是員工身分（管理端／家長端同源共用 access_token）時，
       家長端每支 API 都會 403；用明確提示取代滿頁 api 錯誤。 -->
  <StaffSessionNotice />
</template>

<style>
/* 家長 app brand 與全域樣式由 src/parent/styles/globals.css 提供。
   這裡只放 webview 必要的 reset。 */
html, body, #app {
  margin: 0;
  padding: 0;
  height: 100%;
}

/* M3 底色：用 surface 純色（拿掉 sky → cream 漸層）。卡片自帶 surface-container tonal 階層提供層次。 */
body {
  background: var(--m3-surface, #f7fbf3);
  /* 阻擋 Android Chrome 原生下拉刷新 — 已交給 PullToRefresh 元件處理。
     設在實際捲動容器（body）才生效，設在 .ptr-root 上是無效的。 */
  overscroll-behavior-y: contain;
}

#app {
  background: transparent;
  /* M3 type scale：Roboto + Noto Sans TC（spec §3.2）。
     由 typography.css 注入 token，這裡只是 fallback 寫法 */
  font-family: var(--m3-font-body, 'Roboto', 'Noto Sans TC', -apple-system, BlinkMacSystemFont, 'PingFang TC', 'Helvetica Neue', sans-serif);
  font-weight: 400;
  -webkit-font-smoothing: antialiased;
  color: var(--m3-on-surface, #181d18);
}

* {
  box-sizing: border-box;
}

/* 標題層級用 M3 font-display (Roboto)。元件內 scoped 若用 m3-headline-* utility class 仍會覆蓋。 */
h1, h2, h3, h4, h5, h6 {
  font-family: var(--m3-font-display, 'Roboto', 'Noto Sans TC', sans-serif);
  font-weight: 400;
  letter-spacing: 0;
}

/* ============================================================
 * 路由過場動畫（M3 Material Motion）
 * 三種：fade（tab 切換）、slide-forward（深入）、slide-back（返回）
 * 持續：mode="out-in"，統一 300ms（medium-2）
 * Easing：M3 emphasized-decel cubic-bezier(0.05, 0.7, 0.1, 1)
 * 用 transform + opacity（GPU 加速）。
 * reduced-motion 由 globals.css 全域 transition-duration: 0.001ms 接管。
 * ============================================================ */

.parent-fade-enter-active,
.parent-slide-forward-enter-active,
.parent-slide-back-enter-active {
  transition: opacity var(--m3-dur-medium-2, 300ms) var(--m3-easing-emphasized-decel, cubic-bezier(0.05, 0.7, 0.1, 1)), transform var(--m3-dur-medium-2, 300ms) var(--m3-easing-emphasized-decel, cubic-bezier(0.05, 0.7, 0.1, 1));
}

.parent-fade-leave-active,
.parent-slide-forward-leave-active,
.parent-slide-back-leave-active {
  transition: opacity var(--m3-dur-medium-2, 300ms) var(--m3-easing-emphasized-decel, cubic-bezier(0.05, 0.7, 0.1, 1)), transform var(--m3-dur-medium-2, 300ms) var(--m3-easing-emphasized-decel, cubic-bezier(0.05, 0.7, 0.1, 1));
}

/* fade */
.parent-fade-enter-from,
.parent-fade-leave-to {
  opacity: 0;
}

/* forward：新頁面從右滑入，舊頁面向左淡出 */
.parent-slide-forward-enter-from {
  opacity: 0;
  transform: translateX(24px);
}
.parent-slide-forward-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}

/* back：新頁面從左滑入，舊頁面向右淡出 */
.parent-slide-back-enter-from {
  opacity: 0;
  transform: translateX(-24px);
}
.parent-slide-back-leave-to {
  opacity: 0;
  transform: translateX(12px);
}

/* parent-none：首次進入不做動畫 */
.parent-none-enter-active,
.parent-none-leave-active {
  transition: none;
}
</style>
