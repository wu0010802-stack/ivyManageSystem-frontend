<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElCheckbox, ElCheckboxGroup, ElEmpty } from 'element-plus'
import { fetchTimeline } from '@/api/studentTimeline'

interface TimelineItem {
  record_type: string
  record_id: number
  summary?: string
  occurred_at?: string | null
  reason?: string | null
  amount?: number | null
}

const props = defineProps<{
  studentId: number
}>()

const ALL_TYPES = [
  { key: 'funnel_event', label: '招生階段' },
  { key: 'change_log', label: '生命週期' },
  { key: 'classroom_transfer', label: '轉班' },
  { key: 'payment', label: '繳費' },
  { key: 'incident', label: '事件' },
  { key: 'assessment', label: '評量' },
]

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  ALL_TYPES.map((t) => [t.key, t.label])
)

const enabledTypes = ref<string[]>(ALL_TYPES.map((t) => t.key))
const items = ref<TimelineItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    const resp = await fetchTimeline(props.studentId, {
      types: enabledTypes.value.join(','),
      limit: 100,
    })
    // ⚠ 型別化 fetchTimeline 後揭露既有落差：本元件的 ALL_TYPES（funnel_event/change_log/
    // classroom_transfer/payment/incident/assessment）與回傳形狀（record_type/record_id）
    // 對應的其實是 GET /students/records（StudentRecordsTimelineOut），而非這裡呼叫的
    // GET /students/{id}/timeline（TimelineOut，type 為 observation/incident/... 且欄位是
    // type/id 不是 record_type/record_id）。維持既有執行期行為（雙轉型），實際應改接
    // /students/records 端點——超出本次「api 型別化」範圍，回報待後續處理。
    const data = resp?.data as unknown as { items?: TimelineItem[] } | undefined
    items.value = data?.items || []
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'load failed'
    items.value = []
  } finally {
    loading.value = false
  }
}

watch(enabledTypes, load, { deep: true })
watch(() => props.studentId, load, { immediate: true })
</script>

<template>
  <div class="lifecycle-timeline" data-testid="lifecycle-timeline">
    <div class="filter-row">
      <el-checkbox-group v-model="enabledTypes" data-testid="type-filter">
        <el-checkbox
          v-for="t in ALL_TYPES"
          :key="t.key"
          :value="t.key"
          :label="t.label"
          :data-testid="`filter-${t.key}`"
        />
      </el-checkbox-group>
    </div>

    <div v-if="error" class="timeline-error" data-testid="timeline-error">
      {{ error }}
    </div>

    <el-empty
      v-else-if="!loading && items.length === 0"
      description="無紀錄"
      data-testid="timeline-empty"
    />

    <ul v-else class="timeline-list" data-testid="timeline-list">
      <li
        v-for="it in items"
        :key="`${it.record_type}-${it.record_id}`"
        class="timeline-item"
        :data-testid="`item-${it.record_type}-${it.record_id}`"
      >
        <span class="item-date">{{ it.occurred_at }}</span>
        <span class="item-type">{{ TYPE_LABEL[it.record_type] || it.record_type }}</span>
        <span class="item-summary">{{ it.summary }}</span>
        <span v-if="it.reason" class="item-reason">（{{ it.reason }}）</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.lifecycle-timeline {
  padding: 16px;
}
.filter-row {
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.timeline-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.timeline-item {
  display: flex;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--el-border-color-lighter);
  align-items: baseline;
}
.item-date {
  font-size: 12px;
  color: var(--el-color-info);
  min-width: 92px;
}
.item-type {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  white-space: nowrap;
}
.item-summary {
  flex: 1;
}
.item-reason {
  font-size: 12px;
  color: var(--el-color-info);
}
.timeline-error {
  color: var(--el-color-danger);
  padding: 8px;
}
</style>
