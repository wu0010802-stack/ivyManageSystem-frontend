<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getAuditLogs, getAuditLogsMeta, exportAuditLogs } from '@/api/audit'
import { ElMessage } from 'element-plus'

const router = useRouter()

const loading = ref(false)
const exporting = ref(false)
const logs = ref([])
const total = ref(0)

const entityTypes = ref([])
const actionTypes = ref([])

const filters = reactive({
  entity_type: '',
  action: '',
  username: '',
  entity_id: '',
  ip_address: '',
  start_at: '',
  end_at: '',
  page: 1,
  page_size: 50,
})

// entity_type → 前端路由生成函式。只對「有 id 專屬詳情頁」的資源建連結，
// 避免點「#5」卻跳去列表頁這種假導航（其他 entity 只有列表頁）。
const ENTITY_ROUTES = {
  student: (id) => (id ? { path: `/students/profile/${id}` } : null),
}

const buildFilterParams = () => {
  const params = {}
  if (filters.entity_type) params.entity_type = filters.entity_type
  if (filters.action) params.action = filters.action
  if (filters.username) params.username = filters.username
  if (filters.entity_id && filters.entity_type) params.entity_id = filters.entity_id
  if (filters.ip_address) params.ip_address = filters.ip_address
  if (filters.start_at) params.start_at = filters.start_at
  if (filters.end_at) params.end_at = filters.end_at
  return params
}

const fetchMeta = async () => {
  try {
    const res = await getAuditLogsMeta()
    entityTypes.value = res.data.entity_types
    actionTypes.value = res.data.actions
  } catch (error) {
    // meta 抓不到不影響查詢
  }
}

const fetchLogs = async () => {
  loading.value = true
  try {
    const params = {
      ...buildFilterParams(),
      page: filters.page,
      page_size: filters.page_size,
    }
    const res = await getAuditLogs(params)
    logs.value = res.data.items
    total.value = res.data.total
  } catch (error) {
    if (error.response?.status === 403) {
      ElMessage.error('需要管理員權限')
    } else {
      ElMessage.error('載入操作紀錄失敗')
    }
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  if (filters.entity_id && !filters.entity_type) {
    ElMessage.warning('使用「資源 ID」篩選前請先選擇資源類型')
    return
  }
  filters.page = 1
  fetchLogs()
}

const handleReset = () => {
  filters.entity_type = ''
  filters.action = ''
  filters.username = ''
  filters.entity_id = ''
  filters.ip_address = ''
  filters.start_at = ''
  filters.end_at = ''
  filters.page = 1
  fetchLogs()
}

const handlePageChange = (page) => {
  filters.page = page
  fetchLogs()
}

const handlePageSizeChange = (size) => {
  filters.page_size = size
  filters.page = 1
  fetchLogs()
}

const setQuickRange = (kind) => {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const fmt = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

  if (kind === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
    filters.start_at = fmt(start)
    filters.end_at = fmt(now)
  } else if (kind === '7d') {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    filters.start_at = fmt(start)
    filters.end_at = fmt(now)
  } else if (kind === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
    filters.start_at = fmt(start)
    filters.end_at = fmt(now)
  }
  handleSearch()
}

const handleExport = async () => {
  if (total.value === 0) {
    ElMessage.info('目前查詢結果為空，沒有可匯出內容')
    return
  }
  exporting.value = true
  try {
    const res = await exportAuditLogs(buildFilterParams())
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    a.download = `audit_logs_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    ElMessage.success('匯出成功')
  } catch (error) {
    // 超過上限的 400 response 是 blob，要讀取才能看 detail
    if (error.response?.status === 400 && error.response?.data instanceof Blob) {
      try {
        const text = await error.response.data.text()
        const body = JSON.parse(text)
        ElMessage.error(body.detail || '匯出失敗')
      } catch (_) {
        ElMessage.error('匯出失敗')
      }
    } else {
      ElMessage.error(error.response?.data?.detail || '匯出失敗')
    }
  } finally {
    exporting.value = false
  }
}

const getActionTag = (action) => {
  const map = {
    CREATE: { type: 'success', label: '新增' },
    UPDATE: { type: 'warning', label: '修改' },
    DELETE: { type: 'danger', label: '刪除' },
  }
  return map[action] || { type: 'info', label: action }
}

const entityLabelMap = computed(() => {
  const m = {}
  for (const e of entityTypes.value) m[e.value] = e.label
  return m
})

const getEntityLabel = (type) => entityLabelMap.value[type] || type

const formatTime = (iso) => {
  if (!iso) return '-'
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const formatValue = (v) => {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? '是' : '否'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

const hasChanges = (row) => {
  const c = row.changes
  return c && typeof c === 'object' && Object.keys(c).length > 0
}

const resolveRoute = (row) => {
  const fn = ENTITY_ROUTES[row.entity_type]
  if (!fn) return null
  return fn(row.entity_id)
}

const canNavigate = (row) => !!resolveRoute(row)

const goToEntity = (row) => {
  const to = resolveRoute(row)
  if (to) router.push(to)
}

onMounted(async () => {
  await fetchMeta()
  fetchLogs()
})
</script>

<template>
  <div class="audit-page">
    <h2>操作紀錄</h2>

    <el-card class="filter-card">
      <div class="filters">
        <el-select v-model="filters.entity_type" placeholder="資源類型" clearable style="width: 130px;">
          <el-option v-for="et in entityTypes" :key="et.value" :label="et.label" :value="et.value" />
        </el-select>
        <el-select v-model="filters.action" placeholder="操作類型" clearable style="width: 110px;">
          <el-option v-for="at in actionTypes" :key="at.value" :label="at.label" :value="at.value" />
        </el-select>
        <el-input v-model="filters.username" placeholder="使用者名稱" clearable style="width: 140px;" />
        <el-input
          v-model="filters.entity_id"
          :placeholder="filters.entity_type ? '資源 ID' : '資源 ID（先選類型）'"
          :disabled="!filters.entity_type"
          clearable
          style="width: 150px;"
        />
        <el-input v-model="filters.ip_address" placeholder="IP 包含" clearable style="width: 130px;" />
        <el-date-picker
          v-model="filters.start_at"
          type="datetime"
          placeholder="起始時間"
          value-format="YYYY-MM-DDTHH:mm:ss"
          style="width: 180px;"
        />
        <el-date-picker
          v-model="filters.end_at"
          type="datetime"
          placeholder="結束時間"
          value-format="YYYY-MM-DDTHH:mm:ss"
          style="width: 180px;"
        />
        <el-button type="primary" @click="handleSearch">查詢</el-button>
        <el-button @click="handleReset">重置</el-button>
        <el-button :loading="exporting" @click="handleExport">匯出 CSV</el-button>
      </div>
      <div class="quick-ranges">
        <span class="quick-label">快捷時段：</span>
        <el-button size="small" link @click="setQuickRange('today')">今日</el-button>
        <el-button size="small" link @click="setQuickRange('7d')">近 7 日</el-button>
        <el-button size="small" link @click="setQuickRange('month')">本月</el-button>
      </div>
    </el-card>

    <el-table
      :data="logs"
      border
      stripe
      style="width: 100%; margin-top: 20px;"
      v-loading="loading"
      max-height="600"
    >
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="changes-detail">
            <div v-if="hasChanges(row)">
              <div class="diff-header">變更欄位</div>
              <el-table :data="Object.entries(row.changes).map(([f, v]) => ({ field: f, ...v }))" size="small" border>
                <el-table-column prop="field" label="欄位" width="180" />
                <el-table-column label="變更前">
                  <template #default="{ row: r }">
                    <span class="diff-before">{{ formatValue(r.before) }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="變更後">
                  <template #default="{ row: r }">
                    <span class="diff-after">{{ formatValue(r.after) }}</span>
                  </template>
                </el-table-column>
              </el-table>
            </div>
            <div v-else class="no-changes">
              此紀錄未記錄欄位變更詳情（較早的紀錄或未接入 diff 的 endpoint）。
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="時間" width="170">
        <template #default="{ row }">
          <span class="time-text">{{ formatTime(row.created_at) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="username" label="使用者" width="110" />
      <el-table-column label="操作" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="getActionTag(row.action).type" size="small">
            {{ getActionTag(row.action).label }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="資源類型" width="110">
        <template #default="{ row }">{{ getEntityLabel(row.entity_type) }}</template>
      </el-table-column>
      <el-table-column label="資源 ID" width="100">
        <template #default="{ row }">
          <el-button
            v-if="row.entity_id && canNavigate(row)"
            link
            type="primary"
            size="small"
            @click="goToEntity(row)"
          >
            #{{ row.entity_id }}
          </el-button>
          <span v-else>{{ row.entity_id || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="summary" label="摘要" min-width="180" show-overflow-tooltip />
      <el-table-column prop="ip_address" label="IP" width="130" />
    </el-table>

    <div class="pagination-wrapper">
      <el-pagination
        layout="total, sizes, prev, pager, next, jumper"
        :total="total"
        :page-sizes="[20, 50, 100, 200]"
        :page-size="filters.page_size"
        :current-page="filters.page"
        @current-change="handlePageChange"
        @size-change="handlePageSizeChange"
      />
    </div>
  </div>
</template>

<style scoped>
.filter-card {
  margin-bottom: var(--space-4);
}
.filters {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
}
.quick-ranges {
  margin-top: var(--space-2);
  display: flex;
  gap: var(--space-2);
  align-items: center;
}
.quick-label {
  color: var(--text-secondary, #666);
  font-size: var(--text-sm);
}
.pagination-wrapper {
  margin-top: var(--space-4);
  display: flex;
  justify-content: center;
}
.time-text {
  font-size: var(--text-sm);
  font-family: monospace;
}
.changes-detail {
  padding: var(--space-3);
  background: var(--background-secondary, #fafafa);
}
.diff-header {
  margin-bottom: var(--space-2);
  font-weight: 600;
}
.no-changes {
  color: var(--text-secondary, #888);
  padding: var(--space-2);
  font-style: italic;
}
.diff-before {
  color: #c0392b;
  text-decoration: line-through;
  font-family: monospace;
}
.diff-after {
  color: #27ae60;
  font-family: monospace;
  font-weight: 500;
}
</style>
