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
  min-height: 48px;
  background: var(--brand-primary, #3f7d48);
  color: var(--neutral-0, #fff);
  padding-top: env(safe-area-inset-top, 0);
  padding-left: var(--space-2, 8px);
  padding-right: var(--space-2, 8px);
}

.header-title {
  margin: 0;
  font-size: var(--text-lg, 16px);
  font-weight: var(--font-weight-semibold, 600);
  letter-spacing: 1px;
  /* 如果太長就截斷，避免 header 變高 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.back-btn {
  position: absolute;
  left: var(--space-1, 4px);
  top: env(safe-area-inset-top, 0);
  background: transparent;
  border: none;
  color: var(--neutral-0, #fff);
  cursor: pointer;
  border-radius: var(--radius-md, 8px);
  padding: 0;
}

.back-btn:active {
  background: rgba(255, 255, 255, 0.15);
}
</style>
