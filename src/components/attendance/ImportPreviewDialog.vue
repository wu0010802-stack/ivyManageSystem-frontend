<script setup lang="ts">
/**
 * ImportPreviewDialog — 匯入打卡記錄對話框
 *
 * Tab A「貼上 / CSV 文字」：
 *   rawText → previewImport（後端解析逐列檢核）→ 共用預覽表 → 確認匯入 uploadCsv
 *
 * Tab B「上傳 Excel 檔」（P1-1 起兩段式）：
 *   el-upload → previewExcel（唯讀逐列檢核，新格式）→ 共用預覽表 → 確認匯入 uploadCsv
 *   legacy 月統計格式無逐列可預覽 → 後端 400，另提供「以 legacy 格式直接匯入」退路
 *
 * 兩條路徑的 confirm 都走 uploadCsv（normalized 列 + year/month），與 preview 同規則。
 */
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { previewImport, previewExcel, uploadCsv, uploadFile, getImportSettings, saveImportSettings } from '@/api/attendance'
import type { ApiResponse } from '@/api/_generated/typed'
import { useErrorNotify } from '@/composables/useErrorNotify'
import { hasPermission } from '@/utils/auth'
import { summarizeCsvImportResult } from '@/utils/attendanceImport'
import { proposeReview, reviewReasons, matchesReviewFilter, punchOptions } from '@/utils/attendanceBatchReview'
import type { ReviewEdit, ReviewAction, ReviewFilter } from '@/utils/attendanceBatchReview'
import { useAttendanceScheduleReview } from '@/composables/useAttendanceScheduleReview'
import { reviewFingerprint, proposeScheduleReview, SCHEDULE_WINDOW_MINUTES } from '@/utils/attendanceScheduleReview'
import { csvRow } from '@/utils/csv'

// ── Props / Emits ──────────────────────────────────────────────────────────────
const props = defineProps<{
  modelValue: boolean
  year: number
  month: number
  sourceContext?: { employee_id: number; employee_name: string; date: string } | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'imported', summary: unknown): void
}>()

// ── 錯誤通知 ───────────────────────────────────────────────────────────────────
const { notify } = useErrorNotify()

// ── 計算標題 ───────────────────────────────────────────────────────────────────
const dialogTitle = computed(() => `匯入打卡記錄 · ${props.year} 年 ${props.month} 月`)

// ── Tab 狀態 ───────────────────────────────────────────────────────────────────
const activeTab = ref<'paste' | 'excel'>('paste')

// ── 預覽結果（Tab A / Tab B 共用）──────────────────────────────────────────────
type PreviewResult = ApiResponse<'/attendance/upload/preview', 'post'>
type PreviewRow = PreviewResult['rows'][number]

const previewResult = ref<PreviewResult | null>(null)
const previewing = ref(false)
const importing = ref(false)
type ImportSettings = ApiResponse<'/attendance/import-settings', 'get'>
const settings = ref<ImportSettings | null>(null)
const selectedFormat = ref<ImportSettings['default_format']>('auto')
const deviceId = ref('default')
const mappings = ref<Record<string, number | undefined>>({})
const settingsLoading = ref(false)
const settingsError = ref('')
const savingSettings = ref(false)
const reviewDirty = ref(false)
const mappingDirty = ref(false)
const manuallyMapped = ref(new Set<string>())
const sourceFile = ref<File | null>(null)
const reviewEdits = ref<Record<number, ReviewEdit>>({})
const reviewFilter = ref<ReviewFilter | 'schedule_eligible' | 'schedule_manual'>('all')
const manualTimeKeys = ref(new Set<string>())
const { hints: scheduleHints, requiredKeys: scheduleRequiredKeys, blockingKeys: scheduleBlockingKeys, loading: scheduleLoading, loaded: scheduleLoaded, completed: scheduleCompleted, total: scheduleTotal, failed: scheduleFailed, invalidate: invalidateSchedule, load: loadSchedule } = useAttendanceScheduleReview()
onBeforeUnmount(() => invalidateSchedule())
const scheduleManualCount = computed(() => Object.values(scheduleHints.value).filter(hint => hint.kind === 'manual').length)
const scheduleEligibleCount = computed(() => Object.values(scheduleHints.value).filter(hint => hint.kind === 'eligible').length)
const unresolvedScheduleCount = computed(() => (previewResult.value?.rows ?? []).filter(row => scheduleBlockingKeys.value.has(reviewFingerprint(row)) && !reviewEdits.value[row.row_num]?.confirmed).length)
function markTimeEdit(row: PreviewRow) { manualTimeKeys.value.add(reviewFingerprint(row)); reviewDirty.value = true }
async function handleLoadSchedule() {
  if (!previewResult.value || busy.value || mappingDirty.value || pendingBatch.value || !hasPermission('ATTENDANCE_READ')) return
  clearReviewSelection()
  await loadSchedule(previewResult.value.rows, props.year, props.month)
}
function scheduleReason(row: PreviewRow): string {
  return scheduleHints.value[reviewFingerprint(row)]?.reason ?? (scheduleRequiredKeys.value.has(reviewFingerprint(row)) ? '先前班表提示需人工核對；建議已清除，可重新載入' : '尚未載入班表建議')
}
const selectedReviewRows = ref<number[]>([])
const pendingBatch = ref<{ action: ReviewAction | 'schedule'; rows: { row: PreviewRow; edit: ReviewEdit | null; error: string }[] } | null>(null)
const batchLabels: Record<ReviewAction | 'schedule', string> = { schedule: '採用班表建議', current: '採用目前結果（保留已調整時間）', in: '只有上班（取最早，下班缺卡）', out: '只有下班（取最晚，上班缺卡）' }
const reviewRows = computed(() => (previewResult.value?.rows ?? []).filter(row => row.review_required || scheduleRequiredKeys.value.has(reviewFingerprint(row))))
const filteredReviewRows = computed(() => reviewRows.value.filter(row => {
  if (reviewFilter.value === 'schedule_eligible') return scheduleHints.value[reviewFingerprint(row)]?.kind === 'eligible'
  if (reviewFilter.value === 'schedule_manual') return scheduleHints.value[reviewFingerprint(row)]?.kind === 'manual' || scheduleRequiredKeys.value.has(reviewFingerprint(row))
  return matchesReviewFilter(row, reviewEdits.value[row.row_num] ?? { punch_in: '', punch_out: '', confirmed: false }, reviewFilter.value)
}))
const selectableReviewRows = computed(() => filteredReviewRows.value.filter(row => punchOptions(row).length > 0))
const allReviewsSelected = computed(() => selectableReviewRows.value.length > 0 && selectableReviewRows.value.every(row => selectedReviewRows.value.includes(row.row_num)))
const batchApplicableCount = computed(() => pendingBatch.value?.rows.filter(entry => entry.edit).length ?? 0)
function clearReviewSelection() { selectedReviewRows.value = []; pendingBatch.value = null }
watch(reviewFilter, clearReviewSelection)
watch(selectableReviewRows, rows => {
  const visible = new Set(rows.map(row => row.row_num))
  selectedReviewRows.value = selectedReviewRows.value.filter(id => visible.has(id))
})
watch(mappings, () => { clearReviewSelection(); invalidateSchedule(); manualTimeKeys.value = new Set() }, { deep: true })
function selectVisibleReviews(event: Event) {
  selectedReviewRows.value = (event.target as HTMLInputElement).checked ? selectableReviewRows.value.map(row => row.row_num) : []
}
function prepareBatch(action: ReviewAction | 'schedule') {
  if (!canWrite.value || busy.value || mappingDirty.value) return
  const rows = selectableReviewRows.value.filter(row => selectedReviewRows.value.includes(row.row_num))
  if (!rows.length) return
  pendingBatch.value = { action, rows: rows.map(row => ({ row, ...(action === 'schedule'
    ? proposeScheduleReview(row, reviewEdits.value[row.row_num]!, scheduleHints.value[reviewFingerprint(row)], manualTimeKeys.value.has(reviewFingerprint(row)))
    : proposeReview(row, reviewEdits.value[row.row_num]!, action)) })) }
}
function confirmBatch() {
  if (!pendingBatch.value || busy.value || !canWrite.value || mappingDirty.value) return
  for (const entry of pendingBatch.value.rows) {
    if (entry.edit) {
      if (pendingBatch.value.action === 'in' || pendingBatch.value.action === 'out') manualTimeKeys.value.add(reviewFingerprint(entry.row))
      reviewEdits.value[entry.row.row_num] = entry.edit; reviewDirty.value = true
    }
  }
  clearReviewSelection()
}
let generation = 0
let settingsGeneration = 0
const busy = computed(() => previewing.value || uploading.value || importing.value || savingSettings.value || scheduleLoading.value)
const isPunchEvents = computed(() => previewResult.value?.import_format === 'punch_events')
const singlePunchCount = computed(() => previewResult.value?.rows.filter(row => row.punches?.length === 1).length ?? 0)
const multiPunchCount = computed(() => previewResult.value?.rows.filter(row => (row.punches?.length ?? 0) > 2).length ?? 0)
const sourceEmployees = computed(() => {
  const entries = new Map<string, string>()
  for (const row of previewResult.value?.rows ?? []) {
    if (row.source_employee_number) entries.set(row.source_employee_number, row.employee_name)
  }
  return [...entries].map(([number, name]) => ({ number, name }))
})
const unmappedCount = computed(() => sourceEmployees.value.filter(entry => !mappings.value[entry.number]).length)
const mappingSuggestions = computed(() => {
  const occupied = new Set(Object.values(mappings.value).filter(Boolean))
  const sourceNames = new Map<string, Set<string>>()
  for (const row of previewResult.value?.rows ?? []) {
    if (!row.source_employee_number) continue
    const names = sourceNames.get(row.source_employee_number) ?? new Set<string>()
    names.add(row.employee_name.trim())
    sourceNames.set(row.source_employee_number, names)
  }
  const candidates = sourceEmployees.value.flatMap(entry => {
    if (mappings.value[entry.number] || manuallyMapped.value.has(entry.number) || sourceNames.get(entry.number)?.size !== 1) return []
    const name = entry.name.trim()
    const matches = settings.value?.employees?.filter(employee => name && employee.name.trim() === name) ?? []
    const employee = matches.length === 1 ? matches[0] : undefined
    return employee && !occupied.has(employee.id) ? [{ number: entry.number, employee }] : []
  })
  return candidates.filter(candidate => candidates.filter(other => other.employee.id === candidate.employee.id).length === 1)
})

function applyMappingSuggestions() {
  if (!canWrite.value || busy.value || !settings.value) return
  for (const suggestion of mappingSuggestions.value) {
    mappings.value[suggestion.number] = suggestion.employee.id
  }
  mappingDirty.value = true
}

function checkLabel(row: PreviewRow): string {
  if (row.check !== 'employee_not_found' || row.import_format !== 'punch_events') return CHECK_LABEL[row.check]
  const number = row.source_employee_number
  const saved = settings.value?.employee_mappings?.find(entry => entry.source_employee_number === number)?.employee_id
  if (number && mappings.value[number] !== saved) return '對照尚未儲存，請儲存並重新預覽'
  return saved ? '已設定對照但找不到員工，請重新選擇' : '尚未設定設備工號對照'
}


function clearPreview() {
  generation++
  invalidateSchedule()
  manualTimeKeys.value = new Set()
  clearReviewSelection()
  reviewFilter.value = 'all'
  previewResult.value = null
  legacyExcelFile.value = null
  reviewEdits.value = {}
  reviewDirty.value = false
  previewing.value = false
  uploading.value = false
}

async function loadSettings() {
  const request = ++settingsGeneration
  settings.value = null
  settingsError.value = ''
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(deviceId.value)) {
    settingsError.value = '設備代號限 1～40 個英文字母、數字、底線或連字號'
    settingsLoading.value = false
    return
  }
  settingsLoading.value = true
  try {
    const res = await getImportSettings({ device_id: deviceId.value })
    if (request !== settingsGeneration || !props.modelValue) return
    settings.value = res.data
    selectedFormat.value = res.data.default_format
    mappingDirty.value = false
    manuallyMapped.value = new Set()
    mappings.value = Object.fromEntries((res.data.employee_mappings ?? []).map(entry => [entry.source_employee_number, entry.employee_id]))
  } catch (err) {
    if (request === settingsGeneration) {
      settingsError.value = '讀取打卡格式設定失敗，請重試後再上傳'
      notify(err, 'ImportPreviewDialog.settings', null, { prefix: '讀取打卡格式設定失敗' })
    }
  } finally {
    if (request === settingsGeneration) settingsLoading.value = false
  }
}


function initializeReview() {
  clearReviewSelection()
  reviewDirty.value = false
  reviewEdits.value = Object.fromEntries((previewResult.value?.rows ?? []).map(row => [row.row_num, {
    punch_in: row.punch_in ?? '', punch_out: row.punch_out ?? '', confirmed: row.review_confirmed ?? false,
  }]))
}

async function handleSaveSettings() {
  if (!canWrite.value || !settings.value || busy.value) return
  savingSettings.value = true
  const request = generation
  try {
    const res = await saveImportSettings({
      default_format: selectedFormat.value, device_id: deviceId.value, version: settings.value.version,
      employee_mappings: Object.entries(mappings.value).flatMap(([number, id]) => id ? [{ source_employee_number: number, employee_id: id }] : []),
    })
    if (request !== generation) return
    settings.value = res.data
    mappingDirty.value = false
    ElMessage.success('已儲存本校打卡格式與工號對照')
    if (sourceFile.value) await handleExcelUpload({ file: sourceFile.value })
  } catch (err) {
    if (request !== generation) return
    if ((err as { response?: { status?: number } })?.response?.status === 409) {
      clearPreview()
      await loadSettings()
      ElMessage.warning('本校設備設定已被其他人更新，已重新讀取，請重新核對工號對照')
    } else notify(err, 'ImportPreviewDialog.saveSettings', null, { prefix: '儲存失敗' })
  } finally { savingSettings.value = false }
}

async function handleReviewPreview() {
  if (!previewResult.value || busy.value || !canWrite.value || mappingDirty.value || pendingBatch.value) return
  clearReviewSelection()
  invalidateSchedule(false)
  reviewFilter.value = 'all'
  const current = previewResult.value
  const records = current.rows.map(row => ({
    department: '', weekday: '', employee_number: row.employee_number, name: row.employee_name,
    date: row.date ?? '', punch_in: reviewEdits.value[row.row_num]?.punch_in || null,
    punch_out: reviewEdits.value[row.row_num]?.punch_out || null,
    import_format: row.import_format, device_id: row.device_id,
    source_employee_number: row.source_employee_number, source_rows: row.source_rows,
    punches: row.punches, review_required: row.review_required || scheduleRequiredKeys.value.has(reviewFingerprint(row)),
    review_confirmed: reviewEdits.value[row.row_num]?.confirmed ?? false,
  }))
  const request = ++generation
  previewing.value = true
  previewResult.value = null
  try {
    const res = await previewImport({ records, year: props.year, month: props.month })
    if (request !== generation) return
    previewResult.value = { ...res.data, import_format: current.import_format, device_id: current.device_id,
      source_count: current.source_count, date_start: current.date_start, date_end: current.date_end }
    initializeReview()
  } catch (err) {
    if (request === generation) {
      previewResult.value = current
      reviewDirty.value = true
      notify(err, 'ImportPreviewDialog.review', null, { prefix: '重新核對失敗，已保留核對結果，請重試' })
    }
  } finally { if (request === generation) previewing.value = false }
}




// ── Tab A 狀態 ────────────────────────────────────────────────────────────────
const rawText = ref('')

// ── Tab B 狀態 ────────────────────────────────────────────────────────────────
const uploading = ref(false)
/** previewExcel 判定為 legacy 月統計格式時開啟直接匯入退路 */
const legacyExcelFile = ref<File | null>(null)

watch(() => [props.modelValue, props.year, props.month], () => {
  clearPreview()
  sourceFile.value = null
  if (props.modelValue) void loadSettings()
  else settingsGeneration++
}, { immediate: true })


// ── 關閉 / 重設 ───────────────────────────────────────────────────────────────
function closeDialog() {
  emit('update:modelValue', false)
}

function resetState() {
  clearPreview()
  mappingDirty.value = false
  sourceFile.value = null
  rawText.value = ''
  previewResult.value = null
  legacyExcelFile.value = null
  activeTab.value = 'paste'
}

function handleClose() {
  resetState()
  closeDialog()
}

// ── Tab A: 預覽 ───────────────────────────────────────────────────────────────
async function handlePreview() {
  if (!rawText.value.trim()) {
    ElMessage.warning('請貼上 CSV 資料')
    return
  }
  clearPreview()
  const request = generation
  previewing.value = true
  try {
    const res = await previewImport({
      raw_text: rawText.value,
      year: props.year,
      month: props.month,
    })
    if (request !== generation) return
    previewResult.value = res.data
    initializeReview()
  } catch (err) {
    if (request !== generation) return
    notify(err, 'ImportPreviewDialog.preview', null, { prefix: '預覽失敗' })
  } finally {
    if (request === generation) previewing.value = false
  }
}

// ── Tab B: Excel 預覽（P1-1 兩段式）───────────────────────────────────────────
function isLegacyFormatError(err: unknown): boolean {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' && detail.includes('legacy')
}

async function handleExcelUpload(options: { file: File }) {
  if (!canWrite.value || settingsError.value) return
  clearPreview()
  const request = generation
  sourceFile.value = options.file
  uploading.value = true
  previewResult.value = null
  legacyExcelFile.value = null
  try {
    const formData = new FormData()
    formData.append('file', options.file)
    const res = await previewExcel(formData, { year: props.year, month: props.month,
      ...(settings.value ? { format: selectedFormat.value, device_id: deviceId.value } : {}),
    })
    if (request !== generation) return
    previewResult.value = res.data
    initializeReview()
  } catch (err) {
    if (request !== generation) return
    if (isLegacyFormatError(err)) {
      legacyExcelFile.value = options.file
      ElMessage.warning('此檔為 legacy 月統計格式，無法逐列預覽；可改用直接匯入')
    } else {
      notify(err, 'ImportPreviewDialog.excelPreview', null, { prefix: 'Excel 預覽失敗' })
    }
  } finally {
    if (request === generation) uploading.value = false
  }
}

// legacy 退路：無逐列預覽，直接上傳（沿用舊行為，僅限 legacy 格式檔）
async function handleLegacyDirectImport() {
  if (!legacyExcelFile.value) return
  importing.value = true
  try {
    const formData = new FormData()
    formData.append('file', legacyExcelFile.value)
    const res = await uploadFile(formData)
    const summary = summarizeCsvImportResult(res.data)
    if (summary.ok) {
      ElMessage.success(summary.text)
    } else {
      ElMessage.warning(summary.text)
    }
    emit('imported', res.data)
    resetState()
    closeDialog()
  } catch (err) {
    notify(err, 'ImportPreviewDialog.legacyImport', null, { prefix: '匯入失敗' })
  } finally {
    importing.value = false
  }
}

// ── 確認匯入（Tab A / Tab B 共用；normalized 列 → uploadCsv）─────────────────
const importableCount = computed(() => {
  if (!previewResult.value) return 0
  return (previewResult.value.summary.importable ?? 0) + (previewResult.value.summary.overwrites ?? 0)
})

async function handleConfirmImport() {
  if (!previewResult.value || !canWrite.value || busy.value || reviewDirty.value || mappingDirty.value || pendingBatch.value || unresolvedScheduleCount.value > 0 || importableCount.value === 0) return
  const request = generation
  const skipped = previewResult.value.summary.problems
  importing.value = true
  try {
    const res = await uploadCsv({
      records: previewResult.value.normalized,
      year: props.year,
      month: props.month,
    })
    // 後端逐列失敗回 200（失敗數在 body results），不可只看 HTTP 狀態報成功
    const summary = summarizeCsvImportResult(res.data)
    if (summary.ok) {
      ElMessage.success(summary.text)
    } else {
      ElMessage.warning(summary.text)
    }
    if (skipped > 0) ElMessage.warning(`${skipped} 筆問題資料未匯入，請修正後重新上傳`)
    emit('imported', res.data)
    if (request === generation) {
      resetState()
      closeDialog()
    }
  } catch (err) {
    if (request !== generation) return
    notify(err, 'ImportPreviewDialog.import', null, { prefix: '匯入失敗' })
  } finally {
    importing.value = false
  }
}

// ── 下載問題清單 ──────────────────────────────────────────────────────────────
function handleDownloadProblems() {
  if (!previewResult.value) return
  const problemRows = previewResult.value.rows.filter(
    (r) => r.check !== 'importable' && r.check !== 'overwrite',
  )
  // 欄位值（姓名、員工編號）來自使用者上傳的 Excel，可含逗號或 `=` 開頭的
  // 公式字串 → 一律經 csvRow 做欄位跳脫 + 公式中和（見 utils/csv.ts）。
  const header = '列號,員工編號,姓名,日期,上班,下班,問題類型\n'
  const body = problemRows
    .map((r) =>
      csvRow([
        r.row_num,
        r.employee_number,
        r.employee_name,
        r.date,
        r.punch_in ?? '',
        r.punch_out ?? '',
        r.check,
      ]),
    )
    .join('\n')
  const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `import-problems-${props.year}-${String(props.month).padStart(2, '0')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── check → tag type / label ──────────────────────────────────────────────────
type ElTagType = 'primary' | 'success' | 'warning' | 'danger' | 'info' | undefined

const CHECK_TAG_TYPE: Record<PreviewRow['check'], ElTagType> = {
  review_required: 'warning',
  importable: 'success',
  overwrite: 'warning',
  employee_not_found: 'danger',
  invalid_date: 'danger',
  month_finalized: 'danger',
  missing_fields: 'danger',
  invalid_time: 'danger',
  equal_punch: 'danger',
  duplicate_row: 'danger',
  month_mismatch: 'danger',
}

const CHECK_LABEL: Record<PreviewRow['check'], string> = {
  review_required: '待人工核對',
  importable: '可匯入',
  overwrite: '將覆蓋',
  employee_not_found: '找不到員工',
  invalid_date: '日期無效',
  month_finalized: '該月已封存',
  missing_fields: '缺必要欄位',
  invalid_time: '時間格式錯誤',
  equal_punch: '上下班時間相同',
  duplicate_row: '同批重複列',
  month_mismatch: '不在選定月份',
}

function rowClassName({ row }: { row: PreviewRow }): string {
  return row.check !== 'importable' && row.check !== 'overwrite' ? 'problem-row' : ''
}

// ── 權限守衛 ──────────────────────────────────────────────────────────────────
const canWrite = computed(() => hasPermission('ATTENDANCE_WRITE'))

// ── 對外暴露（供測試與父元件存取） ───────────────────────────────────────────────
defineExpose({
  dialogTitle,
  previewResult,
  legacyExcelFile,
  CHECK_LABEL,
  CHECK_TAG_TYPE,
  canWrite,
  handleExcelUpload,
  handleConfirmImport,
  handleSaveSettings,
  handleReviewPreview,
  mappings,
  reviewEdits,
})
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="860px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @closed="resetState"
  >
    <el-alert v-if="sourceContext" type="info" :closable="false" show-icon :title="`待補資料：${sourceContext.employee_name} · ${sourceContext.date}`" description="本次從此人員與日期進入；不會自動限制匯入範圍，實際匯入以預覽清單為準，請確認所有人員與日期後再匯入。" />
    <el-tabs v-model="activeTab">
      <!-- ── Tab A: 貼上 / CSV 文字 ────────────────────────────────────────── -->
      <el-tab-pane label="貼上 / CSV 文字" name="paste">
        <div class="import-preview-dialog__paste-section">
          <el-input
            v-model="rawText"
            type="textarea"
            :rows="6"
            placeholder="貼上 CSV / TSV 文字（含標題列），例如：&#10;部門,員工編號,姓名,日期,星期,上班,下班&#10;一年一班,E001,王小明,2026-06-01,一,08:00,17:00"
          />
          <div class="import-preview-dialog__actions">
            <el-button
              type="primary"
              :loading="previewing"
              :disabled="previewing || !rawText.trim()"
              @click="handlePreview"
            >
              預覽核對
            </el-button>
          </div>
        </div>
      </el-tab-pane>

      <!-- ── Tab B: 上傳 Excel 檔（先預覽再確認）──────────────────────────── -->
      <el-tab-pane label="上傳 Excel 檔" name="excel">
        <div class="import-preview-dialog__excel-section">
          <p class="import-preview-dialog__note">
            支援 .xlsx / .xls，每日上下班欄位與逐筆刷卡格式會自動辨識。
            上傳後先逐列預覽，確認後才匯入。
          </p>
          <div class="import-preview-dialog__settings">
            <label>打卡格式
              <select v-model="selectedFormat" :disabled="busy" aria-label="打卡格式" @change="clearPreview">
                <option value="auto">自動辨識</option>
                <option value="daily_columns">每日上下班欄位</option>
                <option value="punch_events">逐筆刷卡</option>
              </select>
            </label>
            <label>設備代號
              <input v-model="deviceId" :disabled="busy" aria-label="設備代號" @change="clearPreview(); loadSettings()" />
            </label>
            <el-button :disabled="busy || !canWrite || !settings" @click="handleSaveSettings">儲存本校預設</el-button>
          </div>
          <div v-if="settingsError" role="alert">
            {{ settingsError }}
            <el-button :disabled="busy || settingsLoading" @click="loadSettings">重新讀取設定</el-button>
          </div>
          <p v-if="settingsLoading" role="status">讀取本校打卡設定中…</p>
          <el-upload
            drag
            accept=".xlsx,.xls"
            :http-request="handleExcelUpload"
            :show-file-list="false"
            :multiple="false"
            :disabled="busy || settingsLoading || !settings || !canWrite"
          >
            <el-icon><span>⬆</span></el-icon>
            <div class="el-upload__text">
              拖曳或 <em>點擊上傳</em> Excel 檔
            </div>
          </el-upload>
          <div v-if="!canWrite" class="import-preview-dialog__note">
            您無 ATTENDANCE_WRITE 權限，僅可檢視
          </div>
          <div v-if="uploading" class="import-preview-dialog__uploading">
            解析預覽中…
          </div>
          <div v-if="legacyExcelFile" class="import-preview-dialog__legacy-row">
            <span class="import-preview-dialog__note">
              「{{ legacyExcelFile.name }}」為 legacy 月統計格式，無逐列預覽。
            </span>
            <el-button
              v-if="canWrite"
              type="warning"
              :loading="importing"
              :disabled="importing"
              @click="handleLegacyDirectImport"
            >
              以 legacy 格式直接匯入
            </el-button>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- ── 預覽結果（Tab A / Tab B 共用）──────────────────────────────────── -->
    <template v-if="previewResult">
      <section v-if="isPunchEvents" class="import-preview-dialog__device" aria-label="逐筆刷卡核對">
        <p>已辨識：逐筆刷卡 · 原始刷卡 {{ previewResult.source_count }} 筆 · {{ previewResult.date_start }} ～ {{ previewResult.date_end }}</p>
        <p>{{ sourceEmployees.length }} 人 · 未對照 {{ unmappedCount }} 人 · 單筆卡 {{ singlePunchCount }} 人日 · 多筆卡 {{ multiPunchCount }} 人日</p>
        <p v-if="unmappedCount > 0" role="status">請先完成 {{ unmappedCount }} 人的員工對照，再儲存並重新預覽。</p>
        <p v-if="mappingDirty" role="status">對照尚未儲存，請按「儲存對照並重新預覽」更新檢核結果。</p>
        <details v-if="settings" :open="unmappedCount > 0 || mappingDirty">
          <summary>設備工號與本校員工對照（首次需人工確認）</summary>
          <p class="import-preview-dialog__note">姓名建議僅使用本校唯一同名員工；請以員工編號確認身分。採用建議後仍須儲存並重新預覽，同名或無建議者請手動選擇。</p>
          <el-button v-if="mappingSuggestions.length" :disabled="busy || !canWrite" @click="applyMappingSuggestions">採用 {{ mappingSuggestions.length }} 筆同名建議</el-button>
          <div v-for="entry in sourceEmployees" :key="entry.number" class="import-preview-dialog__mapping">
            <label :for="`mapping-${entry.number}`">{{ entry.number }} · {{ entry.name }}</label>
            <select :id="`mapping-${entry.number}`" v-model="mappings[entry.number]" @change="mappingDirty = true; manuallyMapped.add(entry.number)" :disabled="busy || !canWrite">
              <option :value="undefined">尚未對照</option>
              <option v-for="employee in settings.employees" :key="employee.id" :value="employee.id">{{ employee.name }}（{{ employee.employee_number }}）</option>
            </select>
            <span v-if="mappingSuggestions.find(suggestion => suggestion.number === entry.number)" class="import-preview-dialog__note">
              建議：{{ mappingSuggestions.find(suggestion => suggestion.number === entry.number)?.employee.name }}（{{ mappingSuggestions.find(suggestion => suggestion.number === entry.number)?.employee.employee_number }}）
            </span>
          </div>
          <el-button :disabled="busy || !canWrite" @click="handleSaveSettings">儲存對照並重新預覽</el-button>
        </details>
        <section aria-label="班表輔助判讀" class="import-preview-dialog__schedule">
          <p>班表輔助判讀：上下班各前後 {{ SCHEDULE_WINDOW_MINUTES }} 分鐘（含端點）。僅提供核對建議，不判定遲到、早退或薪資。</p>
          <el-button data-load-schedule :disabled="busy || mappingDirty || !!pendingBatch || !hasPermission('ATTENDANCE_READ')" @click="handleLoadSchedule">{{ scheduleLoaded ? '重新載入班表建議' : '載入班表建議' }}</el-button>
          <p v-if="scheduleLoading" role="status">讀取班表中：{{ scheduleCompleted }}／{{ scheduleTotal }} 位員工；完成前暫停匯入。</p>
          <p v-if="scheduleLoaded" role="status">班表建議可採用 {{ scheduleEligibleCount }} 個人日；班表需人工 {{ scheduleManualCount }} 個人日。正常兩筆且符合班表者不另外加入核對表；後端已列為問題的紀錄仍依原規則略過。</p>
          <p v-if="scheduleFailed" role="alert">{{ scheduleFailed }} 位員工班表讀取失敗；已保留人工調整，可重試或人工核對。<el-button data-retry-schedule :disabled="busy || mappingDirty" @click="handleLoadSchedule">重試班表建議</el-button></p>
          <p v-if="unresolvedScheduleCount" role="status">原可匯入紀錄中另有 {{ unresolvedScheduleCount }} 個人日尚待班表人工核對，完成核對並重新預覽前不能匯入。</p>
        </section>
        <details v-if="reviewRows.length">
          <summary>核對單筆、多筆或重複刷卡</summary>
          <p class="import-preview-dialog__note">選擇實際上下班時間；缺卡的一側請保留空白。原始刷卡與來源列號均保留。</p>
          <label>篩選核對紀錄
            <select v-model="reviewFilter" aria-label="篩選核對紀錄" :disabled="busy || !!pendingBatch">
              <option value="all">全部</option><option value="multi">多筆</option><option value="single">單筆</option><option value="duplicate">重複刷卡</option><option value="unconfirmed">未核對</option><option value="schedule_eligible">班表建議可採用</option><option value="schedule_manual">班表需人工</option>
            </select>
          </label>
          <p role="status">顯示 {{ filteredReviewRows.length }} 個人日，已選 {{ selectedReviewRows.length }} 個人日；全選僅包含目前篩選結果。</p>
          <div class="import-preview-dialog__review-scroll">
            <table class="import-preview-dialog__review-table">
              <caption>刷卡核對清單（時間僅為建議，請依實際出勤確認）</caption>
              <thead><tr><th><input type="checkbox" aria-label="全選目前篩選結果" :checked="allReviewsSelected" :indeterminate="selectedReviewRows.length > 0 && !allReviewsSelected" :disabled="busy || !canWrite || mappingDirty || !!pendingBatch || !selectableReviewRows.length" @change="selectVisibleReviews" /></th><th>員工／日期</th><th>原始刷卡／來源列</th><th>原因／班表提示</th><th>上班</th><th>下班</th><th>核對</th></tr></thead>
              <tbody><tr v-for="row in filteredReviewRows" :key="row.row_num" :data-review-row="row.row_num">
                <td><input v-model="selectedReviewRows" :value="row.row_num" type="checkbox" :aria-label="`選取 ${row.employee_name} ${row.date}`" :disabled="busy || !canWrite || mappingDirty || !!pendingBatch || !punchOptions(row).length" /></td>
                <td>{{ row.employee_name }}<br />{{ row.date }}<br /><small>{{ row.source_employee_number }}</small></td>
                <td>{{ row.punches?.map(time => time.slice(11)).join('、') }}<br /><small>來源列 {{ row.source_rows?.join('、') }}</small></td>
                <td>{{ reviewReasons(row).join('、') || checkLabel(row) }}<template v-if="scheduleLoaded || scheduleRequiredKeys.has(reviewFingerprint(row))"><br /><small>{{ scheduleHints[reviewFingerprint(row)]?.schedule || '班表未提供' }}</small><br />{{ scheduleReason(row) }}</template></td>
                <td><select v-model="reviewEdits[row.row_num]!.punch_in" :aria-label="`${row.employee_name} ${row.date} 上班`" @change="markTimeEdit(row)" :disabled="busy || !canWrite || mappingDirty || !!pendingBatch"><option value="">缺卡</option><option v-for="time in punchOptions(row)" :key="time" :value="time">{{ time }}</option></select></td>
                <td><select v-model="reviewEdits[row.row_num]!.punch_out" :aria-label="`${row.employee_name} ${row.date} 下班`" @change="markTimeEdit(row)" :disabled="busy || !canWrite || mappingDirty || !!pendingBatch"><option value="">缺卡</option><option v-for="time in punchOptions(row)" :key="time" :value="time">{{ time }}</option></select></td>
                <td><label><input v-model="reviewEdits[row.row_num]!.confirmed" @change="reviewDirty = true" type="checkbox" :disabled="busy || !canWrite || mappingDirty || !!pendingBatch" />已人工核對</label></td>
              </tr></tbody>
            </table>
          </div>
          <div class="import-preview-dialog__settings">
            <el-button v-for="(label, action) in batchLabels" :key="action" :data-batch-action="action" :disabled="busy || !canWrite || mappingDirty || !!pendingBatch || !selectedReviewRows.length || (action === 'schedule' && !scheduleLoaded)" @click="prepareBatch(action)">{{ label }}</el-button>
          </div>
          <section v-if="pendingBatch" aria-label="批次核對確認" class="import-preview-dialog__batch-confirm">
            <p>選取 {{ pendingBatch.rows.length }} 個人日；將套用 {{ batchApplicableCount }} 個人日，略過 {{ pendingBatch.rows.length - batchApplicableCount }} 個人日。</p>
            <p>規則：{{ batchLabels[pendingBatch.action] }}。請核對下列結果；此操作尚未匯入。</p>
            <ul><li v-for="entry in pendingBatch.rows" :key="entry.row.row_num">{{ entry.row.employee_name }} · {{ entry.row.date }}：<template v-if="entry.edit">上班 {{ entry.edit.punch_in || '缺卡' }}／下班 {{ entry.edit.punch_out || '缺卡' }}</template><template v-else>略過：{{ entry.error }}</template></li></ul>
            <el-button :disabled="busy || !canWrite || !batchApplicableCount" data-batch-confirm @click="confirmBatch">確認選取的 {{ batchApplicableCount }} 個人日</el-button>
            <el-button data-batch-cancel @click="pendingBatch = null">取消</el-button>
          </section>
          <p v-if="reviewDirty" role="status">核對結果已變更，請重新預覽成功後再確認匯入。</p>
          <el-button :disabled="busy || !canWrite || mappingDirty || !!pendingBatch" @click="handleReviewPreview">依人工核對結果重新預覽</el-button>
        </details>
      </section>
      <!-- Banner -->
      <div class="import-preview-dialog__banner">
        <span class="banner-item banner-item--success">
          可匯入 <strong>{{ previewResult.summary.importable }}</strong> 筆
        </span>
        <span class="banner-item banner-item--danger">
          問題 <strong>{{ previewResult.summary.problems }}</strong> 筆
        </span>
        <span class="banner-item banner-item--warning">
          將覆蓋 <strong>{{ previewResult.summary.overwrites }}</strong> 筆
        </span>
      </div>

      <!-- 預覽表格 -->
      <el-table
        :data="previewResult.rows"
        :row-class-name="rowClassName"
        size="small"
        style="width: 100%; margin-top: 12px"
      >
        <el-table-column label="列號" prop="row_num" width="60" />
        <el-table-column label="員工" width="140">
          <template #default="{ row }">
            {{ row.employee_name }}<span v-if="row.employee_number">（{{ row.employee_number }}）</span>
            <div v-if="row.source_employee_number" class="import-preview-dialog__note">設備工號 {{ row.source_employee_number }}</div>
          </template>
        </el-table-column>
        <el-table-column label="日期" prop="date" width="110" />
        <el-table-column label="上班" prop="punch_in" width="80" />
        <el-table-column label="下班" prop="punch_out" width="80" />
        <el-table-column label="狀態" prop="status" width="80" />
        <el-table-column label="檢核">
          <template #default="{ row }">
            <el-tag :type="CHECK_TAG_TYPE[row.check as PreviewRow['check']]">
              {{ checkLabel(row) }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>

      <p v-if="previewResult.summary.problems > 0" role="status">
        {{ previewResult.summary.problems }} 筆問題資料不會匯入，<template v-if="isPunchEvents">請先完成工號對照與刷卡核對，再重新預覽；其他問題可下載清單查核。</template><template v-else>請先下載問題清單，修正後再重新上傳。</template>
      </p>
      <!-- 操作列 -->
      <div class="import-preview-dialog__confirm-row">
        <el-button
          v-if="canWrite"
          type="primary"
          :loading="importing"
          :disabled="busy || reviewDirty || mappingDirty || !!pendingBatch || unresolvedScheduleCount > 0 || importableCount === 0"
          @click="handleConfirmImport"
        >
          確認匯入 {{ importableCount }} 筆
        </el-button>
        <el-button
          v-if="previewResult.summary.problems > 0"
          @click="handleDownloadProblems"
        >
          下載問題清單
        </el-button>
      </div>
    </template>

    <template #footer>
      <el-button @click="handleClose">關閉</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.import-preview-dialog__paste-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.import-preview-dialog__actions {
  display: flex;
  justify-content: flex-end;
}

.import-preview-dialog__banner {
  display: flex;
  gap: 16px;
  padding: 10px 14px;
  background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 6px;
  font-size: 14px;
  margin-top: 12px;
}

.banner-item strong {
  font-weight: 700;
}

.banner-item--success {
  color: var(--el-color-success, #67c23a);
}

.banner-item--danger {
  color: var(--el-color-danger, #f56c6c);
}

.banner-item--warning {
  color: var(--el-color-warning, #e6a23c);
}

.import-preview-dialog__confirm-row {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
}

.import-preview-dialog__excel-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.import-preview-dialog__note {
  color: var(--el-text-color-secondary, #909399);
  font-size: 13px;
  margin: 0;
}

.import-preview-dialog__uploading {
  text-align: center;
  color: var(--el-color-primary, #409eff);
  font-size: 14px;
}

.import-preview-dialog__legacy-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

/* 問題列紅底 */
:deep(.problem-row) {
  background-color: var(--el-color-danger-light-9, #fef0f0);
}
</style>

<style scoped>
.import-preview-dialog__settings, .import-preview-dialog__mapping {
  display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-block: 8px;
}
.import-preview-dialog__device { padding: 12px; background: var(--el-fill-color-light); }
.import-preview-dialog__device details { margin-block: 12px; }
.import-preview-dialog__review-scroll { overflow-x: auto; max-height: 420px; }
.import-preview-dialog__review-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.import-preview-dialog__review-table th, .import-preview-dialog__review-table td { padding: 8px; text-align: left; border-bottom: 1px solid var(--el-border-color); vertical-align: top; }
.import-preview-dialog__review-table thead { position: sticky; top: 0; background: var(--el-bg-color); }
.import-preview-dialog__batch-confirm { padding: 12px; border: 1px solid var(--el-color-primary); border-radius: 4px; }
.import-preview-dialog__batch-confirm ul { max-height: 240px; overflow-y: auto; }
select, input:not([type="checkbox"]) { padding: 6px; max-width: 100%; border: 1px solid var(--el-border-color); border-radius: 4px; background: var(--el-bg-color); color: var(--el-text-color-primary); }
</style>
