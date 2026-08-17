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
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { previewImport, previewExcel, uploadCsv, uploadFile } from '@/api/attendance'
import type { ApiResponse } from '@/api/_generated/typed'
import { useErrorNotify } from '@/composables/useErrorNotify'
import { hasPermission } from '@/utils/auth'
import { summarizeCsvImportResult } from '@/utils/attendanceImport'

// ── Props / Emits ──────────────────────────────────────────────────────────────
const props = defineProps<{
  modelValue: boolean
  year: number
  month: number
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

// ── Tab A 狀態 ────────────────────────────────────────────────────────────────
const rawText = ref('')

// ── Tab B 狀態 ────────────────────────────────────────────────────────────────
const uploading = ref(false)
/** previewExcel 判定為 legacy 月統計格式時開啟直接匯入退路 */
const legacyExcelFile = ref<File | null>(null)

// ── 關閉 / 重設 ───────────────────────────────────────────────────────────────
function closeDialog() {
  emit('update:modelValue', false)
}

function resetState() {
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
  previewing.value = true
  previewResult.value = null
  legacyExcelFile.value = null
  try {
    const res = await previewImport({
      raw_text: rawText.value,
      year: props.year,
      month: props.month,
    })
    previewResult.value = res.data
  } catch (err) {
    notify(err, 'ImportPreviewDialog.preview', null, { prefix: '預覽失敗' })
  } finally {
    previewing.value = false
  }
}

// ── Tab B: Excel 預覽（P1-1 兩段式）───────────────────────────────────────────
function isLegacyFormatError(err: unknown): boolean {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' && detail.includes('legacy')
}

async function handleExcelUpload(options: { file: File }) {
  uploading.value = true
  previewResult.value = null
  legacyExcelFile.value = null
  try {
    const formData = new FormData()
    formData.append('file', options.file)
    const res = await previewExcel(formData, { year: props.year, month: props.month })
    previewResult.value = res.data
  } catch (err) {
    if (isLegacyFormatError(err)) {
      legacyExcelFile.value = options.file
      ElMessage.warning('此檔為 legacy 月統計格式，無法逐列預覽；可改用直接匯入')
    } else {
      notify(err, 'ImportPreviewDialog.excelPreview', null, { prefix: 'Excel 預覽失敗' })
    }
  } finally {
    uploading.value = false
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
  if (!previewResult.value) return
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
    emit('imported', res.data)
    resetState()
    closeDialog()
  } catch (err) {
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
  const header = '列號,員工編號,姓名,日期,上班,下班,問題類型\n'
  const body = problemRows
    .map(
      (r) =>
        `${r.row_num},${r.employee_number},${r.employee_name},${r.date},${r.punch_in ?? ''},${r.punch_out ?? ''},${r.check}`,
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
            支援 .xlsx / .xls（新格式：部門/編號/姓名/日期/星期/上班時間/下班時間）。
            上傳後先逐列預覽，確認後才匯入。
          </p>
          <el-upload
            drag
            accept=".xlsx,.xls"
            :http-request="handleExcelUpload"
            :show-file-list="false"
            :multiple="false"
            :disabled="uploading || !canWrite"
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
            {{ row.employee_name }}（{{ row.employee_number }}）
          </template>
        </el-table-column>
        <el-table-column label="日期" prop="date" width="110" />
        <el-table-column label="上班" prop="punch_in" width="80" />
        <el-table-column label="下班" prop="punch_out" width="80" />
        <el-table-column label="狀態" prop="status" width="80" />
        <el-table-column label="檢核">
          <template #default="{ row }">
            <el-tag :type="CHECK_TAG_TYPE[row.check as PreviewRow['check']]">
              {{ CHECK_LABEL[row.check as PreviewRow['check']] }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>

      <!-- 操作列 -->
      <div class="import-preview-dialog__confirm-row">
        <el-button
          v-if="canWrite"
          type="primary"
          :loading="importing"
          :disabled="importing || importableCount === 0"
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
