<script setup lang="ts">
/**
 * AggregatedStatusDetailDialog — 單員工四項彙整詳情（dialog 薄殼）
 *
 * Batch 13：內容抽成 AggregatedStatusContent.vue（供統一抽屜殼 §2 共用），
 * 本檔只保留 dialog 開關與標題邏輯，行為對 CurrentSemesterOverview.vue
 * 這個既有呼叫端逐字不變。
 */
import { computed } from 'vue'
import AggregatedStatusContent from './components/AggregatedStatusContent.vue'

interface Participant { employee_name?: string; role_group?: string; reinstate_count?: number; attendance?: Record<string, unknown>; retention?: Record<string, unknown> | null; activity?: Record<string, unknown> | null; disciplinary?: Record<string, unknown>; [key: string]: unknown }

const props = defineProps<{
  visible?: boolean
  participant?: Participant | null
  cycle?: unknown
  rules?: Record<string, unknown>
}>()

const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const dialogVisible = computed({
  get: () => props.visible ?? false,
  set: (v: boolean) => emit('update:visible', v),
})

const title = computed(() => {
  if (!props.participant) return '員工詳情'
  const name = props.participant.employee_name || '—'
  const className = props.participant.retention?.classroom_name || '無班級'
  return `${name}（${className}）`
})
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    :title="title"
    width="640px"
    data-test="aggregated-detail-dialog"
  >
    <AggregatedStatusContent :participant="participant" :rules="rules" />
    <template #footer>
      <el-button @click="dialogVisible = false">關閉</el-button>
    </template>
  </el-dialog>
</template>
