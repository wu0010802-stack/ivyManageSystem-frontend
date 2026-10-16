<!-- src/components/common/FormSection.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'

const props = withDefaults(defineProps<{
  title: string
  collapsible?: boolean
  defaultOpen?: boolean
  badgeCount?: number
  badgeType?: 'error' | 'info'
  /** 收合時的內容摘要（如「已填 2 項」「未填」）；badgeCount > 0 時讓位給錯誤徽章 */
  summary?: string
}>(), {
  collapsible: false,
  defaultOpen: true,
  badgeCount: 0,
  badgeType: 'info',
  summary: '',
})

const isOpen = ref(props.collapsible ? props.defaultOpen : true)

function toggle() {
  if (props.collapsible) isOpen.value = !isOpen.value
}

function expand() {
  isOpen.value = true
}

defineExpose({ expand })
</script>

<template>
  <div class="form-section">
    <!-- 真正的 button（非 div role="button"）：Enter/Space 原生觸發 click、
         焦點語意正確；type="button" 避免在 el-form 內觸發 submit -->
    <button
      v-if="collapsible"
      type="button"
      class="form-section__header"
      :aria-expanded="isOpen"
      @click="toggle"
    >
      <el-icon class="form-section__chevron" :class="{ 'is-open': isOpen }"><ArrowRight /></el-icon>
      <span class="form-section__title">{{ title }}</span>
      <span
        v-if="badgeCount > 0"
        class="form-section__badge"
        :class="{ 'is-error': badgeType === 'error', 'is-info': badgeType === 'info' }"
      >{{ badgeCount }}</span>
      <span v-else-if="summary" class="form-section__summary" data-test="section-summary">{{ summary }}</span>
    </button>
    <div v-else class="form-section__label">{{ title }}</div>

    <div v-show="isOpen" class="form-section__body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
/* 視覺語言（2026-07-30 dialog 殼層優化）：常駐標籤與可收合標頭共用同一套
 * 標題樣式，區段之間以 hairline 分隔，取代舊版「灰框卡片 + 藍色小字」兩套系統。 */
.form-section + .form-section {
  border-top: 1px solid var(--el-border-color-lighter);
  margin-top: var(--space-3);
  padding-top: var(--space-2);
}
.form-section__header {
  display: flex; align-items: center; gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) 0;
  cursor: pointer; user-select: none;
  border-radius: var(--radius-sm);
  /* button reset：沿用原 div 視覺 */
  background: none; border: none; font: inherit; text-align: left; color: inherit;
}
.form-section__header:hover .form-section__title,
.form-section__header:hover .form-section__chevron { color: var(--el-color-primary); }
.form-section__header:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
.form-section__chevron { transition: transform var(--transition-base); color: var(--el-text-color-secondary); }
.form-section__chevron.is-open { transform: rotate(90deg); }
.form-section__title,
.form-section__label {
  font-size: var(--text-base); font-weight: 600;
  color: var(--el-text-color-primary);
  transition: color var(--transition-fast);
}
.form-section__label { padding: var(--space-2) 0; }
.form-section__badge {
  margin-left: auto; min-width: 18px; height: 18px; padding: 0 6px;
  border-radius: var(--radius-full); font-size: var(--text-xs);
  /* #fff 刻意寫死：白字壓飽和色（danger/info）在 light/dark 皆正確；
     --neutral-0 於 dark mode 會翻成深色，不可用於此處 */
  line-height: 18px; text-align: center; color: #fff;
}
.form-section__badge.is-error { background: var(--el-color-danger); }
.form-section__badge.is-info { background: var(--el-color-info); }
.form-section__summary {
  margin-left: auto; height: 18px; padding: 0 8px;
  border-radius: var(--radius-full); font-size: var(--text-xs); line-height: 18px;
  color: var(--el-text-color-secondary); background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
}
.form-section__body { padding: var(--space-2) 0 var(--space-3); }
</style>
