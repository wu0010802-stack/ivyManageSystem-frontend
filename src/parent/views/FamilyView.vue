<script setup lang="ts">
import { computed, watch } from 'vue'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { getFamilyTimeline } from '../api/family'
import { getHomeSummary } from '../api/profile'
import ChildSelector from '../components/ChildSelector.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'
import FamilyTimeline from '../components/family/FamilyTimeline.vue'
import FamilyEntryGrid from '../components/family/FamilyEntryGrid.vue'

const childrenStore = useChildrenStore()
const { selectedId } = useChildSelection()

// 確保 children store 已載入；首次進入時 stores 可能還是空
childrenStore.load?.()

const cacheKey = computed(
  () => `parent/family/timeline:${selectedId.value || 'none'}`,
)

const {
  data: timelineData,
  error: timelineError,
  pending: timelinePending,
  refresh: refreshTimeline,
} = useCachedAsync(
  cacheKey,
  async () => {
    if (!selectedId.value) return []
    const res = await getFamilyTimeline(selectedId.value, { limit: 7 })
    return res.data || []
  },
  { ttl: 60_000 },
)

// summary 用既有 home/summary 取徽章數（不另起新 endpoint）
const { data: summaryData, refresh: refreshSummary } = useCachedAsync(
  'parent/home/summary',
  async () => {
    const res = await getHomeSummary()
    return res.data
  },
  { ttl: 60_000 },
)

// 切換孩子時重 fetch（cache key 隨之變動）
watch(selectedId, () => refreshTimeline(true))

const ENTRIES = [
  { key: 'contact_book', label: '聯絡簿', icon: 'notebook', path: '/contact-book' },
  { key: 'attendance', label: '出席', icon: 'calendar', path: '/attendance' },
  { key: 'announcement', label: '公告', icon: 'megaphone', path: '/announcements' },
  { key: 'calendar', label: '本週', icon: 'calendar', path: '/calendar' },
  { key: 'leave', label: '請假', icon: 'clipboard', path: '/leaves' },
  { key: 'medication', label: '用藥', icon: 'pill', path: '/medications' },
  { key: 'activity', label: '才藝', icon: 'art', path: '/activity' },
  { key: 'event_ack', label: '簽閱', icon: 'signature', path: '/events' },
  { key: 'assistant', label: '小幫手', icon: 'chat', path: '/assistant' },
]

const badges = computed(() => {
  const s = summaryData.value?.summary || {}
  return {
    announcement: s.unread_announcements || 0,
    event_ack: s.pending_event_acks || 0,
    activity: s.pending_activity_promotions || 0,
  }
})

async function pullRefresh() {
  await Promise.all([refreshTimeline(true), refreshSummary(true)])
}
</script>

<template>
  <PullToRefresh :on-refresh="pullRefresh" class="family-view">
    <ChildSelector />

    <MobileErrorRetry
      v-if="timelineError && !timelineData"
      :error="timelineError"
      @retry="refreshTimeline(true)"
    />

    <FamilyTimeline
      :items="timelineData || []"
      :loading="timelinePending && !timelineData"
    />

    <FamilyEntryGrid :entries="ENTRIES" :badges="badges" />
  </PullToRefresh>
</template>

<style scoped>
.family-view :deep(.ptr-content) {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
}
</style>
