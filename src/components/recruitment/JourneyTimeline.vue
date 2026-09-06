<template>
  <div class="journey-timeline">
    <div v-if="visitId == null" class="journey-timeline__empty">無招生來源紀錄</div>
    <RecruitmentTimelineList v-else :events="events" :loading="loading" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { getVisitTimeline } from '@/api/recruitment'
import RecruitmentTimelineList from './RecruitmentTimelineList.vue'
import type { Schema } from '@/api/_generated/typed'

type TimelineEvent = Schema<'TimelineEvent'>

// 呈現層與看板的時間線抽屜共用 RecruitmentTimelineList（2026-09-06）：
// 兩處原本各有一份逐字相同的渲染與樣式，其中本檔還用硬編灰階（深色模式看不清）。
// 這裡只負責取資料。
const props = defineProps<{ visitId: number | null }>()
const events = ref<TimelineEvent[]>([])
const loading = ref(false)

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
.journey-timeline__empty {
  text-align: center;
  color: var(--text-tertiary);
  padding: 32px 0;
}
</style>
