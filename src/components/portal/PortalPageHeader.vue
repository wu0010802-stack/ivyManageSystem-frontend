<script setup lang="ts">
/**
 * 教師端頁首（2026-09-03 UI 收斂）。
 *
 * 之前 30 個 Portal view 的標題有 9 種寫法（h1/h2/h3、有無 class、inline style、
 * 自訂 BEM、無標題），返回連結也有 3 種（`← 返回…` 純文字箭頭搭 el-button link /
 * text）。這裡收斂成單一元件：
 *
 * - 標題固定 `h1`（Portal 殼層沒有 h1，每頁一個），視覺 --text-2xl / 700
 * - `subtitle` 放日期、說明文字等次要資訊，不再塞進標題括號裡（手機會折行）
 * - `back-label` 有值即渲染返回鈕（ArrowLeft 圖示，不用 unicode 箭頭），點擊 emit('back')
 * - `#actions` 放頁級主要動作（新增、重新整理）；手機寬度不夠時自動折到標題下方
 * - 只給 `back-label` 不給 title：只渲染返回鈕（詳情頁自己的卡片已有大標題時用）
 */
import { ArrowLeft } from '@element-plus/icons-vue'

withDefaults(
  defineProps<{
    title?: string
    subtitle?: string
    backLabel?: string
  }>(),
  { title: '', subtitle: '', backLabel: '' },
)

defineEmits<{ back: [] }>()
</script>

<template>
  <header class="portal-page-header">
    <button
      v-if="backLabel"
      type="button"
      class="portal-page-header__back"
      data-test="page-header-back"
      @click="$emit('back')"
    >
      <el-icon aria-hidden="true"><ArrowLeft /></el-icon>
      <span>{{ backLabel }}</span>
    </button>

    <div v-if="title || $slots.title || $slots.actions" class="portal-page-header__row">
      <div v-if="title || $slots.title" class="portal-page-header__text">
        <h1 class="portal-page-header__title">
          <slot name="title">{{ title }}</slot>
        </h1>
        <p v-if="subtitle || $slots.subtitle" class="portal-page-header__subtitle">
          <slot name="subtitle">{{ subtitle }}</slot>
        </p>
      </div>
      <div v-if="$slots.actions" class="portal-page-header__actions">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>

<style scoped>
.portal-page-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.portal-page-header__back {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-height: 32px;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  color: var(--el-color-primary);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.portal-page-header__back:hover {
  color: var(--el-color-primary-dark-2);
}
.portal-page-header__back:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
.portal-page-header__back .el-icon {
  font-size: 16px;
}

.portal-page-header__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
}

.portal-page-header__text {
  flex: 1 1 12rem;
  min-width: 0;
}

.portal-page-header__title {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}

.portal-page-header__subtitle {
  margin: var(--space-1) 0 0;
  max-width: 60ch;
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--pt-text-muted);
}

.portal-page-header__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  flex-shrink: 0;
}
/* EP 按鈕相鄰預設 margin-left:12px，與 gap 疊加會不均 */
.portal-page-header__actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
</style>
