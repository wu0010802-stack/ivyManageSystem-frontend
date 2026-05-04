<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import ParentLayout from './layouts/ParentLayout.vue'

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

function pathDepth(p) {
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
</script>

<template>
  <ParentLayout>
    <router-view v-slot="{ Component, route }">
      <transition :name="transitionName" mode="out-in">
        <component :is="Component" :key="route.fullPath" />
      </transition>
    </router-view>
  </ParentLayout>
</template>

<style>
/* 家長 app brand 與全域樣式由 src/parent/styles/globals.css 提供。
   這裡只放 webview 必要的 reset。 */
html, body, #app {
  margin: 0;
  padding: 0;
  height: 100%;
}

/* Sunny Skyline 底色：sky 漸層 + 右下 sun radial。
   寫在 body 而非 #app，避免 PullToRefresh 容器把背景遮住；
   #app 自身保持透明承接此漸層。 */
body {
  background:
    radial-gradient(ellipse 800px 500px at 100% 100%, var(--sun-100, #FFF4C9) 0%, transparent 70%),
    radial-gradient(ellipse 1200px 600px at 50% -200px, var(--sky-200, #BBDDED) 0%, transparent 60%),
    var(--pt-surface-app, #F2F9FC);
  background-attachment: fixed;
  /* 阻擋 Android Chrome 原生下拉刷新 — 已交給 PullToRefresh 元件處理。
     設在實際捲動容器（body）才生效，設在 .ptr-root 上是無效的。 */
  overscroll-behavior-y: contain;
}

#app {
  background: transparent;
  /* Sunny Skyline 字體 stack：Quicksand body + Outfit display + Noto Sans TC 中文
     由 globals.css 注入 token，這裡只是 fallback 寫法 */
  font-family: var(--pt-font-body, 'Quicksand', 'Noto Sans TC', -apple-system, BlinkMacSystemFont, 'PingFang TC', 'Helvetica Neue', sans-serif);
  font-weight: 500;
  -webkit-font-smoothing: antialiased;
  color: var(--pt-text-strong, #1B4459);
}

* {
  box-sizing: border-box;
}

/* 標題層級統一改用 Outfit display 字體（中文 fallback Noto Sans TC）。
   跨整個家長 app；元件內 scoped 若有 override 仍會覆蓋。 */
h1, h2, h3, h4, h5, h6 {
  font-family: var(--pt-font-display, 'Outfit', 'Noto Sans TC', sans-serif);
  font-weight: 700;
  letter-spacing: -0.01em;
}

/* ============================================================
 * 路由過場動畫
 * 三種：fade（tab 切換）、slide-forward（深入）、slide-back（返回）
 * 持續：mode="out-in"，leave 140ms / enter 160ms（總 ~300ms）。
 *   - leave 略短於 enter，符合「離開應比進入快」的 Material Motion 慣例
 *   - 仍夠短到 tab 切換不感到拖沓
 * 用 transform + opacity（GPU 加速）。
 * reduced-motion 由 globals.css 全域 transition-duration: 0.001ms 接管。
 * ============================================================ */

.parent-fade-enter-active,
.parent-slide-forward-enter-active,
.parent-slide-back-enter-active {
  transition: opacity 160ms ease-out, transform 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.parent-fade-leave-active,
.parent-slide-forward-leave-active,
.parent-slide-back-leave-active {
  transition: opacity 140ms ease-in, transform 140ms cubic-bezier(0.4, 0, 0.2, 1);
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
