<template>
  <div class="journey-timeline" v-loading="loading">
    <div v-if="visitId == null" class="empty-area">無招生來源紀錄</div>
    <div v-else-if="!loading && events.length === 0" class="empty-area">尚無歷程事件</div>
    <ul v-else class="timeline-list">
      <li v-for="(ev, idx) in events" :key="idx" class="timeline-item">
        <div class="timeline-time">{{ formatTime(ev.created_at) }}</div>
        <div class="timeline-event">
          <el-tag :type="ev.source === 'recruitment' ? 'warning' : 'success'" size="small">
            {{ ev.source === 'recruitment' ? '招生' : '學生' }}
          </el-tag>
          <span class="event-type">{{ humanize(ev.event_type) }}</span>
        </div>
        <div v-if="ev.from_stage || ev.to_stage" class="timeline-stage">
          {{ ev.from_stage ?? '—' }} → {{ ev.to_stage ?? '—' }}
        </div>
        <div v-if="ev.reason" class="timeline-reason">{{ ev.reason }}</div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElTag } from 'element-plus'
import { getVisitTimeline } from '@/api/recruitment'
import { FUNNEL_EVENT_LABELS } from '@/constants/recruitmentFunnel'
import type { Schema } from '@/api/_generated/typed'

type TimelineEvent = Schema<'TimelineEvent'>

const props = defineProps<{ visitId: number | null }>()
const events = ref<TimelineEvent[]>([])
const loading = ref(false)

const humanize = (t: string): string => FUNNEL_EVENT_LABELS[t] ?? t
const formatTime = (iso: string): string =>
  new Date(iso).toLocaleString('zh-TW', { hour12: false })

async function load(): Promise<void> {
  if (props.visitId == null) {
    events.value = []
    return
  }
  loading.value = true
  try {
    const resp = await getVisitTimeline(props.visitId)
    events.value = (resp.data as { events?: TimelineEvent[] }).events ?? []
  } finally {
    loading.value = false
  }
}

watch(() => props.visitId, () => void load(), { immediate: true })
</script>

<style scoped>
.empty-area {
  text-align: center;
  color: #999;
  padding: 32px 0;
}
.timeline-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.timeline-item {
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}
.timeline-time {
  font-size: 12px;
  color: #999;
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
  color: #666;
}
.timeline-reason {
  margin-top: 4px;
  font-size: 13px;
  color: #555;
  font-style: italic;
}
</style>
