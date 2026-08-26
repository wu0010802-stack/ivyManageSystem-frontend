<script setup lang="ts">
/**
 * 今日調度：日期選擇＋假日警示條（FE-DISPATCH-02）。
 *
 * spec「當日計畫生命週期」：date 允許範圍＝今天～+7 天（可預排未來一週）；
 * 「行事曆整合」：假日顯著警示但**不阻擋**照常發車。純呈現元件，
 * holidayNotice 由 daily-plans 回應帶出。
 */
import { computed } from 'vue'

const props = defineProps<{
  /** YYYY-MM-DD */
  modelValue: string
  holidayNotice: { is_holiday: boolean; label: string } | null
}>()

const emit = defineEmits<{
  'update:modelValue': [date: string]
}>()

const MAX_AHEAD_DAYS = 7

// 今天凌晨（本地時區），用於範圍判斷（比照 ScheduleSwapDialog 慣例）
function todayMidnight(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 今天～+7 以外的日期停用（spec：可預排未來一週） */
function disabledDate(d: Date): boolean {
  const start = todayMidnight()
  const end = new Date(start)
  end.setDate(end.getDate() + MAX_AHEAD_DAYS)
  return d < start || d > end
}

const isToday = computed(() => props.modelValue === toIsoDate(todayMidnight()))

function onChange(value: string | null) {
  if (value) emit('update:modelValue', value)
}

function selectToday() {
  emit('update:modelValue', toIsoDate(todayMidnight()))
}

defineExpose({ disabledDate })
</script>

<template>
  <div class="bus-dispatch-date-bar">
    <div class="bus-dispatch-date-bar__row">
      <el-date-picker
        :model-value="modelValue"
        type="date"
        value-format="YYYY-MM-DD"
        :clearable="false"
        :disabled-date="disabledDate"
        placeholder="選擇調度日期"
        @change="onChange"
      />
      <el-button :disabled="isToday" data-test="today-btn" @click="selectToday">
        今天
      </el-button>
    </div>
    <el-alert
      v-if="holidayNotice?.is_holiday"
      class="bus-dispatch-date-bar__holiday"
      type="warning"
      :closable="false"
      show-icon
      data-test="holiday-alert"
    >
      <!--
        後端 `calendar_warnings` 回的是完整句子（「本日為假日：中秋節」），不是純
        名稱——再套一層「本日為假日／非上課日（…）」會疊成
        「本日為假日／非上課日（本日為假日：中秋節）」。這裡只補「仍可照常發車」
        這句後端不會說、但行政需要知道的話。
      -->
      <template #title>
        {{ holidayNotice.label }}，仍可照常發車
      </template>
    </el-alert>
  </div>
</template>

<style scoped>
.bus-dispatch-date-bar__row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bus-dispatch-date-bar__holiday {
  margin-top: 8px;
}
</style>
