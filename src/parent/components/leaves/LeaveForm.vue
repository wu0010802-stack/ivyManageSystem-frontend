<script setup lang="ts">
/**
 * 請假申請表單（presentational + v-model）。
 *
 * Props:
 *  - modelValue: 表單狀態物件，必填
 *      { student_id, leave_type, start_date, end_date, reason }
 *  - children: 子女清單（resolve 後傳入）
 *  - pastLimit / futureLimit: 起始日的可選範圍字串（YYYY-MM-DD）
 *  - submitting: Boolean，控制送出按鈕 disabled / 文案
 *
 * Emits:
 *  - update:modelValue(newForm) — v-model 更新
 *  - submit — 送出按鈕點擊（payload 由父層自行讀取 form 處理）
 *  - cancel — 取消按鈕點擊
 *
 * 注意：本元件純 presentational，不接 store 也不打 API。
 *
 * 單手快填：「今天／明天」一鍵帶入起訖日；起始日改到晚於結束日時，結束日自動對齊，
 * 不等送出才跳「結束日不可早於起始日」；只有一個孩子時不顯示學生下拉。
 */
import { computed } from 'vue'
import { todayISO, dateToLocalISO } from '@/utils/format'
import M3SegmentedButton from '../m3/M3SegmentedButton.vue'

interface Child {
  student_id: number
  name?: string
}

interface LeaveFormData {
  student_id?: number
  leave_type?: string
  start_date?: string
  end_date?: string
  reason?: string
  [key: string]: unknown
}

const props = withDefaults(defineProps<{
  modelValue: LeaveFormData
  children?: Child[]
  pastLimit: string
  futureLimit: string
  submitting?: boolean
}>(), {
  children: () => [],
  submitting: false,
})
const emit = defineEmits<{
  'update:modelValue': [value: LeaveFormData]
  'submit': []
  'cancel': []
}>()

function update(field: string, value: unknown): void {
  // 重新發射整個物件，避免父層遺漏其他欄位
  emit('update:modelValue', { ...props.modelValue, [field]: value })
}

/** 起始日改到結束日之後：結束日跟著對齊（同一次 emit，避免中間態被送出）。 */
function updateStart(value: string): void {
  const end = props.modelValue.end_date || ''
  const next: LeaveFormData = { ...props.modelValue, start_date: value }
  if (value && (!end || end < value)) next.end_date = value
  emit('update:modelValue', next)
}

const todayStr = todayISO()
const tomorrowStr = (() => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return dateToLocalISO(d)
})()

const QUICK_DAYS = [
  { label: '今天', date: todayStr },
  { label: '明天', date: tomorrowStr },
] as const

function pickDay(date: string): void {
  emit('update:modelValue', { ...props.modelValue, start_date: date, end_date: date })
}

function isPicked(date: string): boolean {
  return props.modelValue.start_date === date && props.modelValue.end_date === date
}

// 假別值是送後端的原值（病假／事假），label 與 value 相同，不另做翻譯。
const LEAVE_TYPES = [
  { value: '病假', label: '病假' },
  { value: '事假', label: '事假' },
]

const singleChild = computed<Child | null>(() => (props.children.length === 1 ? props.children[0] : null))
</script>

<template>
  <div class="leave-form">
    <p v-if="singleChild" class="single-child" data-testid="leave-single-child">
      請假的孩子：<strong>{{ singleChild.name }}</strong>
    </p>
    <div v-else class="field">
      <label for="leave-student">學生</label>
      <select
        id="leave-student"
        :value="modelValue.student_id"
        @change="update('student_id', Number(($event.target as HTMLSelectElement).value))"
      >
        <option
          v-for="c in children"
          :key="c.student_id"
          :value="c.student_id"
        >{{ c.name }}</option>
      </select>
    </div>
    <fieldset class="field radio-fieldset">
      <legend>假別</legend>
      <M3SegmentedButton
        class="leave-type-segmented"
        aria-label="假別"
        :items="LEAVE_TYPES"
        :model-value="modelValue.leave_type ?? ''"
        @update:model-value="update('leave_type', $event)"
      />
    </fieldset>
    <div class="quick-days" role="group" aria-label="快速選日期">
      <button
        v-for="q in QUICK_DAYS"
        :key="q.label"
        type="button"
        class="quick-day"
        :class="{ active: isPicked(q.date) }"
        :aria-pressed="isPicked(q.date)"
        @click="pickDay(q.date)"
      >{{ q.label }}</button>
    </div>
    <div class="field">
      <label for="leave-start">起始日</label>
      <input
        id="leave-start"
        type="date"
        :value="modelValue.start_date"
        :min="pastLimit"
        :max="futureLimit"
        @input="updateStart(($event.target as HTMLInputElement).value)"
      />
    </div>
    <div class="field">
      <label for="leave-end">結束日</label>
      <input
        id="leave-end"
        type="date"
        :value="modelValue.end_date"
        :min="modelValue.start_date"
        :max="futureLimit"
        @input="update('end_date', ($event.target as HTMLInputElement).value)"
      />
    </div>
    <div class="field">
      <label for="leave-reason">原因（選填）</label>
      <textarea
        id="leave-reason"
        :value="modelValue.reason"
        rows="3"
        maxlength="500"
        autocomplete="off"
        @input="update('reason', ($event.target as HTMLTextAreaElement).value)"
      />
    </div>
    <div class="form-footer">
      <button type="button" class="secondary-btn" @click="emit('cancel')">取消</button>
      <button type="button" class="primary-btn" :disabled="submitting" @click="emit('submit')">
        {{ submitting ? '送出中...' : '送出' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.leave-form {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field label,
.radio-fieldset > legend {
  display: block;
  font-size: 0.8125rem;
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
  margin-bottom: 4px;
  padding: 0;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--m3-outline-variant, var(--pt-border-strong));
  border-radius: 6px;
  font-size: max(16px, 1rem); /* <16px 會讓 iOS/LIFF 聚焦時整頁放大，見 inputFontSize.spec.ts */
  font-family: inherit;
  box-sizing: border-box;
}

.single-child { margin: 0; }

.quick-days {
  display: flex;
  gap: var(--space-2, 8px);
}
.quick-day {
  flex: 1;
  min-height: var(--touch-target-min, 44px);
  border-radius: 999px;
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
  font-weight: 600;
}
.quick-day.active {
  background: var(--color-success-soft);
  border-width: 2px;
}

.radio-fieldset {
  border: none;
  padding: 0;
  margin: 0;
}

.leave-type-segmented { width: 100%; }

.form-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 0 0;
  border-top: 1px solid var(--m3-outline-variant, var(--pt-border-light));
  margin-top: 4px;
}

.primary-btn {
  min-height: var(--touch-target-min, 44px);
  padding: 8px 16px;
  background: var(--m3-primary, var(--brand-primary));
  color: var(--neutral-0);
  border: none;
  border-radius: 8px;
  font-size: 0.875rem;
}

.primary-btn:disabled {
  opacity: 0.5;
}

.secondary-btn {
  min-height: var(--touch-target-min, 44px);
  padding: 8px 16px;
  background: var(--neutral-0);
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
  border: 1px solid var(--m3-outline-variant, var(--pt-border-strong));
  border-radius: 8px;
  font-size: 0.875rem;
}
</style>
