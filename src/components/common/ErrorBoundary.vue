<script setup lang="ts">
/**
 * 全域錯誤邊界（Error Boundary）。
 *
 * 為什麼需要：
 *  - 全 codebase 無 app.config.errorHandler、無 app 級 onErrorCaptured；
 *    Sentry 預設關閉 → prod 完全沒有 errorHandler。
 *  - 任一被掛載元件在 render / computed throw 時，Vue 會把錯誤往上冒泡到 root，
 *    導致整個 SPA 白屏。
 *
 * 行為：
 *  - onErrorCaptured 攔截子樹（slot）內任何元件的 render/lifecycle 錯誤，
 *    return false 阻止往上傳播 → 單一頁面降級成 fallback，而非全站崩潰。
 *  - console.error + Sentry captureException（DSN 缺時 no-op）上報。
 *  - fallback UI 顯示「此頁載入失敗」+ 重試按鈕；重試會重置狀態並用新的
 *    render key 強制重新掛載子樹（子元件錯誤狀態若已恢復則正常渲染）。
 *
 * variant：
 *  - 'admin'（預設）：admin/teacher 後台中性配色。
 *  - 'parent'：家長端冷調 slate / 品牌綠按鈕。
 */
import { ref, onErrorCaptured } from 'vue'
import { captureException } from '@/utils/sentry'

const props = withDefaults(
  defineProps<{
    /** 設計系統變體：'admin' | 'parent' */
    variant?: 'admin' | 'parent'
  }>(),
  {
    variant: 'admin',
  },
)

// 是否處於錯誤狀態（顯示 fallback）
const hasError = ref(false)
// render key：重試時 +1 強制重新掛載 slot 子樹，丟棄壞掉的元件實例
const renderKey = ref(0)

onErrorCaptured((err) => {
  hasError.value = true
  // 上報：console + Sentry（DSN 缺時 captureException 為 no-op，回傳已 resolve 的 promise）
  console.error('[ErrorBoundary] 子元件錯誤已隔離', err)
  captureException(err, { source: 'ErrorBoundary', variant: props.variant }).catch(() => {})
  // return false 阻止錯誤繼續往上傳播，避免摧毀整個 app
  return false
})

function retry() {
  hasError.value = false
  // 換 key → slot 子樹重新掛載；若上次錯誤源於暫時性狀態，重掛即可恢復
  renderKey.value += 1
}
</script>

<template>
  <div
    v-if="hasError"
    :class="['error-boundary', `error-boundary--${variant}`]"
    data-testid="error-boundary-fallback"
    role="alert"
  >
    <div class="error-boundary__icon" aria-hidden="true">⚠️</div>
    <p class="error-boundary__title">此頁載入失敗</p>
    <p class="error-boundary__hint">請點下方重試，或重新整理頁面。</p>
    <button
      type="button"
      class="error-boundary__btn"
      data-testid="error-boundary-retry"
      @click="retry"
    >
      重試
    </button>
  </div>
  <template v-else>
    <!-- key 變更時強制重新掛載子樹，丟棄壞掉的元件實例 -->
    <slot :key="renderKey" />
  </template>
</template>

<style scoped>
.error-boundary {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 48px 24px;
  min-height: 240px;
  gap: 8px;
}

.error-boundary__icon {
  font-size: 36px;
  line-height: 1;
  margin-bottom: 4px;
}

.error-boundary__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.error-boundary__hint {
  margin: 0 0 16px;
  font-size: 14px;
  max-width: 320px;
}

.error-boundary__btn {
  padding: 10px 28px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  color: #fff;
}

.error-boundary__btn:active {
  opacity: 0.88;
}

/* ── admin（後台中性配色）─────────────────────────── */
.error-boundary--admin {
  color: var(--text-primary, #1f2937);
  background: var(--bg-color, transparent);
}
.error-boundary--admin .error-boundary__hint {
  color: var(--text-secondary, #6b7280);
}
.error-boundary--admin .error-boundary__btn {
  background: var(--el-color-primary, #3f7d48);
}

/* ── parent（家長端冷調 slate / 品牌綠）──────────────── */
.error-boundary--parent {
  color: var(--pt-text-strong, #1e293b);
  background: var(--pt-surface-card, #ffffff);
  border-radius: 16px;
}
.error-boundary--parent .error-boundary__hint {
  color: var(--pt-text-muted, #64748b);
}
.error-boundary--parent .error-boundary__btn {
  background: var(--brand-primary, #0d9053);
}

@media (prefers-reduced-motion: reduce) {
  .error-boundary__btn {
    transition: none;
  }
}
</style>
