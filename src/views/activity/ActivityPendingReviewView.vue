<template>
  <div class="pending-review-view">
    <el-page-header :title="'回報名管理'" @back="goBack">
      <template #content>
        <span class="page-title">才藝報名 · 待審核佇列</span>
      </template>
    </el-page-header>

    <el-alert
      class="info-banner"
      type="info"
      show-icon
      :closable="false"
      title="家長公開報名無法以『姓名 + 生日 + 家長手機』比對到在籍生的筆數集中於此。已拒絕（資料不符）的筆數以深色列顯示，可視需要復原。"
    />

    <el-form inline class="filter-bar">
      <el-form-item label="學年">
        <el-input-number
          v-model="filters.school_year"
          :min="100"
          :max="200"
          controls-position="right"
          style="width: 120px"
        />
      </el-form-item>
      <el-form-item label="學期">
        <el-select v-model="filters.semester" style="width: 120px">
          <el-option :value="1" label="上學期" />
          <el-option :value="2" label="下學期" />
        </el-select>
      </el-form-item>
      <el-form-item label="搜尋">
        <el-input
          v-model="filters.search"
          placeholder="姓名 / 班級 / 家長手機"
          clearable
          @keyup.enter="loadList"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="loadList">套用</el-button>
      </el-form-item>
    </el-form>

    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="items"
      stripe
      border
      :row-class-name="rowClassName"
      empty-text="目前沒有待審核或已拒絕的報名"
      style="width: 100%"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="45" />
      <el-table-column label="狀態" width="110">
        <template #default="{ row }">
          <el-tag
            v-if="isRejected(row)"
            type="danger"
            effect="plain"
          >
            資料不符
          </el-tag>
          <el-tag v-else type="warning" effect="plain">待審核</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="student_name" label="幼兒姓名" width="110" />
      <el-table-column prop="birthday" label="生日" width="120" />
      <el-table-column prop="parent_phone" label="家長手機" width="130" />
      <el-table-column prop="class_name" label="家長填寫班級" width="150" />
      <el-table-column label="時間" width="170">
        <template #default="{ row }">
          {{ formatActivityDate(isRejected(row) ? row.reviewed_at : row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column prop="reviewed_by" label="處理人" width="100" />
      <el-table-column prop="remark" label="備註" min-width="160" show-overflow-tooltip />
      <el-table-column label="操作" width="360" fixed="right">
        <template #default="{ row }">
          <template v-if="!isRejected(row)">
            <el-button size="small" type="primary" @click="openMatchDialog(row)">
              手動匹配
            </el-button>
            <el-button size="small" type="warning" @click="openRematchDialog(row)">
              重新比對
            </el-button>
            <el-button size="small" type="danger" plain @click="openForceDialog(row)">
              強行收件
            </el-button>
            <el-button size="small" type="danger" @click="handleReject(row)">
              拒絕
            </el-button>
          </template>
          <template v-else>
            <el-button size="small" type="success" @click="handleRestore(row)">
              復原至待審核
            </el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[20, 50, 100]"
      layout="total, sizes, prev, pager, next"
      class="pagination"
      @current-change="loadList"
      @size-change="loadList"
    />

    <!-- 批次操作浮動工具列（後端無批次端點 → 前端並發逐筆呼叫彙總結果）-->
    <transition name="batch-bar">
      <div v-if="selectedRows.length > 0" class="batch-toolbar">
        <span class="batch-info">
          已選 {{ selectedRows.length }} 筆（待審 {{ selectedPending.length }} · 已拒 {{ selectedRejected.length }}）
        </span>
        <el-button
          size="small"
          type="danger"
          :loading="batchProcessing"
          :disabled="selectedPending.length === 0"
          @click="handleBatchReject"
        >批次拒絕（{{ selectedPending.length }}）</el-button>
        <el-button
          size="small"
          type="success"
          :loading="batchProcessing"
          :disabled="selectedRejected.length === 0"
          @click="handleBatchRestore"
        >批次復原（{{ selectedRejected.length }}）</el-button>
        <el-button size="small" @click="clearSelection">取消</el-button>
      </div>
    </transition>

    <!-- 手動匹配 dialog -->
    <el-dialog v-model="matchDialog.visible" title="手動匹配在校生" width="640px">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="請務必確認這筆報名就是該生本人（以免資料串接錯誤）。"
        class="dialog-alert"
      />
      <div class="target-info">
        <div><b>家長填寫：</b>{{ matchDialog.row?.student_name }} · {{ matchDialog.row?.birthday }} · {{ matchDialog.row?.parent_phone }}</div>
        <div class="muted">家長填寫班級：{{ matchDialog.row?.class_name || '（未填）' }}</div>
      </div>

      <el-input
        v-model="matchDialog.searchQuery"
        placeholder="輸入姓名 / 學號 / 家長手機搜尋"
        clearable
        @input="debouncedSearch"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>

      <el-table
        v-loading="matchDialog.loading"
        :data="matchDialog.candidates"
        highlight-current-row
        :row-key="(r) => r.id"
        style="margin-top: 12px"
        @current-change="(row) => matchDialog.selected = row"
      >
        <el-table-column prop="student_id" label="學號" width="100" />
        <el-table-column prop="name" label="姓名" width="100" />
        <el-table-column prop="birthday" label="生日" width="120" />
        <el-table-column prop="classroom_name" label="班級" width="110" />
        <el-table-column prop="parent_phone" label="家長手機" />
      </el-table>

      <template #footer>
        <el-button @click="matchDialog.visible = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="!matchDialog.selected"
          @click="confirmMatch"
        >
          確認匹配
        </el-button>
      </template>
    </el-dialog>

    <!-- 編輯欄位 dialog：共用於「重新比對」與「強行收件」，action 決定動作 -->
    <el-dialog
      v-model="editDialog.visible"
      :title="editDialog.action === 'force' ? '強行收件（跳過比對，標記 forced）' : '重新比對（可修正家長填錯的欄位）'"
      width="520px"
    >
      <el-alert
        v-if="editDialog.action === 'force'"
        type="warning"
        :closable="false"
        show-icon
        title="此操作會跳過三欄比對，直接將這筆報名插入正式報名管理，並以「強行收件」標記。常用於校外生或資料永遠無法比對的情境。"
        class="dialog-alert"
      />
      <el-alert
        v-else
        type="info"
        :closable="false"
        show-icon
        title="三欄比對以 姓名 + 生日 + 家長手機 為準。若家長打錯字，校方可直接修正後再比對。"
        class="dialog-alert"
      />
      <el-form label-width="90px" label-position="right">
        <el-form-item label="幼兒姓名">
          <el-input v-model="editDialog.form.name" maxlength="50" />
        </el-form-item>
        <el-form-item label="生日">
          <el-date-picker
            v-model="editDialog.form.birthday"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="家長手機">
          <el-input
            v-model="editDialog.form.parent_phone"
            placeholder="09 開頭 10 碼"
            maxlength="15"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="editDialog.visible = false">取消</el-button>
        <el-button
          :type="editDialog.action === 'force' ? 'danger' : 'primary'"
          :loading="editDialog.submitting"
          @click="confirmEdit"
        >
          {{ editDialog.action === 'force' ? '確認強行收件' : '儲存並重新比對' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import {
  listPendingRegistrations,
  matchRegistration,
  rejectRegistration,
  rematchRegistration,
  forceAcceptRegistration,
  restoreRegistration,
  searchActivityStudents,
} from '@/api/activity'
import type { Schema } from '@/api/_generated/typed'
// Why: 後端回 naive 台灣時間字串，new Date().toLocaleString() 會被瀏覽器時區偏移；
// formatActivityDate 為純字串切片（其他 activity 頁慣例），不經 Date。
import { formatActivityDate } from '@/utils/format'

interface PendingRow { id: number; match_status?: string; student_name?: string; birthday?: string; parent_phone?: string; class_name?: string; reviewed_at?: string; created_at?: string; reviewed_by?: string; remark?: string }
interface StudentCandidate { id: number; student_id?: string; name?: string; birthday?: string; classroom_name?: string; parent_phone?: string }

const router = useRouter()

const filters = reactive<{ school_year: number | undefined; semester: number | undefined; search: string }>({
  school_year: undefined,
  semester: undefined,
  search: '',
})

const items = ref<PendingRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)

// ── 批次操作 ─────────────────────────────────────────────
const tableRef = ref<{ clearSelection: () => void } | null>(null)
const selectedRows = ref<PendingRow[]>([])
const batchProcessing = ref(false)
// 拒絕只能對非已拒列；復原只能對已拒列（各自過濾，互不影響）
const selectedPending = computed(() => selectedRows.value.filter((r) => !isRejected(r)))
const selectedRejected = computed(() => selectedRows.value.filter((r) => isRejected(r)))

function handleSelectionChange(rows: PendingRow[]) {
  selectedRows.value = rows
}
function clearSelection() {
  // el-table 實例提供 clearSelection；測試 stub 可能無此方法 → 防禦呼叫
  if (typeof tableRef.value?.clearSelection === 'function') tableRef.value.clearSelection()
  selectedRows.value = []
}

// 並發逐筆呼叫並彙總成功/失敗數（後端無批次端點）
async function runBatch<T>(rows: T[], fn: (row: T) => Promise<unknown>): Promise<{ ok: number; fail: number }> {
  const results = await Promise.allSettled(rows.map((r) => fn(r)))
  let ok = 0
  let fail = 0
  for (const res of results) {
    if (res.status === 'fulfilled') ok += 1
    else fail += 1
  }
  return { ok, fail }
}

async function handleBatchReject() {
  const targets = selectedPending.value
  if (targets.length === 0) return
  let reason = ''
  try {
    const result = (await ElMessageBox.prompt(
      `將對已選的 ${targets.length} 筆「待審核」報名套用同一拒絕原因（原因將寫入 audit log）。`,
      '批次拒絕',
      {
        inputPlaceholder: '必填：共用拒絕原因（至少 2 字）',
        confirmButtonText: '確認批次拒絕',
        cancelButtonText: '取消',
        type: 'warning',
        inputValidator: (val: string) => {
          const t = (val || '').trim()
          if (t.length < 2) return '請填寫拒絕原因（至少 2 字）'
          if (t.length > 200) return '不得超過 200 字'
          return true
        },
      },
    )) as { value: string }
    reason = result.value.trim()
  } catch {
    return // 取消
  }
  batchProcessing.value = true
  try {
    const { ok, fail } = await runBatch(targets, (row) => rejectRegistration(row.id, reason))
    if (fail === 0) ElMessage.success(`已批次拒絕 ${ok} 筆`)
    else ElMessage.warning(`批次拒絕完成：成功 ${ok} 筆、失敗 ${fail} 筆`)
    clearSelection()
    await loadList()
  } finally {
    batchProcessing.value = false
  }
}

async function handleBatchRestore() {
  const targets = selectedRejected.value
  if (targets.length === 0) return
  try {
    await ElMessageBox.confirm(
      `確認將已選的 ${targets.length} 筆「已拒絕」報名批次復原至待審核？`,
      '批次復原',
      { confirmButtonText: '確認批次復原', cancelButtonText: '取消', type: 'info' },
    )
  } catch {
    return // 取消
  }
  batchProcessing.value = true
  try {
    const { ok, fail } = await runBatch(targets, (row) => restoreRegistration(row.id))
    if (fail === 0) ElMessage.success(`已批次復原 ${ok} 筆`)
    else ElMessage.warning(`批次復原完成：成功 ${ok} 筆、失敗 ${fail} 筆`)
    clearSelection()
    await loadList()
  } finally {
    batchProcessing.value = false
  }
}

const matchDialog = reactive<{
  visible: boolean
  row: PendingRow | null
  searchQuery: string
  candidates: StudentCandidate[]
  selected: StudentCandidate | null
  loading: boolean
}>({
  visible: false,
  row: null,
  searchQuery: '',
  candidates: [],
  selected: null,
  loading: false,
})

const editDialog = reactive<{
  visible: boolean
  action: 'rematch' | 'force'
  row: PendingRow | null
  submitting: boolean
  form: { name: string; birthday: string; parent_phone: string }
}>({
  visible: false,
  action: 'rematch',
  row: null,
  submitting: false,
  form: {
    name: '',
    birthday: '',
    parent_phone: '',
  },
})

function isRejected(row: PendingRow) {
  return row?.match_status === 'rejected'
}

function rowClassName({ row }: { row: PendingRow }) {
  return isRejected(row) ? 'row-rejected' : ''
}

function goBack() {
  router.push({ name: 'activity-registrations' })
}

async function loadList() {
  loading.value = true
  try {
    const params: Record<string, unknown> = {
      skip: (page.value - 1) * pageSize.value,
      limit: pageSize.value,
      status: 'all',
    }
    if (filters.school_year != null) params.school_year = filters.school_year
    if (filters.semester != null) params.semester = filters.semester
    if (filters.search?.trim()) params.search = filters.search.trim()

    const res = await listPendingRegistrations(params)
    const data = res.data as { items?: PendingRow[]; total?: number }
    items.value = data?.items || []
    total.value = data?.total || 0
  } catch (err) {
    const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ElMessage.error(detail || '載入清單失敗')
  } finally {
    loading.value = false
  }
}

function openMatchDialog(row: PendingRow) {
  matchDialog.row = row
  matchDialog.searchQuery = row.student_name || ''
  matchDialog.candidates = []
  matchDialog.selected = null
  matchDialog.visible = true
  if (matchDialog.searchQuery) runSearch()
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
function debouncedSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(runSearch, 250)
}

async function runSearch() {
  const q = matchDialog.searchQuery?.trim()
  if (!q) {
    matchDialog.candidates = []
    return
  }
  matchDialog.loading = true
  try {
    const res = await searchActivityStudents(q, 20)
    matchDialog.candidates = (res.data as { items?: StudentCandidate[] })?.items || []
  } catch (err) {
    const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ElMessage.error(detail || '搜尋學生失敗')
  } finally {
    matchDialog.loading = false
  }
}

async function confirmMatch() {
  if (!matchDialog.row || !matchDialog.selected) return
  try {
    await matchRegistration(matchDialog.row.id, matchDialog.selected.id)
    ElMessage.success('已完成手動匹配')
    matchDialog.visible = false
    await loadList()
  } catch (err) {
    const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ElMessage.error(detail || '匹配失敗')
  }
}

function openEditDialog(row: PendingRow, action: 'rematch' | 'force') {
  editDialog.action = action
  editDialog.row = row
  editDialog.form.name = row.student_name || ''
  editDialog.form.birthday = row.birthday || ''
  editDialog.form.parent_phone = row.parent_phone || ''
  editDialog.visible = true
}
function openRematchDialog(row: PendingRow) {
  openEditDialog(row, 'rematch')
}
function openForceDialog(row: PendingRow) {
  openEditDialog(row, 'force')
}

async function confirmEdit() {
  if (!editDialog.row) return
  const row = editDialog.row
  const payload: Schema<'RegistrationRematchRequest'> = {}
  const name = editDialog.form.name?.trim()
  const birthday = editDialog.form.birthday || ''
  const phone = editDialog.form.parent_phone?.trim()
  if (name && name !== row.student_name) payload.name = name
  if (birthday && birthday !== row.birthday) payload.birthday = birthday
  if (phone && phone !== row.parent_phone) payload.parent_phone = phone

  editDialog.submitting = true
  try {
    if (editDialog.action === 'force') {
      const res = await forceAcceptRegistration(row.id, payload)
      if ((res.data as { field_changed?: boolean })?.field_changed) {
        ElMessage.success('已強行收件並保留修改後的資料')
      } else {
        ElMessage.success('已強行收件（標記：forced）')
      }
    } else {
      const res = await rematchRegistration(row.id, payload)
      const data = res.data as { matched?: boolean; field_changed?: boolean }
      if (data.matched) {
        ElMessage.success('重新比對成功，已自動綁定在校生')
      } else if (data.field_changed) {
        ElMessage.warning('仍無符合的在校生，但已保留修改後的資料')
      } else {
        ElMessage.warning('仍無符合的在校生，請考慮手動匹配或強行收件')
      }
    }
    editDialog.visible = false
    await loadList()
  } catch (err) {
    const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ElMessage.error(detail || '操作失敗')
  } finally {
    editDialog.submitting = false
  }
}

async function handleReject(row: PendingRow) {
  try {
    const result = (await ElMessageBox.prompt(
      `確認將「${row.student_name}」視為資料不符拒絕？（原因將寫入 audit log）`,
      '拒絕報名',
      {
        inputPlaceholder: '必填：拒絕原因（至少 2 字）',
        confirmButtonText: '確認拒絕',
        cancelButtonText: '取消',
        type: 'warning',
        inputValidator: (val: string) => {
          const t = (val || '').trim()
          if (t.length < 2) return '請填寫拒絕原因（至少 2 字）'
          if (t.length > 200) return '不得超過 200 字'
          return true
        },
      }
    )) as { value: string }
    await rejectRegistration(row.id, result.value.trim())
    ElMessage.success('已拒絕該筆報名（同頁可見，需要時可復原）')
    await loadList()
  } catch (err) {
    if (err === 'cancel') return
    const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ElMessage.error(detail || '拒絕失敗')
  }
}

async function handleRestore(row: PendingRow) {
  try {
    await ElMessageBox.confirm(
      `確認將「${row.student_name}」復原至待審核？`,
      '復原報名',
      {
        confirmButtonText: '確認復原',
        cancelButtonText: '取消',
        type: 'info',
      }
    )
    await restoreRegistration(row.id)
    ElMessage.success('已復原至待審核')
    await loadList()
  } catch (err) {
    if (err === 'cancel') return
    const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ElMessage.error(detail || '復原失敗')
  }
}

onMounted(loadList)
</script>

<style scoped>
.pending-review-view {
  padding: 20px;
}
.page-title {
  font-size: 18px;
  font-weight: 600;
  margin-left: 8px;
}
.info-banner {
  margin: 16px 0;
}
.filter-bar {
  margin-bottom: 12px;
}
.pagination {
  margin-top: 16px;
  justify-content: flex-end;
  display: flex;
}
.dialog-alert {
  margin-bottom: 12px;
}
.target-info {
  margin: 8px 0 12px;
  padding: 10px 14px;
  background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 6px;
  font-size: 14px;
}
.target-info .muted {
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  font-size: 13px;
}
/* 已拒絕列：使用 Element Plus 的 disabled/invalid 語彙（淡灰底、次級文字） */
:deep(.el-table__row.row-rejected) > td {
  background: var(--el-fill-color-light, #f5f7fa) !important;
  color: var(--el-text-color-placeholder, #a8abb2);
}
:deep(.el-table__row.row-rejected:hover) > td {
  background: var(--el-fill-color, #eceff5) !important;
}
:deep(.el-table__row.row-rejected) .cell {
  text-decoration: line-through;
  text-decoration-color: var(--el-text-color-placeholder, #a8abb2);
}
:deep(.el-table__row.row-rejected) .el-tag,
:deep(.el-table__row.row-rejected) .el-button {
  text-decoration: none;
}

/* 批次操作浮動工具列（範式對齊 ActivityRegistrationView）*/
.batch-toolbar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--text-primary, #1f2937);
  color: #fff;
  padding: 10px 20px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  z-index: 999;
}
.batch-info { font-size: 14px; }
.batch-bar-enter-active,
.batch-bar-leave-active { transition: all 0.2s ease; }
.batch-bar-enter-from,
.batch-bar-leave-to { opacity: 0; transform: translateX(-50%) translateY(20px); }

@media (max-width: 768px) {
  .batch-toolbar {
    left: 12px;
    right: 12px;
    transform: none;
    flex-wrap: wrap;
    justify-content: center;
  }
  .batch-bar-enter-from,
  .batch-bar-leave-to { opacity: 0; transform: translateY(20px); }
}
</style>
