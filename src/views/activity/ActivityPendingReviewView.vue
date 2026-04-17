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
      v-loading="loading"
      :data="items"
      stripe
      border
      :row-class-name="rowClassName"
      empty-text="目前沒有待審核或已拒絕的報名"
      style="width: 100%"
    >
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
          {{ formatTime(isRejected(row) ? row.reviewed_at : row.created_at) }}
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

<script setup>
import { ref, reactive, onMounted } from 'vue'
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

const router = useRouter()

const filters = reactive({
  school_year: undefined,
  semester: undefined,
  search: '',
})

const items = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)

const matchDialog = reactive({
  visible: false,
  row: null,
  searchQuery: '',
  candidates: [],
  selected: null,
  loading: false,
})

const editDialog = reactive({
  visible: false,
  action: 'rematch', // 'rematch' | 'force'
  row: null,
  submitting: false,
  form: {
    name: '',
    birthday: '',
    parent_phone: '',
  },
})

function isRejected(row) {
  return row?.match_status === 'rejected'
}

function rowClassName({ row }) {
  return isRejected(row) ? 'row-rejected' : ''
}

function goBack() {
  router.push({ name: 'activity-registrations' })
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('zh-TW', { hour12: false })
}

async function loadList() {
  loading.value = true
  try {
    const params = {
      skip: (page.value - 1) * pageSize.value,
      limit: pageSize.value,
      status: 'all',
    }
    if (filters.school_year != null) params.school_year = filters.school_year
    if (filters.semester != null) params.semester = filters.semester
    if (filters.search?.trim()) params.search = filters.search.trim()

    const res = await listPendingRegistrations(params)
    items.value = res.data?.items || []
    total.value = res.data?.total || 0
  } catch (err) {
    ElMessage.error(err.response?.data?.detail || '載入清單失敗')
  } finally {
    loading.value = false
  }
}

function openMatchDialog(row) {
  matchDialog.row = row
  matchDialog.searchQuery = row.student_name || ''
  matchDialog.candidates = []
  matchDialog.selected = null
  matchDialog.visible = true
  if (matchDialog.searchQuery) runSearch()
}

let searchTimer = null
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
    matchDialog.candidates = res.data?.items || []
  } catch (err) {
    ElMessage.error(err.response?.data?.detail || '搜尋學生失敗')
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
    ElMessage.error(err.response?.data?.detail || '匹配失敗')
  }
}

function openEditDialog(row, action) {
  editDialog.action = action
  editDialog.row = row
  editDialog.form.name = row.student_name || ''
  editDialog.form.birthday = row.birthday || ''
  editDialog.form.parent_phone = row.parent_phone || ''
  editDialog.visible = true
}
function openRematchDialog(row) {
  openEditDialog(row, 'rematch')
}
function openForceDialog(row) {
  openEditDialog(row, 'force')
}

async function confirmEdit() {
  if (!editDialog.row) return
  const row = editDialog.row
  const payload = {}
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
      if (res.data?.field_changed) {
        ElMessage.success('已強行收件並保留修改後的資料')
      } else {
        ElMessage.success('已強行收件（標記：forced）')
      }
    } else {
      const res = await rematchRegistration(row.id, payload)
      const data = res.data || {}
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
    ElMessage.error(err.response?.data?.detail || '操作失敗')
  } finally {
    editDialog.submitting = false
  }
}

async function handleReject(row) {
  try {
    const { value: reason } = await ElMessageBox.prompt(
      `確認將「${row.student_name}」視為資料不符拒絕？`,
      '拒絕報名',
      {
        inputPlaceholder: '（選填）拒絕原因',
        confirmButtonText: '確認拒絕',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    await rejectRegistration(row.id, reason || '')
    ElMessage.success('已拒絕該筆報名（同頁可見，需要時可復原）')
    await loadList()
  } catch (err) {
    if (err === 'cancel') return
    ElMessage.error(err.response?.data?.detail || '拒絕失敗')
  }
}

async function handleRestore(row) {
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
    ElMessage.error(err.response?.data?.detail || '復原失敗')
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
</style>
