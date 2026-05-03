<script setup>
import { computed } from 'vue'

const props = defineProps({
  today: { type: Object, default: () => ({}) },
})

const dateLabel = computed(() => {
  if (!props.today?.date) return ''
  const d = new Date(props.today.date)
  const w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getMonth() + 1}/${d.getDate()}（週${w}）`
})

const shiftLabel = computed(() => {
  const s = props.today?.shift
  if (!s) return '今日無班次'
  const range = `${s.work_start || '—'} - ${s.work_end || '—'}`
  return `${s.name}（${range}）`
})

const punchInLabel = computed(() => formatTime(props.today?.attendance?.punch_in_at))
const punchOutLabel = computed(() => formatTime(props.today?.attendance?.punch_out_at))
const isAnomaly = computed(() => Boolean(props.today?.attendance?.is_anomaly))

function formatTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <div class="pt-card today-shift">
    <div class="row">
      <span class="label">今日</span>
      <span class="value">{{ dateLabel }}</span>
    </div>
    <div class="row">
      <span class="label">班次</span>
      <span class="value">{{ shiftLabel }}</span>
    </div>
    <div class="row">
      <span class="label">打卡</span>
      <span class="value">
        上 {{ punchInLabel }} ｜ 下 {{ punchOutLabel }}
        <el-tag v-if="isAnomaly" size="small" type="warning" effect="plain">異常</el-tag>
      </span>
    </div>
  </div>
</template>

<style scoped>
.today-shift {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.row {
  display: flex;
  gap: var(--space-3);
  align-items: baseline;
}
.label {
  width: 48px;
  color: var(--pt-text-muted);
  font-size: var(--text-sm);
}
.value {
  flex: 1;
  color: var(--pt-text-strong);
  font-size: var(--text-base);
}
</style>
