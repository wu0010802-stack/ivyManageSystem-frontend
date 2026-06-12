<template>
  <div class="recurrence-editor">
    <el-checkbox v-model="enabled">每週/每月重複</el-checkbox>

    <template v-if="enabled">
      <el-radio-group v-model="ruleType" class="rule-type-group">
        <el-radio value="weekly">每週 X</el-radio>
        <el-radio value="monthly_day">每月 N 號</el-radio>
        <el-radio value="monthly_nth">每月第 N 個星期 X</el-radio>
      </el-radio-group>

      <div v-if="ruleType === 'weekly'" class="rule-field">
        <span>星期</span>
        <el-select v-model="weekday" style="width: 100px">
          <el-option
            v-for="(label, idx) in WEEKDAYS"
            :key="idx"
            :value="idx"
            :label="label"
          />
        </el-select>
      </div>

      <div v-if="ruleType === 'monthly_day'" class="rule-field">
        <span>每月</span>
        <el-input-number v-model="day" :min="1" :max="31" />
        <span>號</span>
      </div>

      <div v-if="ruleType === 'monthly_nth'" class="rule-field">
        <span>每月第</span>
        <el-select v-model="nth" style="width: 100px">
          <el-option
            v-for="n in [1, 2, 3, 4, 5, -1]"
            :key="n"
            :value="n"
            :label="nthLabel(n)"
          />
        </el-select>
        <span>個</span>
        <el-select v-model="weekday" style="width: 100px">
          <el-option
            v-for="(label, idx) in WEEKDAYS"
            :key="idx"
            :value="idx"
            :label="label"
          />
        </el-select>
      </div>

      <div class="rule-field">
        <span>結束日</span>
        <el-date-picker
          v-model="until"
          type="date"
          value-format="YYYY-MM-DD"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import {
  ElCheckbox,
  ElRadioGroup,
  ElRadio,
  ElSelect,
  ElOption,
  ElInputNumber,
  ElDatePicker,
} from 'element-plus'

import type { RecurrenceRule, WeeklyRule, MonthlyDayRule, MonthlyNthRule } from './types'
import { dateToLocalISO } from '@/utils/format'

const props = defineProps<{ modelValue: RecurrenceRule | null }>()
const emit = defineEmits<{ 'update:modelValue': [RecurrenceRule | null] }>()

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

const enabled = ref<boolean>(props.modelValue !== null)
const ruleType = ref<RecurrenceRule['type']>(
  props.modelValue?.type ?? 'weekly',
)
const weekday = ref<number>(
  ((props.modelValue as WeeklyRule | MonthlyNthRule | null)?.weekday) ?? 0,
)
const day = ref<number>(
  ((props.modelValue as MonthlyDayRule | null)?.day) ?? 1,
)
const nth = ref<number>(
  ((props.modelValue as MonthlyNthRule | null)?.nth) ?? 1,
)
const until = ref<string>(props.modelValue?.until ?? defaultUntil())

function defaultUntil(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  // 本地時區，不可用 toISOString()（UTC 會在台北凌晨偏成昨天）
  return dateToLocalISO(d)
}

function nthLabel(n: number): string {
  return n === -1 ? '最後一個' : String(n)
}

const buildRule = computed<RecurrenceRule | null>(() => {
  if (!enabled.value) return null
  if (ruleType.value === 'weekly') {
    return { type: 'weekly', weekday: weekday.value, until: until.value }
  }
  if (ruleType.value === 'monthly_day') {
    return { type: 'monthly_day', day: day.value, until: until.value }
  }
  return {
    type: 'monthly_nth',
    nth: nth.value,
    weekday: weekday.value,
    until: until.value,
  }
})

watch(buildRule, (v) => emit('update:modelValue', v))
</script>

<style scoped>
.recurrence-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
}
.rule-type-group {
  margin-left: 24px;
}
.rule-field {
  margin-left: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
