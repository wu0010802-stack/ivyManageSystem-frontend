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
}>(), {
  collapsible: false,
  defaultOpen: true,
  badgeCount: 0,
  badgeType: 'info',
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
    <div
      v-if="collapsible"
      class="form-section__header"
      role="button"
      tabindex="0"
      :aria-expanded="isOpen"
      @click="toggle"
      @keydown.enter.prevent="toggle"
      @keydown.space.prevent="toggle"
    >
      <el-icon class="form-section__chevron" :class="{ 'is-open': isOpen }"><ArrowRight /></el-icon>
      <span class="form-section__title">{{ title }}</span>
      <span
        v-if="badgeCount > 0"
        class="form-section__badge"
        :class="{ 'is-error': badgeType === 'error', 'is-info': badgeType === 'info' }"
      >{{ badgeCount }}</span>
    </div>
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
  padding: var(--space-2) 0;
  cursor: pointer; user-select: none;
  border-radius: var(--radius-sm);
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
.form-section__body { padding: var(--space-2) 0 var(--space-3); }
</style>
