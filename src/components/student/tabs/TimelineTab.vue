<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchTimeline } from '@/api/studentTimeline'
import type { ApiQuery } from '@/api/_generated/typed'
import TimelineFilters from '../timeline/TimelineFilters.vue'
import TimelineItem from '../timeline/TimelineItem.vue'

const props = defineProps<{
  studentId: number
}>()

const items = ref<Record<string, unknown>[]>([])
const stats = ref<{ total_items: number; by_type: Record<string, number> }>({ total_items: 0, by_type: {} })
const nextCursor = ref<string | null>(null)
const loading = ref(false)
const filters = ref<{ types: string[]; since: string | null; until: string | null }>({ types: [], since: null, until: null })

async function reload(append = false) {
  loading.value = true
  try {
    const params: ApiQuery<'/students/{student_id}/timeline', 'get'> = { limit: 30 }
    if (filters.value.types?.length) params.types = filters.value.types.join(',')
    if (filters.value.since) params.since = filters.value.since
    if (filters.value.until) params.until = filters.value.until
    if (append && nextCursor.value) params.cursor = nextCursor.value
    const resp = await fetchTimeline(props.studentId, params)
    const respData = resp.data
    const newItems = (respData?.items ?? []) as unknown as Record<string, unknown>[]
    if (append) {
      items.value = [...items.value, ...newItems]
    } else {
      items.value = newItems
    }
    nextCursor.value = respData?.next_cursor ?? null
    stats.value = respData?.stats || stats.value
  } catch {
    ElMessage.error('讀取時間軸失敗')
  } finally {
    loading.value = false
  }
}

function loadMore() {
  if (nextCursor.value) reload(true)
}

onMounted(() => reload(false))
watch(filters, () => reload(false), { deep: true })
</script>

<template>
  <div class="timeline-tab">
    <TimelineFilters v-model="filters" />

    <el-empty v-if="!loading && items.length === 0" description="此期間沒有任何成長紀錄" />

    <div v-else class="feed">
      <TimelineItem v-for="item in items" :key="item.id as PropertyKey" :item="item" />
    </div>

    <div v-if="nextCursor" class="load-more">
      <el-button :loading="loading" @click="loadMore">載入更多</el-button>
    </div>
  </div>
</template>

<style scoped>
.timeline-tab { display: flex; flex-direction: column; gap: 12px; }
.feed { display: flex; flex-direction: column; gap: 8px; }
.load-more { text-align: center; padding: 16px; }
</style>
