<script setup lang="ts">
/**
 * ImportPreviewDialog — 匯入打卡記錄對話框
 *
 * Tab A「貼上 / CSV 文字」：
 *   rawText → previewImport（後端解析逐列檢核）→ 顯示預覽表 → 確認匯入 uploadCsv
 *
 * Tab B「上傳 Excel 檔」：
 *   el-upload 直接觸發 uploadFile（後端解析，shift-aware，無逐列預覽）
 *   → 顯示結果 → emit imported + 關閉
 *
 * 注意：Excel 無逐列預覽（後端 Excel 預覽是 follow-up），只顯示最終結果。
 */
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { previewImport, uploadCsv, uploadFile } from '@/api/attendance'
import { useErrorNotify } from '@/composables/useErrorNotify'
import { hasPermission } from '@/utils/auth'

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

// ── Tab A 狀態 ────────────────────────────────────────────────────────────────
const rawText = ref('')
const previewing = ref(false)
const importing = ref(false)

interface PreviewRow {
  row_num: number
  employee_number: string
  employee_name: string
  matched_employee_id: number | null
  date: string
  punch_in: string | null
  punch_out: string | null
  status: string
  check: 'importable' | 'employee_not_found' | 'invalid_date' | 'month_finalized' | 'overwrite'
}

interface PreviewSummary {
  importable: number
  problems: number
  overwrites: number
}

interface PreviewResult {
  summary: PreviewSummary
  rows: PreviewRow[]
  normalized: unknown[]
}

const previewResult = ref<PreviewResult | null>(null)

// ── Tab B 狀態 ────────────────────────────────────────────────────────────────
const uploading = ref(false)

// ── 關閉 / 重設 ───────────────────────────────────────────────────────────────
function closeDialog() {
  emit('update:modelValue', false)
}

function resetState() {
  rawText.value = ''
  previewResult.value = null
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
  try {
    const res = await previewImport({ raw_text: rawText.value })
    previewResult.value = res.data as PreviewResult
  } catch (err) {
    notify(err, 'ImportPreviewDialog.preview', null, { prefix: '預覽失敗' })
  } finally {
    previewing.value = false
  }
}

// ── Tab A: 確認匯入 ───────────────────────────────────────────────────────────
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
    ElMessage.success((res.data as { message?: string }).message || '匯入完成')
    emit('imported', res.data)
    resetState()
    closeDialog()
  } catch (err) {
    notify(err, 'ImportPreviewDialog.import', null, { prefix: '匯入失敗' })
  } finally {
    importing.value = false
  }
}

// ── Tab A: 下載問題清單 ───────────────────────────────────────────────────────
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

// ── Tab B: Excel 上傳 ─────────────────────────────────────────────────────────
async function handleExcelUpload(options: { file: File }) {
  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', options.file)
    const res = await uploadFile(formData)
    ElMessage.success((res.data as { message?: string }).message || '上傳完成')
    emit('imported', res.data)
    resetState()
    closeDialog()
  } catch (err) {
    notify(err, 'ImportPreviewDialog.excel', null, { prefix: '上傳失敗' })
  } finally {
    uploading.value = false
  }
}

// ── check → tag type / label ──────────────────────────────────────────────────
type ElTagType = 'primary' | 'success' | 'warning' | 'danger' | 'info' | undefined

const CHECK_TAG_TYPE: Record<PreviewRow['check'], ElTagType> = {
  importable: 'success',
  overwrite: 'warning',
  employee_not_found: 'danger',
  invalid_date: 'danger',
  month_finalized: 'danger',
}

const CHECK_LABEL: Record<PreviewRow['check'], string> = {
  importable: '可匯入',
  overwrite: '將覆蓋',
  employee_not_found: '找不到員工',
  invalid_date: '日期無效',
  month_finalized: '該月已封存',
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
  CHECK_LABEL,
  CHECK_TAG_TYPE,
  canWrite,
  handleExcelUpload,
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

          <!-- ── 預覽結果 ───────────────────────────────────────────────────── -->
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
        </div>
      </el-tab-pane>

      <!-- ── Tab B: 上傳 Excel 檔 ──────────────────────────────────────────── -->
      <el-tab-pane label="上傳 Excel 檔" name="excel">
        <div class="import-preview-dialog__excel-section">
          <p class="import-preview-dialog__note">
            支援 .xlsx / .xls 格式，後端直接解析（含班次感知）。
            上傳後立即匯入，無逐列預覽。
          </p>
          <el-upload
            drag
            accept=".xlsx,.xls"
            :http-request="handleExcelUpload"
            :show-file-list="false"
            :multiple="false"
            :disabled="uploading"
          >
            <el-icon><span>⬆</span></el-icon>
            <div class="el-upload__text">
              拖曳或 <em>點擊上傳</em> Excel 檔
            </div>
          </el-upload>
          <div v-if="uploading" class="import-preview-dialog__uploading">
            上傳中…
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

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

/* 問題列紅底 */
:deep(.problem-row) {
  background-color: var(--el-color-danger-light-9, #fef0f0);
}
</style>
