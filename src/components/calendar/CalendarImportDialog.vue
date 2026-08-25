<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { UploadFile } from 'element-plus'
import { importEventsCommit, importEventsPreview } from '@/api/events'
import { apiError } from '@/utils/error'
import type { ApiBody, ApiResponse } from '@/api/_generated/typed'
import {
  EVENT_CATEGORY_LABELS,
  EVENT_VISIBILITY_LABELS,
  EVENT_VISIBILITY_OPTIONS,
  eventVisibilityTagType,
} from '@/constants/eventVisibility'

type PreviewResponse = ApiResponse<'/events/import-preview', 'post'>
type PreviewRow = PreviewResponse['rows'][number] & {
  /** 家長可見必須由使用者明確確認（預設 false，Excel 值不算確認） */
  parent_visibility_confirmed: boolean
}
type CommitBody = ApiBody<'/events/import-commit', 'post'>

const visible = defineModel<boolean>({ required: true })
const emit = defineEmits<{ imported: [] }>()

const step = ref<'upload' | 'preview'>('upload')
const previewLoading = ref(false)
const committing = ref(false)
const selectedFile = ref<File | null>(null)
const rows = ref<PreviewRow[]>([])
const summary = ref<PreviewResponse['summary'] | null>(null)

const errorRows = computed(() => rows.value.filter((r) => r.errors.length > 0))
const importableRows = computed(() => rows.value.filter((r) => r.errors.length === 0))
const parentRows = computed(() =>
  importableRows.value.filter((r) => r.visibility === 'parent'),
)
const unconfirmedParentRows = computed(() =>
  parentRows.value.filter((r) => !r.parent_visibility_confirmed),
)

const canCommit = computed(
  () =>
    importableRows.value.length > 0
    && unconfirmedParentRows.value.length === 0
    && !committing.value,
)

const reset = () => {
  step.value = 'upload'
  selectedFile.value = null
  rows.value = []
  summary.value = null
}

watch(visible, (v) => {
  if (!v) reset()
})

const onFileChange = (file: UploadFile) => {
  selectedFile.value = (file.raw as File) ?? null
}

const doPreview = async () => {
  if (!selectedFile.value) {
    ElMessage.warning('請先選擇 XLSX 檔案')
    return
  }
  previewLoading.value = true
  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)
    const resp = await importEventsPreview(formData)
    // 安全預設：parent 確認一律從 false 起算（Excel 內容不構成確認）
    rows.value = resp.data.rows.map((r) => ({
      ...r,
      parent_visibility_confirmed: false,
    }))
    summary.value = resp.data.summary
    step.value = 'preview'
  } catch (error) {
    ElMessage.error(apiError(error, '預覽失敗'))
  } finally {
    previewLoading.value = false
  }
}

const onVisibilityChange = (row: PreviewRow) => {
  // 任何切換都重置確認狀態：改成 parent 必須重新明確確認
  row.parent_visibility_confirmed = false
}

const confirmAllParents = () => {
  parentRows.value.forEach((r) => {
    r.parent_visibility_confirmed = true
  })
}

const doCommit = async () => {
  if (!canCommit.value) return
  committing.value = true
  try {
    const payload: CommitBody = {
      rows: importableRows.value.map((r) => ({
        source_row_key: r.source_row_key ?? '',
        title: r.title ?? '',
        start_date: r.start_date ?? '',
        end_date: r.end_date ?? null,
        description: r.description ?? null,
        category: r.category ?? null,
        visibility: r.visibility ?? null,
        academic_year: r.academic_year ?? null,
        semester: r.semester ?? null,
        week_no: r.week_no ?? null,
        owner_employee_no: r.owner_employee_no ?? null,
        event_type: r.event_type ?? null,
        location: r.location ?? null,
        requires_acknowledgment: r.requires_acknowledgment ?? false,
        ack_deadline: r.ack_deadline ?? null,
        parent_visibility_confirmed: r.parent_visibility_confirmed,
      })),
    }
    const resp = await importEventsCommit(payload)
    ElMessage.success(resp.data.message || '匯入完成')
    emit('imported')
    visible.value = false
  } catch (error) {
    ElMessage.error(apiError(error, '匯入失敗'))
  } finally {
    committing.value = false
  }
}

const rowClassName = ({ row }: { row: PreviewRow }) => {
  if (row.errors.length > 0) return 'import-row-error'
  if (row.visibility === 'parent') return 'import-row-parent'
  return ''
}

const dateLabel = (row: PreviewRow) => {
  if (!row.start_date) return '—'
  if (row.end_date && row.end_date !== row.start_date) {
    return `${row.start_date} ~ ${row.end_date}`
  }
  return row.start_date
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="匯入分校行事曆"
    width="960px"
    :close-on-click-modal="false"
  >
    <template v-if="step === 'upload'">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="上傳整理好的行事曆 XLSX（含 source_row_key／start_date／title 等欄位）。系統只會先解析與驗證，不會直接寫入。"
        class="import-hint"
      />
      <el-upload
        drag
        :auto-upload="false"
        :limit="1"
        accept=".xlsx"
        :on-change="onFileChange"
        data-test="import-upload"
      >
        <div class="upload-inner">
          <p>拖曳檔案到這裡，或點擊選擇 .xlsx</p>
          <p v-if="selectedFile" class="file-name">已選：{{ selectedFile.name }}</p>
        </div>
      </el-upload>
    </template>

    <template v-else>
      <div class="summary-bar" v-if="summary" data-test="import-summary">
        <el-tag type="info">共 {{ summary.total }} 列</el-tag>
        <el-tag type="success">可匯入 {{ importableRows.length }}</el-tag>
        <el-tag v-if="errorRows.length" type="danger">
          錯誤 {{ errorRows.length }} 列（不會匯入）
        </el-tag>
        <el-tag v-if="summary.warning_rows" type="warning">
          警告 {{ summary.warning_rows }} 列
        </el-tag>
        <el-tag v-if="summary.duplicates" type="info">
          既有更新 {{ summary.duplicates }} 列
        </el-tag>
        <el-tag v-if="parentRows.length" type="danger" effect="dark">
          家長可見候選 {{ parentRows.length }} 列
        </el-tag>
      </div>

      <el-alert
        v-if="parentRows.length"
        type="warning"
        :closable="false"
        show-icon
        class="import-hint"
        data-test="parent-confirm-alert"
      >
        <template #title>
          標記為「家長」的列不會自動發布——必須逐列勾選確認（或按「全部確認家長列」）。
          未確認前無法送出（尚有 {{ unconfirmedParentRows.length }} 列未確認）。
        </template>
      </el-alert>

      <div class="preview-actions">
        <el-button
          v-if="parentRows.length"
          size="small"
          type="warning"
          data-test="confirm-all-parents"
          @click="confirmAllParents"
        >
          全部確認家長列（{{ parentRows.length }}）
        </el-button>
      </div>

      <el-table
        :data="rows"
        max-height="440"
        size="small"
        :row-class-name="rowClassName"
        data-test="import-preview-table"
      >
        <el-table-column label="#" prop="row_number" width="55" />
        <el-table-column label="日期" width="180">
          <template #default="{ row }">{{ dateLabel(row) }}</template>
        </el-table-column>
        <el-table-column label="分類" width="90">
          <template #default="{ row }">
            {{ EVENT_CATEGORY_LABELS[row.category] || row.category || '—' }}
          </template>
        </el-table-column>
        <el-table-column label="標題" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.title || '—' }}</template>
        </el-table-column>
        <el-table-column label="可見範圍" width="200">
          <template #default="{ row }">
            <div class="vis-cell">
              <el-select
                :model-value="row.visibility"
                size="small"
                style="width: 96px"
                @update:model-value="(v: string) => { row.visibility = v; onVisibilityChange(row) }"
              >
                <el-option
                  v-for="opt in EVENT_VISIBILITY_OPTIONS"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
              <el-checkbox
                v-if="row.visibility === 'parent'"
                v-model="row.parent_visibility_confirmed"
                size="small"
                data-test="parent-confirm-checkbox"
              >
                確認
              </el-checkbox>
              <el-tag
                v-else
                :type="eventVisibilityTagType(row.visibility)"
                size="small"
              >
                {{ EVENT_VISIBILITY_LABELS[row.visibility || ''] }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="負責人" width="110">
          <template #default="{ row }">
            {{ row.owner_employee_name || row.owner_employee_no || '—' }}
          </template>
        </el-table-column>
        <el-table-column label="狀態" min-width="220">
          <template #default="{ row }">
            <div v-if="row.errors.length" class="msg-error" data-test="row-errors">
              <div v-for="(e, i) in row.errors" :key="i">✕ {{ e }}</div>
            </div>
            <div v-if="row.warnings.length" class="msg-warning">
              <div v-for="(w, i) in row.warnings" :key="i">⚠ {{ w }}</div>
            </div>
            <span v-if="!row.errors.length && !row.warnings.length" class="msg-ok">✓</span>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button v-if="step === 'preview'" @click="reset">重新選檔</el-button>
      <el-button
        v-if="step === 'upload'"
        type="primary"
        :loading="previewLoading"
        :disabled="!selectedFile"
        data-test="preview-button"
        @click="doPreview"
      >
        解析預覽
      </el-button>
      <el-button
        v-else
        type="primary"
        :loading="committing"
        :disabled="!canCommit"
        data-test="commit-button"
        @click="doCommit"
      >
        確認匯入（{{ importableRows.length }} 列）
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.import-hint {
  margin-bottom: 12px;
}

.upload-inner {
  padding: 24px 0;
}

.file-name {
  color: var(--el-color-primary);
  margin-top: 8px;
}

.summary-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.preview-actions {
  margin-bottom: 8px;
}

.vis-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.msg-error {
  color: var(--el-color-danger);
  font-size: 12px;
  line-height: 1.5;
}

.msg-warning {
  color: var(--el-color-warning);
  font-size: 12px;
  line-height: 1.5;
}

.msg-ok {
  color: var(--el-color-success);
}

:deep(.import-row-error) {
  background: var(--el-color-danger-light-9);
}

:deep(.import-row-parent) {
  background: var(--el-color-warning-light-9);
}
</style>
