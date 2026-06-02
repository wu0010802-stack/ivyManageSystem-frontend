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

    <div v-if="isOpen" class="form-section__body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.form-section { margin-bottom: 8px; }
.form-section__header {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; cursor: pointer;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px; background: var(--el-fill-color-blank);
  user-select: none;
}
.form-section__header:hover { background: var(--el-fill-color-light); }
.form-section__chevron { transition: transform .2s; color: var(--el-text-color-secondary); }
.form-section__chevron.is-open { transform: rotate(90deg); }
.form-section__title { font-size: 13px; font-weight: 600; color: var(--el-text-color-primary); }
.form-section__badge {
  margin-left: auto; min-width: 18px; height: 18px; padding: 0 6px;
  border-radius: 9px; font-size: 12px; line-height: 18px; text-align: center; color: #fff;
}
.form-section__badge.is-error { background: var(--el-color-danger); }
.form-section__badge.is-info { background: var(--el-color-info); }
.form-section__label {
  font-size: 11px; letter-spacing: .5px; font-weight: 600;
  color: var(--el-color-primary); margin-bottom: 10px;
}
.form-section__body { padding: 12px 4px 4px; }
</style>
