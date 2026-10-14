<script setup lang="ts">
/**
 * ScheduleSwapDialog — 換班申請表單
 *
 * Mobile：使用 TeacherBottomSheet（snap mid/full）
 * Desktop：使用 el-dialog
 *
 * Props：
 *  - modelValue:       v-model 顯示/隱藏
 *  - isMobile:         是否 mobile 模式
 *  - initialDate:      從 cell click 帶入的預設日期（YYYY-MM-DD）
 *  - candidates:       可換班對象清單 [{ employee_id, name, shift_name, work_start, work_end, has_pending_swap }]
 *                      可帶 duty_label（同事當日職務文字）與 same_time（時段與自己相同，SPEC-026 T5）；
 *                      兩者缺席時（day-roster 載入失敗）沿用原本的顯示格式
 *  - candidatesLoading:candidates 載入中
 *  - loading:          submit 中
 *
 * Emits：
 *  - update:modelValue
 *  - date-change(dateStr)    使用者手動改日期時，通知外層重新拉 candidates
 *  - submit({ swap_date, target_id, reason })
 */
import { computed, ref, watch } from 'vue'
import TeacherBottomSheet from '@/components/portal/TeacherBottomSheet.vue'
import { SAME_TIME_HINT } from '@/utils/swapRoster'

interface SwapCandidate { employee_id?: number; name?: string; shift_name?: string; work_start?: string; work_end?: string; has_pending_swap?: boolean; duty_label?: string; same_time?: boolean; unavailable_reason?: string; [key: string]: unknown }

const props = defineProps<{
  modelValue: boolean
  isMobile?: boolean
  initialDate?: string
  candidates?: SwapCandidate[]
  candidatesLoading?: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [val: boolean]
  'date-change': [dateStr: string]
  submit: [payload: { swap_date: string; target_id: number | null; reason: string }]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const form = ref({
  date: '',
  target_id: null,
  reason: '',
})

// 開啟時重設 form，帶入 initialDate
watch(
  () => props.modelValue,
  (opened) => {
    if (opened) {
      form.value = {
        date: props.initialDate || '',
        target_id: null,
        reason: '',
      }
    }
  },
  { immediate: true }
)

const onDateChange = (val: string) => {
  form.value.target_id = null
  emit('date-change', val)
}

// 今天凌晨，用於停用過去日期
const todayMidnight = new Date()
todayMidnight.setHours(0, 0, 0, 0)
const disabledDate = (d: Date) => d < todayMidnight

function submit() {
  if (!canSubmit.value) return
  emit('submit', {
    swap_date: form.value.date,
    target_id: form.value.target_id,
    reason: form.value.reason,
  })
}

// 候選會先顯示、day-roster 較晚才補註：使用者可能已選了某位，事後才被標為不可選 → 不可送出。
const targetUnavailable = computed(
  () => !!props.candidates?.find((c) => c.employee_id === form.value.target_id)?.unavailable_reason,
)
const canSubmit = computed(
  () => !!form.value.date && !!form.value.target_id && !targetUnavailable.value,
)

// 選項文字：有 duty_label（day-roster 的有效班別）就用它，否則維持原本的 shift_name＋時段格式；
// 對方當天沒有排定班別（unavailable_reason）→ 停用並顯示原因；時段與自己相同者加註「不用登記」（換了也沒差）。
function optionLabel(c: SwapCandidate): string {
  const duty = c.duty_label ?? `${c.shift_name}${c.work_start ? ' ' + c.work_start + '~' + c.work_end : ''}`
  const note = c.unavailable_reason ?? (c.same_time ? SAME_TIME_HINT : '')
  return `${c.name} (${duty})${note ? `（${note}）` : ''}`
}
</script>

<template>
  <!-- ===== Mobile: TeacherBottomSheet ===== -->
  <TeacherBottomSheet
    v-if="isMobile"
    v-model="visible"
    title="發起換班申請"
    :snap-points="['mid', 'full']"
    default-snap="mid"
  >
    <div class="swap-form">
      <!-- 手機與其他申請表單一致：標籤在上、日期面板貼齊畫面底部（09-03 漏套這張） -->
      <el-form label-position="top">
        <el-form-item label="換班日期" required>
          <el-date-picker
            v-model="form.date"
            popper-class="portal-sheet-picker"
            type="date"
            placeholder="選擇日期"
            value-format="YYYY-MM-DD"
            :disabled-date="disabledDate"
            style="width: 100%"
            @change="onDateChange"
          />
        </el-form-item>
        <el-form-item label="換班對象" required>
          <el-select
            v-model="form.target_id"
            placeholder="選擇老師"
            style="width: 100%"
            :loading="candidatesLoading"
            :disabled="!form.date"
          >
            <el-option
              v-for="c in candidates"
              :key="c.employee_id as number"
              :label="optionLabel(c)"
              :value="c.employee_id as number"
              :disabled="c.has_pending_swap || !!c.unavailable_reason"
            >
              <span>{{ c.name }}</span>
              <span style="float: right; color: var(--text-secondary); font-size: 12px">
                {{ c.duty_label ?? c.shift_name }}
                <span v-if="c.has_pending_swap" style="color: var(--el-color-danger)">(已有換班)</span><span v-if="c.unavailable_reason" style="color: var(--el-color-danger)">・{{ c.unavailable_reason }}</span><span v-else-if="c.same_time" style="color: var(--text-secondary)">・{{ SAME_TIME_HINT }}</span>
              </span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="form.reason" type="textarea" :rows="2" placeholder="選填" />
        </el-form-item>
      </el-form>
    </div>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :disabled="!canSubmit"
        :loading="loading"
        @click="submit"
      >送出申請</el-button>
    </template>
  </TeacherBottomSheet>

  <!-- ===== Desktop: el-dialog ===== -->
  <el-dialog
    v-else
    v-model="visible"
    title="發起換班申請"
    width="500px"
  >
    <el-form label-width="80px">
      <el-form-item label="換班日期">
        <el-date-picker
          v-model="form.date"
          type="date"
          placeholder="選擇日期"
          value-format="YYYY-MM-DD"
          :disabled-date="disabledDate"
          style="width: 100%"
          @change="onDateChange"
        />
      </el-form-item>
      <el-form-item label="換班對象">
        <el-select
          v-model="form.target_id"
          placeholder="選擇老師"
          style="width: 100%"
          :loading="candidatesLoading"
          :disabled="!form.date"
        >
          <el-option
            v-for="c in candidates"
            :key="c.employee_id as number"
            :label="optionLabel(c)"
            :value="c.employee_id as number"
            :disabled="c.has_pending_swap || !!c.unavailable_reason"
          >
            <span>{{ c.name }}</span>
            <span style="float: right; color: var(--text-secondary); font-size: 12px">
              {{ c.duty_label ?? c.shift_name }}
              <span v-if="c.has_pending_swap" style="color: var(--el-color-danger)">(已有換班)</span><span v-if="c.unavailable_reason" style="color: var(--el-color-danger)">・{{ c.unavailable_reason }}</span><span v-else-if="c.same_time" style="color: var(--text-secondary)">・{{ SAME_TIME_HINT }}</span>
            </span>
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="原因">
        <el-input v-model="form.reason" type="textarea" :rows="2" placeholder="選填" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :disabled="!canSubmit"
        :loading="loading"
        @click="submit"
      >送出申請</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.swap-form {
  padding: var(--space-2) 0;
}
</style>
