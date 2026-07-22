<!-- src/views/appraisal/components/AppraisalProcessGuide.vue -->
<script setup lang="ts">
import { APPRAISAL_STEPS, type AppraisalStepKey, type AppraisalStepStatus } from '../appraisalSteps'

const props = defineProps<{
  statuses: Record<AppraisalStepKey, AppraisalStepStatus>
}>()
const emit = defineEmits<{ navigate: [key: AppraisalStepKey] }>()

function onClick(key: AppraisalStepKey) {
  if (props.statuses[key] === 'disabled') return
  emit('navigate', key)
}
</script>

<template>
  <nav class="ap-guide" aria-label="考核流程">
    <button
      v-for="(s, i) in APPRAISAL_STEPS"
      :key="s.key"
      class="ap-guide__step"
      :class="{
        'is-done': statuses[s.key] === 'done',
        'is-current': statuses[s.key] === 'current',
        'is-disabled': statuses[s.key] === 'disabled',
      }"
      :data-test="`guide-step-${s.key}`"
      :disabled="statuses[s.key] === 'disabled'"
      :title="s.hint"
      @click="onClick(s.key)"
    >
      <span class="ap-guide__idx">{{ statuses[s.key] === 'done' ? '✓' : i + 1 }}</span>
      <span class="ap-guide__label">{{ s.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.ap-guide {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2, 8px);
  align-items: stretch;
  padding: var(--space-3, 12px);
  background: var(--el-fill-color-lighter);
  border-radius: var(--radius-md, 8px);
}
.ap-guide__step {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: var(--space-2, 8px) var(--space-3, 12px);
  border: 1px solid var(--el-border-color-lighter);
  border-bottom: 3px solid transparent;
  border-radius: var(--radius-md, 6px);
  background: var(--el-bg-color);
  color: var(--text-secondary, var(--el-text-color-regular));
  font-size: var(--text-sm, 13px);
  cursor: pointer;
}
.ap-guide__step.is-current {
  background: var(--el-color-primary-light-9);
  border-bottom-color: var(--el-color-primary);
  color: var(--el-color-primary);
  font-weight: 600;
}
.ap-guide__step.is-done { color: var(--el-color-success); }
.ap-guide__step.is-disabled { opacity: 0.5; cursor: not-allowed; }
.ap-guide__idx {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border-radius: 50%;
  background: var(--el-fill-color); font-size: var(--text-xs, 12px);
}
</style>
