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
import BrandMark from '@/components/brand/BrandMark.vue'

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
  <header class="app-header" :class="{ 'has-back': displayShowBack }" role="banner">
    <button
      v-if="displayShowBack"
      type="button"
      class="back-btn touch-target"
      aria-label="返回上一頁"
      @click="goBack"
    >
      <ParentIcon name="back" size="md" />
    </button>
    <!-- BrandMark mini：只在 tab 首頁（無返回鍵）時顯示；深層頁以 back-btn 替代 -->
    <BrandMark
      v-if="!displayShowBack"
      variant="mini"
      :size="28"
      class="app-header-brand"
    />
    <h1 class="header-title">{{ displayTitle }}</h1>
    <slot name="actions">
      <span class="header-spacer" aria-hidden="true" />
    </slot>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky, 10);
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  min-height: 56px;
  background: var(--pt-surface-toolbar, var(--pt-surface-card));
  color: var(--pt-text-strong);
  padding-top: env(safe-area-inset-top, 0);
  padding-left: 10px;
  padding-right: 10px;
  border-bottom: 1px solid var(--pt-page-border, var(--pt-border));
  box-shadow: 0 6px 20px rgba(27, 68, 89, 0.05);
}

.header-title {
  margin: 0;
  font-size: var(--text-lg, 16px);
  font-weight: 800;
  letter-spacing: 0;
  text-align: center;
  /* 如果太長就截斷，避免 header 變高 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.back-btn {
  position: relative;
  left: auto;
  top: auto;
  background: var(--pt-tint-brand, var(--brand-primary-soft));
  border: 1px solid var(--pt-page-border, var(--pt-border));
  color: var(--brand-primary);
  cursor: pointer;
  border-radius: 14px;
  padding: 6px;
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition-fast, 0.15s ease), transform var(--transition-fast, 0.15s ease);
}

.back-btn:hover {
  background: var(--pt-tint-brand-strong, var(--brand-primary-soft));
}

.back-btn:active {
  background: var(--pt-tint-brand-strong, var(--brand-primary-soft));
  transform: scale(0.94);
}

.app-header-brand {
  position: relative;
  left: auto;
  top: auto;
  justify-self: center;
  flex-shrink: 0;
}

.header-spacer {
  width: 38px;
  height: 38px;
}
</style>
