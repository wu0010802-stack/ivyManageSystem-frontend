<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    title="批次產生場次"
    width="720px"
    :close-on-click-modal="false"
    @open="onOpen"
  >
    <el-form label-width="90px">
      <el-form-item label="課程" required>
        <div class="course-picker">
          <el-select
            v-model="selectedCourseIds"
            multiple
            collapse-tags
            collapse-tags-tooltip
            filterable
            placeholder="選擇課程"
            style="flex: 1"
            @change="schedulePreview"
          >
            <el-option v-for="c in courses" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
          <el-button link type="primary" @click="selectAllCourses">本學期全部課程</el-button>
        </div>
      </el-form-item>

      <el-form-item label="日期範圍" required>
        <div class="range-row">
          <el-date-picker
            :model-value="displayStartDate"
            type="date"
            placeholder="起始日期"
            value-format="YYYY-MM-DD"
            style="width: 150px"
            @update:model-value="onStartDateChange"
          />
          <span class="range-sep">～</span>
          <el-date-picker
            :model-value="displayEndDate"
            type="date"
            placeholder="結束日期"
            value-format="YYYY-MM-DD"
            style="width: 150px"
            @update:model-value="onEndDateChange"
          />
          <el-tag v-if="preview?.range_source === 'term'" size="small" type="success" effect="plain">
            已自動帶入本學期起訖
          </el-tag>
        </div>
      </el-form-item>

      <el-form-item label="上課星期">
        <el-select
          v-model="weekdayOverride"
          placeholder="各課程依自己的設定（不覆寫）"
          clearable
          style="width: 100%"
          @change="schedulePreview"
        >
          <el-option v-for="w in weekdayOptions" :key="w.value" :label="w.label" :value="w.value" />
        </el-select>
      </el-form-item>

      <el-form-item label="國定假日">
        <el-switch
          v-model="skipHolidays"
          active-text="略過國定假日"
          inline-prompt
          @change="schedulePreview"
        />
      </el-form-item>

      <el-form-item label="備註">
        <el-input v-model="notes" type="textarea" :rows="2" />
      </el-form-item>
    </el-form>

    <el-alert
      v-if="preview && !preview.calendar_synced && skipHolidays"
      type="warning"
      :closable="false"
      show-icon
      title="本年度行政院行事曆尚未同步，未排除國定假日"
      description="請先到「行事曆」頁同步，或產生後自行檢查落在假日的場次。"
      style="margin-bottom: 12px"
    />
    <el-alert
      v-if="previewError"
      type="error"
      :closable="false"
      show-icon
      :title="previewError"
      style="margin-bottom: 12px"
    />

    <el-table
      v-if="preview && !previewError"
      v-loading="previewLoading"
      :data="preview.courses"
      border
      size="small"
      :row-key="rowKey"
      :expand-row-keys="expandedRowKeys"
      @expand-change="onExpandChange"
    >
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="date-tags">
            <span v-if="!row.dates.length" class="muted">無可產生的日期</span>
            <el-check-tag
              v-for="d in row.dates"
              :key="d.date"
              :checked="isDateChecked(row.course_id, d)"
              :class="['date-tag', `date-tag--${d.status}`]"
              :disabled="d.status !== 'new'"
              @change="toggleDate(row.course_id, d)"
            >
              {{ formatDateLabel(d) }}
            </el-check-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="課程" prop="course_name" min-width="120" />
      <el-table-column label="上課星期" width="120">
        <template #default="{ row }">
          <span v-if="row.weekdays.length">{{ row.weekdays.map(weekdayLabel).join('、') }}</span>
          <span v-else class="muted">未設定</span>
        </template>
      </el-table-column>
      <el-table-column label="將建立" min-width="220">
        <template #default="{ row }">
          <span v-if="row.warning" class="warning-text">{{ row.warning }}</span>
          <span v-else>
            <strong class="new-count">{{ selectedCountOf(row) }}</strong> 場
            <span v-if="row.exists_count" class="muted"> · 已存在 {{ row.exists_count }}</span>
            <span v-if="row.holiday_count" class="muted"> · 假日略過 {{ row.holiday_count }}</span>
            <span v-if="sessionsHint(row)" class="muted"> · {{ sessionsHint(row) }}</span>
          </span>
        </template>
      </el-table-column>
    </el-table>

    <template #footer>
      <span class="footer-total">共將建立 {{ totalSelected }} 場</span>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="submitLoading"
        :disabled="totalSelected === 0"
        @click="handleSubmit"
      >產生場次</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import {
  previewAttendanceSessionsBatch,
  createAttendanceSessionsBatch,
} from '@/api/activity'
import type { Schema } from '@/api/_generated/typed'

type PreviewOut = Schema<'ActivitySessionBatchPreviewOut'>
type PreviewCourse = Schema<'ActivitySessionPreviewCourseOut'>
type PreviewDate = Schema<'ActivitySessionPreviewDateOut'>

interface CourseOption { id: number; name: string }

const props = defineProps<{
  modelValue: boolean
  courses: CourseOption[]
  /** 開啟時預選的課程（點名頁的課程篩選）；未給則全選 */
  defaultCourseId?: number | null
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: []
}>()

const weekdayOptions = [
  { value: 0, label: '每週一' },
  { value: 1, label: '每週二' },
  { value: 2, label: '每週三' },
  { value: 3, label: '每週四' },
  { value: 4, label: '每週五' },
  { value: 5, label: '每週六' },
  { value: 6, label: '每週日' },
]
const WEEKDAY_SHORT = ['一', '二', '三', '四', '五', '六', '日']
const PREVIEW_DEBOUNCE_MS = 300

const selectedCourseIds = ref<number[]>([])
// null = 交給後端取學期起訖（前端沒有學期起訖日的來源，後端未開 academic_terms 端點）
const startDate = ref<string | null>(null)
const endDate = ref<string | null>(null)
const weekdayOverride = ref<number | null>(null)
const skipHolidays = ref(true)
const notes = ref('')

const preview = ref<PreviewOut | null>(null)
const previewLoading = ref(false)
const previewError = ref<string | null>(null)
const submitLoading = ref(false)
const expandedRowKeys = ref<string[]>([])
// 使用者手動取消勾選的日期，key = `${course_id}|${date}`
const excludedDates = ref<Set<string>>(new Set())

let debounceTimer: ReturnType<typeof setTimeout> | null = null
// 亂序回應守衛：debounce 期間可能連發多次 preview，舊回應晚到會覆蓋新結果
let previewSeq = 0

const displayStartDate = computed(() => startDate.value ?? preview.value?.resolved_start_date ?? null)
const displayEndDate = computed(() => endDate.value ?? preview.value?.resolved_end_date ?? null)

const totalSelected = computed(() =>
  (preview.value?.courses ?? []).reduce((sum, row) => sum + selectedCountOf(row), 0)
)

function onOpen() {
  selectedCourseIds.value = props.defaultCourseId
    ? [props.defaultCourseId]
    : props.courses.map(c => c.id)
  startDate.value = null
  endDate.value = null
  weekdayOverride.value = null
  skipHolidays.value = true
  notes.value = ''
  preview.value = null
  previewError.value = null
  excludedDates.value = new Set()
  expandedRowKeys.value = []
  runPreview()
}

function selectAllCourses() {
  selectedCourseIds.value = props.courses.map(c => c.id)
  schedulePreview()
}

function onStartDateChange(value: string | null) {
  startDate.value = value
  schedulePreview()
}

function onEndDateChange(value: string | null) {
  endDate.value = value
  schedulePreview()
}

function schedulePreview() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(runPreview, PREVIEW_DEBOUNCE_MS)
}

async function runPreview() {
  if (!selectedCourseIds.value.length) {
    preview.value = null
    previewError.value = null
    return
  }
  // 起訖日只有兩者都填才送（後端要求成對），否則交給後端取學期範圍
  const bothDatesGiven = Boolean(startDate.value && endDate.value)
  const seq = ++previewSeq
  previewLoading.value = true
  try {
    const res = await previewAttendanceSessionsBatch({
      course_ids: selectedCourseIds.value,
      ...(bothDatesGiven ? { start_date: startDate.value, end_date: endDate.value } : {}),
      ...(weekdayOverride.value != null ? { weekday: weekdayOverride.value } : {}),
      skip_holidays: skipHolidays.value,
    })
    if (seq !== previewSeq) return // 過時回應 → 丟棄
    preview.value = res.data as PreviewOut
    previewError.value = null
    // 預設展開有可建立日期的課程，讓「哪幾天」一眼看得到
    expandedRowKeys.value = preview.value.courses
      .filter(row => row.new_count > 0)
      .map(row => rowKey(row))
  } catch (e) {
    if (seq !== previewSeq) return
    preview.value = null
    previewError.value = friendlyError('預覽失敗', e)
  } finally {
    if (seq === previewSeq) previewLoading.value = false
  }
}

function dateKey(courseId: number, isoDate: string) {
  return `${courseId}|${isoDate}`
}

function isDateChecked(courseId: number, d: PreviewDate) {
  return d.status === 'new' && !excludedDates.value.has(dateKey(courseId, d.date))
}

function toggleDate(courseId: number, d: PreviewDate) {
  if (d.status !== 'new') return
  const key = dateKey(courseId, d.date)
  const next = new Set(excludedDates.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  excludedDates.value = next
}

function selectedDatesOf(row: PreviewCourse): string[] {
  return row.dates
    .filter(d => isDateChecked(row.course_id, d))
    .map(d => d.date)
}

function selectedCountOf(row: PreviewCourse) {
  return selectedDatesOf(row).length
}

/** el-table 的 row-key / expand-row-keys 都吃字串 */
function rowKey(row: PreviewCourse) {
  return String(row.course_id)
}

function weekdayLabel(weekday: number) {
  return WEEKDAY_SHORT[weekday] ?? String(weekday)
}

function formatDateLabel(d: PreviewDate) {
  if (d.status === 'exists') return `${d.date}（已存在）`
  if (d.status === 'holiday') return `${d.date}（${d.holiday_name || '國定假日'}）`
  return d.date
}

/** 課程堂數設定與實際將產場數不符時的提示（只提示不擋——業主要求照學期產到底） */
function sessionsHint(row: PreviewCourse) {
  const expected = row.expected_sessions
  if (!expected) return ''
  const planned = selectedCountOf(row) + row.exists_count
  return planned === expected ? '' : `課程堂數設定為 ${expected}`
}

function onExpandChange(_row: PreviewCourse, expanded: PreviewCourse[]) {
  expandedRowKeys.value = expanded.map(rowKey)
}

async function handleSubmit() {
  const items = (preview.value?.courses ?? [])
    .map(row => ({ course_id: row.course_id, dates: selectedDatesOf(row) }))
    .filter(item => item.dates.length > 0)
  if (!items.length) {
    ElMessage.warning('沒有可建立的場次')
    return
  }
  submitLoading.value = true
  try {
    const res = await createAttendanceSessionsBatch({
      items,
      ...(notes.value ? { notes: notes.value } : {}),
    })
    const data = res.data as { created_count?: number; skipped_existing?: number }
    const created = data?.created_count ?? 0
    const skipped = data?.skipped_existing ?? 0
    ElMessage.success(`已建立 ${created} 場${skipped ? `，略過 ${skipped} 場（已存在）` : ''}`)
    emit('update:modelValue', false)
    emit('created')
  } catch (e) {
    ElMessage.error(friendlyError('批次產生失敗', e))
  } finally {
    submitLoading.value = false
  }
}

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>

<style scoped>
.course-picker { display: flex; align-items: center; gap: 8px; width: 100%; }
.range-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.range-sep { color: var(--text-tertiary); }
.date-tags { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 12px; }
.date-tag--exists, .date-tag--holiday { opacity: 0.7; cursor: not-allowed; }
.muted { color: var(--text-tertiary); font-size: 12px; }
.warning-text { color: var(--color-warning); font-size: 12px; }
.new-count { color: var(--color-primary-strong); }
.footer-total { float: left; line-height: 32px; color: var(--text-secondary); }
</style>
