<template>
  <el-drawer
    v-model="visible"
    :title="`Visit #${visitId ?? ''} 時間線`"
    direction="rtl"
    size="420px"
  >
    <div v-if="loading" v-loading="true" class="loading-area" />
    <div v-else-if="events.length === 0" class="empty-area">尚無事件記錄</div>
    <ul v-else class="timeline-list">
      <li
        v-for="(ev, idx) in events"
        :key="idx"
        class="timeline-item"
        :class="`source--${ev.source}`"
      >
        <div class="timeline-time">{{ formatTime(ev.created_at) }}</div>
        <div class="timeline-event">
          <el-tag
            :type="ev.source === 'recruitment' ? 'warning' : 'success'"
            size="small"
          >
            {{ ev.source === 'recruitment' ? '招生' : '學生' }}
          </el-tag>
          <span class="event-type">{{ humanizeEventType(ev.event_type) }}</span>
        </div>
        <div v-if="ev.from_stage || ev.to_stage" class="timeline-stage">
          {{ ev.from_stage ?? '—' }} → {{ ev.to_stage ?? '—' }}
        </div>
        <div v-if="ev.reason" class="timeline-reason">{{ ev.reason }}</div>
      </li>
    </ul>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { ElDrawer, ElTag } from 'element-plus'
import { useRecruitmentFunnelStore } from '@/stores/recruitmentFunnel'
import { FUNNEL_EVENT_LABELS } from '@/constants/recruitmentFunnel'

const props = defineProps<{
  modelValue: boolean
  visitId: number | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const store = useRecruitmentFunnelStore()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const events = computed(() => {
  if (props.visitId == null) return []
  return store.getTimelineByVisitId(props.visitId) ?? []
})

const loading = computed(() => {
  if (props.visitId == null) return false
  return store.loadingTimeline[props.visitId] ?? false
})

watch(
  () => [visible.value, props.visitId] as const,
  ([v, vid]) => {
    if (v && vid != null) {
      store.loadTimeline(vid)
    }
  },
  { immediate: true },
)

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', { hour12: false })
}

function humanizeEventType(t: string): string {
  return FUNNEL_EVENT_LABELS[t] ?? t
}
</script>

<style scoped>
.loading-area {
  height: 200px;
}
.empty-area {
  text-align: center;
  color: var(--text-tertiary);
  padding: 32px 0;
}
.timeline-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.timeline-item {
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color-light);
}
.timeline-time {
  font-size: 12px;
  color: var(--text-tertiary);
}
.timeline-event {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 4px;
}
.event-type {
  font-weight: 600;
}
.timeline-stage {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-secondary);
}
.timeline-reason {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-secondary);
  font-style: italic;
}
</style>
