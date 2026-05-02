<script setup>
/**
 * 家長 App 共用 header（sticky）。
 *
 * 取代 ParentLayout 內嵌 header；可由 route.meta 控制：
 *   - route.meta.title  → 標題
 *   - route.meta.showBack → 顯示左側返回鍵（深層頁如 /messages/:id 應開啟）
 *
 * 也支援 props 覆寫（例如某頁要動態改標題）。
 *
 * 為什麼共用？
 *  - 深層頁（用藥詳情、聯絡簿詳情、訊息對話）目前無返回鍵，使用者只能靠系統手勢
 *  - 整合 safe-area-inset-top
 *  - 集中管理 brand 色與字級
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ParentIcon from './ParentIcon.vue'

const props = defineProps({
  /** 覆寫 route.meta.title */
  title: { type: String, default: null },
  /** 覆寫 route.meta.showBack */
  showBack: { type: Boolean, default: null },
  /** 自訂返回行為，預設走 router.back() */
  onBack: { type: Function, default: null },
})

const route = useRoute()
const router = useRouter()

const displayTitle = computed(
  () => props.title ?? route.meta?.title ?? '常春藤家長',
)

const displayShowBack = computed(() => {
  if (props.showBack !== null) return props.showBack
  return route.meta?.showBack === true
})

function goBack() {
  if (props.onBack) {
    props.onBack()
    return
  }
  // 若無 history 可退（直接打開深層連結進來），導回首頁
  if (window.history.length > 1) {
    router.back()
  } else {
    router.replace('/home')
  }
}
</script>

<template>
  <header class="app-header" role="banner">
    <button
      v-if="displayShowBack"
      type="button"
      class="back-btn touch-target"
      aria-label="返回上一頁"
      @click="goBack"
    >
      <ParentIcon name="back" size="md" />
    </button>
    <h1 class="header-title">{{ displayTitle }}</h1>
    <slot name="actions" />
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky, 10);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  background: var(--pt-gradient-brand, var(--brand-primary, #3f7d48));
  color: var(--neutral-0, #fff);
  padding-top: env(safe-area-inset-top, 0);
  padding-left: var(--space-2, 8px);
  padding-right: var(--space-2, 8px);
  /* Soft UI Evolution：標題列加微陰影提供深度，捲動時更分明 */
  box-shadow: 0 1px 12px rgba(15, 23, 42, 0.08);
}

.header-title {
  margin: 0;
  font-size: var(--text-lg, 16px);
  font-weight: var(--font-weight-semibold, 600);
  letter-spacing: 0.5px;
  /* 如果太長就截斷，避免 header 變高 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.back-btn {
  position: absolute;
  left: var(--space-2, 8px);
  top: calc(env(safe-area-inset-top, 0) + 4px);
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: var(--neutral-0, #fff);
  cursor: pointer;
  border-radius: var(--radius-full, 9999px);
  padding: 6px;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition-fast, 0.15s ease), transform var(--transition-fast, 0.15s ease);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.22);
}

.back-btn:active {
  background: rgba(255, 255, 255, 0.28);
  transform: scale(0.94);
}
</style>
