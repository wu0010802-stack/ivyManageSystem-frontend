<script setup lang="ts">
import { computed } from 'vue'
import { eventTypeColor } from '@/constants/calendarEventTypes'
import type { CalendarEventDetail } from './types'

const props = defineProps<{
  modelValue: boolean
  event: CalendarEventDetail | null
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})
</script>

<template>
  <el-dialog v-model="visible" title="事件詳情" width="460px">
    <template v-if="props.event">
      <el-descriptions :column="1" border>
        <el-descriptions-item label="標題">
          <span>{{ props.event.title }}</span>
          <el-tag v-if="props.event.is_official" size="small" type="info" style="margin-left: 8px">官方</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="類型">
          <el-tag
            :color="eventTypeColor(props.event.event_type)"
            effect="dark"
            size="small"
            style="border: none; color: #fff"
          >
            {{ props.event.event_type_label }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="日期">
          {{ props.event.event_date }}
          <template v-if="props.event.end_date && props.event.end_date !== props.event.event_date">
            ~ {{ props.event.end_date }}
          </template>
        </el-descriptions-item>
        <el-descriptions-item label="時間">
          <span v-if="props.event.is_all_day">全天</span>
          <span v-else-if="props.event.start_time">{{ props.event.start_time }} - {{ props.event.end_time ?? props.event.start_time }}</span>
          <span v-else>—</span>
        </el-descriptions-item>
        <el-descriptions-item label="地點">{{ props.event.location || '—' }}</el-descriptions-item>
        <el-descriptions-item label="說明">{{ props.event.description || '—' }}</el-descriptions-item>
        <el-descriptions-item label="資料來源">
          {{ props.event.is_official ? '官方同步（唯讀）' : '校內事件' }}
        </el-descriptions-item>
      </el-descriptions>
    </template>
    <template #footer>
      <el-button @click="visible = false">關閉</el-button>
    </template>
  </el-dialog>
</template>
