<template>
  <el-drawer
    :model-value="modelValue"
    :title="`重算 ${month} 月出勤`"
    :size="mobile ? '100%' : '520px'"
    append-to-body
    data-test="recalc-drawer"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div class="recalc">
      <p class="recalc__intro">
        依目前的班表、員工上下班時間與員工類型，重新計算 {{ year }} 年 {{ month }} 月已匯入打卡的遲到、早退與缺卡（薪資扣款的依據）。改了上下班時間或班別時段之後用。
      </p>
      <p v-if="loading" role="status">正在試算…</p>
      <div v-else-if="loadError" class="recalc__error" role="alert">
        <p>{{ loadError }}</p>
        <el-button data-test="recalc-retry" @click="loadPreview">重試</el-button>
      </div>
      <template v-else-if="preview">
        <p class="recalc__summary" data-test="recalc-summary">{{ summary }}</p>
        <ul v-if="preview.changed_rows > 0" class="recalc__notes">
          <li>遲到早退改變的那天，原本的接受扣款／豁免會失效，要重新處理。</li>
          <li>重算後會標記該月薪資需要重新計算。</li>
        </ul>

        <section v-if="changed.length" class="recalc__section" data-test="recalc-changed">
          <h3>會改變（{{ changed.length }} 人）</h3>
          <details v-for="r in changed" :key="r.employee_id" class="recalc__person" :data-test="`recalc-person-${r.employee_id}`">
            <summary>
              <strong>{{ r.employee_name }}</strong>
              <span class="recalc__count">{{ r.changes.length }} 天</span>
              <span v-if="r.confirmations_cleared" class="recalc__cleared">{{ r.confirmations_cleared }} 天原本的接受扣款／豁免會失效</span>
            </summary>
            <ul class="recalc__days">
              <li v-for="c in r.changes" :key="c.date">{{ formatMonthDay(c.date) }}：{{ recalcFlagsText(c.before) }} → {{ recalcFlagsText(c.after) }}</li>
            </ul>
          </details>
        </section>

        <section v-if="failedPeople.length" class="recalc__section" data-test="recalc-failed">
          <h3>重算時出錯（{{ failedPeople.length }} 人）</h3>
          <p class="recalc__failed">{{ failedPeople.map((r) => r.employee_name).join('、') }}：可能有人正在處理他們的出勤或薪資，稍後再試一次。</p>
        </section>

        <section v-if="skippedPeople.length || skippedDays.length" class="recalc__section" data-test="recalc-skipped">
          <h3>不會重算</h3>
          <ul class="recalc__days">
            <li v-for="r in skippedPeople" :key="`p-${r.employee_id}`">{{ r.employee_name }}：{{ SKIP_PERSON[r.code ?? ''] ?? '略過' }}</li>
            <li v-for="d in skippedDays" :key="`d-${d.employeeId}-${d.date}`">{{ d.name }} {{ formatMonthDay(d.date) }}：{{ SKIP_DAY[d.code] }}</li>
          </ul>
        </section>
      </template>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="applying"
        :disabled="loading || !preview || preview.changed_rows === 0"
        data-test="recalc-apply"
        @click="apply"
      >確認重算 {{ preview?.changed_rows ?? 0 }} 天</el-button>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
/**
 * 重算本月出勤：先試算（dry_run）列出每人哪幾天的遲到／早退／缺卡會改、哪些不會重算，確認後才寫入。
 * 後端 POST /attendance/recalculate 逐人一個交易，封存、本人、特休抵銷、需個別核查的請假組合不重算。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { recalculateAttendance } from '@/api/attendance'
import type { ApiResponse } from '@/api/_generated/typed'
import { formatMonthDay } from '@/utils/attendanceConfirm'
import { apiError } from '@/utils/error'

type RecalcOut = ApiResponse<'/attendance/recalculate', 'post'>
type Flags = RecalcOut['results'][number]['changes'][number]['before']

const props = defineProps<{
  modelValue: boolean
  year: number
  month: number
  mobile?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  /** 已正式重算：頁面重抓格子、明細與本月進度 */
  done: []
}>()

const SKIP_PERSON: Record<string, string> = {
  SELF: '本人的出勤要由其他行政人員重算',
  FINALIZED: '該月薪資已封存',
  NOT_EMPLOYED: '已停用或不在在職區間',
}
const SKIP_DAY: Record<string, string> = {
  USE_PTO: '已用特休抵銷，需個別核查',
  LEAVE_CONFLICT: '請假時數或請假組合需個別核查',
  NOT_EMPLOYED: '不在在職區間',
}

/** 一天的扣款相關狀態：「遲到 26 分・缺下班卡」；都沒有就是正常（請假列寫請假） */
function recalcFlagsText(f: Flags): string {
  const parts = [
    f.late_minutes ? `遲到 ${f.late_minutes} 分` : '',
    f.early_leave_minutes ? `早退 ${f.early_leave_minutes} 分` : '',
    f.is_missing_punch_in ? '缺上班卡' : '',
    f.is_missing_punch_out ? '缺下班卡' : '',
  ].filter(Boolean)
  if (parts.length) return parts.join('・')
  return f.status === 'leave' ? '請假' : '正常'
}

const preview = ref<RecalcOut | null>(null)
const loading = ref(false)
const loadError = ref('')
const applying = ref(false)
let seq = 0

async function loadPreview(): Promise<void> {
  const current = ++seq
  loading.value = true
  loadError.value = ''
  preview.value = null
  try {
    const res = await recalculateAttendance({ year: props.year, month: props.month, dry_run: true })
    if (current === seq) preview.value = res.data
  } catch (err) {
    if (current === seq) loadError.value = apiError(err, '試算失敗')
  } finally {
    if (current === seq) loading.value = false
  }
}

// 打開時、或打開中換了月份就重新試算
watch(
  [() => props.modelValue, () => props.year, () => props.month],
  ([open]) => { if (open) void loadPreview() },
  { immediate: true },
)

const changed = computed(() => (preview.value?.results ?? []).filter((r) => r.outcome === 'changed'))
const skippedPeople = computed(() => (preview.value?.results ?? []).filter((r) => r.outcome === 'skipped'))
const failedPeople = computed(() => (preview.value?.results ?? []).filter((r) => r.outcome === 'failed'))
const skippedDays = computed(() =>
  (preview.value?.results ?? []).flatMap((r) => r.skipped_days.map((d) => ({ employeeId: r.employee_id, name: r.employee_name, date: d.date, code: d.code }))),
)
const summary = computed(() => {
  const p = preview.value
  if (!p) return ''
  if (p.changed_rows === 0) return `${props.month} 月已匯入的出勤都和目前的設定一致，不用重算。`
  return `${p.changed_employees} 人、${p.changed_rows} 天的遲到／早退／缺卡會改變。`
})

async function apply(): Promise<void> {
  applying.value = true
  try {
    const res = await recalculateAttendance({ year: props.year, month: props.month, dry_run: false })
    ElMessage.success(`已重算 ${props.month} 月出勤：${res.data.changed_rows} 天改變`)
    // 逐人一個交易：有人出錯（例如等鎖逾時）只有他們沒重算，其他人已完成
    const failed = res.data.results.filter((r) => r.outcome === 'failed').map((r) => r.employee_name)
    if (failed.length) ElMessage.warning(`${failed.join('、')} 重算時出錯，稍後再試一次`)
    emit('done')
    emit('update:modelValue', false)
  } catch (err) {
    ElMessage.error(apiError(err, '重算失敗'))
  } finally {
    applying.value = false
  }
}
</script>

<style scoped>
.recalc { display: grid; gap: var(--space-4); }
.recalc p { margin: 0; }
.recalc__intro { color: var(--el-text-color-regular); font-size: var(--text-sm); line-height: 1.6; }
.recalc__summary { font-weight: 600; }
.recalc__notes { margin: 0; padding-left: var(--space-4); color: var(--el-text-color-secondary); font-size: var(--text-sm); }
.recalc__error { display: grid; justify-items: start; gap: var(--space-2); color: var(--el-color-danger); }
.recalc__section h3 { margin: 0 0 var(--space-2); font-size: var(--text-base); }
.recalc__person { padding: var(--space-2) 0; border-top: 1px solid var(--el-border-color-lighter); }
.recalc__person summary { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 var(--space-2); cursor: pointer; }
.recalc__person summary:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
.recalc__count { color: var(--el-text-color-secondary); font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
.recalc__cleared { color: var(--color-warning-darker); font-size: var(--text-sm); }
.recalc__failed { color: var(--el-color-danger); font-size: var(--text-sm); }
.recalc__days { margin: var(--space-2) 0 0; padding-left: var(--space-4); font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
</style>
