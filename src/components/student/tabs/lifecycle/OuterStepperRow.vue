<script setup lang="ts">
import { computed } from 'vue'
import type { LifecycleOverview, LifecycleStep } from '@/api/studentLifecycle'

const props = defineProps<{ overview: LifecycleOverview }>()

const terminalLabel = computed(() => {
  const t = props.overview.terminal
  if (t.kind === 'graduated') return '已畢業'
  if (t.kind === 'withdrawn') return '已退學'
  if (t.kind === 'transferred') return '已轉學'
  if (t.expected_date) return `預計畢業 ${t.expected_date}`
  return '尚未畢業'
})

const terminalColorClass = computed(() => {
  const t = props.overview.terminal
  return `terminal-${t.kind}`
})

const stepLabel = (s: LifecycleStep) => (s.key === 'terminal' ? terminalLabel.value : s.label)
</script>

<template>
  <div class="outer-stepper" data-testid="outer-stepper">
    <template v-for="(s, idx) in overview.outer_steps" :key="s.key">
      <div
        class="outer-dot"
        :class="[`status-${s.status}`, s.key === 'terminal' ? terminalColorClass : null]"
        :data-testid="`outer-${s.key}`"
      >
        <div class="dot-circle"></div>
        <div class="dot-label">{{ stepLabel(s) }}</div>
        <div v-if="s.occurred_at" class="dot-date">{{ s.occurred_at }}</div>
        <span
          v-if="s.key === 'active' && overview.on_leave_badge"
          class="leave-badge"
          data-testid="on-leave-badge"
          title="休學中"
        >⏸</span>
      </div>
      <span
        v-if="idx < overview.outer_steps.length - 1"
        class="outer-sep"
        :class="`sep-${s.status}`"
      ></span>
    </template>
  </div>
</template>

<style scoped>
.outer-stepper {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  padding: 16px;
  flex-wrap: wrap;
}
.outer-dot {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  min-width: 72px;
}
.dot-circle {
  width: 22px;
  height: 22px;
  border-radius: 50%;
}
.dot-label {
  font-size: 13px;
  margin-top: 6px;
  font-weight: 500;
  text-align: center;
  max-width: 96px;
}
.dot-date {
  font-size: 11px;
  color: var(--el-color-info);
  margin-top: 2px;
}
.outer-sep {
  width: 28px;
  height: 2px;
  background: var(--el-color-info-light-7);
  margin-top: 10px;
}
.sep-done {
  background: var(--el-color-primary);
}
.status-done .dot-circle {
  background: var(--el-color-primary);
}
.status-current .dot-circle {
  background: var(--el-color-primary-light-3);
  box-shadow: 0 0 0 4px var(--el-color-primary-light-7);
  animation: pulse 2s infinite;
}
.status-future .dot-circle {
  background: var(--el-color-info-light-7);
}
.terminal-graduated.status-done .dot-circle {
  background: #67c23a;
}
.terminal-withdrawn.status-done .dot-circle {
  background: #f56c6c;
}
.terminal-transferred.status-done .dot-circle {
  background: #e6a23c;
}
.leave-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: var(--el-color-warning);
  color: white;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 11px;
}
@keyframes pulse {
  0%,
  100% {
    box-shadow: 0 0 0 4px var(--el-color-primary-light-7);
  }
  50% {
    box-shadow: 0 0 0 8px var(--el-color-primary-light-9);
  }
}
</style>
