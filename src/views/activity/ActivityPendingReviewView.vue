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
      title="以下為家長公開報名時系統無法以『姓名 + 生日 + 家長手機』比對到在籍學生的筆數。請逐筆確認身份後處理。"
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
      empty-text="目前沒有待審核的報名"
      style="width: 100%"
    >
      <el-table-column prop="student_name" label="幼兒姓名" width="110" />
      <el-table-column prop="birthday" label="生日" width="120" />
      <el-table-column prop="parent_phone" label="家長手機" width="130" />
      <el-table-column prop="class_name" label="家長填寫班級" width="150" />
      <el-table-column label="送出時間" width="170">
        <template #default="{ row }">
          {{ formatTime(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="備註" min-width="160" show-overflow-tooltip />
      <el-table-column label="操作" width="320" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click="openMatchDialog(row)">
            手動匹配
          </el-button>
          <el-button size="small" type="warning" @click="handleRematch(row)">
            重新比對
          </el-button>
          <el-button size="small" type="danger" @click="handleReject(row)">
            視為校外生拒絕
          </el-button>
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
    }
    if (filters.school_year != null) params.school_year = filters.school_year
    if (filters.semester != null) params.semester = filters.semester
    if (filters.search?.trim()) params.search = filters.search.trim()

    const res = await listPendingRegistrations(params)
    items.value = res.data?.items || []
    total.value = res.data?.total || 0
  } catch (err) {
    ElMessage.error(err.response?.data?.detail || '載入待審核清單失敗')
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

async function handleRematch(row) {
  try {
    const res = await rematchRegistration(row.id)
    if (res.data?.matched) {
      ElMessage.success('重新比對成功，已自動綁定在校生')
    } else {
      ElMessage.warning('仍無符合的在校生，請考慮手動匹配或拒絕')
    }
    await loadList()
  } catch (err) {
    ElMessage.error(err.response?.data?.detail || '重新比對失敗')
  }
}

async function handleReject(row) {
  try {
    const { value: reason } = await ElMessageBox.prompt(
      `確認將「${row.student_name}」視為校外生或無效資料拒絕？`,
      '拒絕報名',
      {
        inputPlaceholder: '（選填）拒絕原因',
        confirmButtonText: '確認拒絕',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    await rejectRegistration(row.id, reason || '')
    ElMessage.success('已拒絕該筆報名')
    await loadList()
  } catch (err) {
    if (err === 'cancel') return
    ElMessage.error(err.response?.data?.detail || '拒絕失敗')
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
</style>
