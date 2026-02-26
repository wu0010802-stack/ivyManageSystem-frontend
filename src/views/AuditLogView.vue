<script setup>
import { ref, reactive, onMounted } from 'vue'
import api from '@/api'
import { ElMessage } from 'element-plus'

const loading = ref(false)
const logs = ref([])
const total = ref(0)

const filters = reactive({
  entity_type: '',
  action: '',
  username: '',
  start_date: '',
  end_date: '',
  page: 1,
  page_size: 50,
})

const entityTypes = [
  { value: 'employee', label: '員工' },
  { value: 'student', label: '學生' },
  { value: 'attendance', label: '考勤' },
  { value: 'leave', label: '請假' },
  { value: 'overtime', label: '加班' },
  { value: 'classroom', label: '班級' },
  { value: 'salary', label: '薪資' },
  { value: 'config', label: '系統設定' },
  { value: 'user', label: '使用者' },
  { value: 'meeting', label: '會議' },
  { value: 'announcement', label: '公告' },
  { value: 'calendar', label: '行事曆' },
  { value: 'schedule', label: '班表' },
  { value: 'job_title', label: '職稱' },
]

const actionTypes = [
  { value: 'CREATE', label: '新增' },
  { value: 'UPDATE', label: '修改' },
  { value: 'DELETE', label: '刪除' },
]

const fetchLogs = async () => {
  loading.value = true
  try {
    const params = {
      page: filters.page,
      page_size: filters.page_size,
    }
    if (filters.entity_type) params.entity_type = filters.entity_type
    if (filters.action) params.action = filters.action
    if (filters.username) params.username = filters.username
    if (filters.start_date) params.start_date = filters.start_date
    if (filters.end_date) params.end_date = filters.end_date

    const res = await api.get('/audit-logs', { params })
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
  filters.page = 1
  fetchLogs()
}

const handleReset = () => {
  filters.entity_type = ''
  filters.action = ''
  filters.username = ''
  filters.start_date = ''
  filters.end_date = ''
  filters.page = 1
  fetchLogs()
}

const handlePageChange = (page) => {
  filters.page = page
  fetchLogs()
}

const getActionTag = (action) => {
  const map = {
    CREATE: { type: 'success', label: '新增' },
    UPDATE: { type: 'warning', label: '修改' },
    DELETE: { type: 'danger', label: '刪除' },
  }
  return map[action] || { type: 'info', label: action }
}

const getEntityLabel = (type) => {
  const found = entityTypes.find(e => e.value === type)
  return found ? found.label : type
}

const formatTime = (iso) => {
  if (!iso) return '-'
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

onMounted(() => {
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
        <el-input v-model="filters.username" placeholder="使用者名稱" clearable style="width: 150px;" />
        <el-date-picker v-model="filters.start_date" type="date" placeholder="開始日期" value-format="YYYY-MM-DD" style="width: 150px;" />
        <el-date-picker v-model="filters.end_date" type="date" placeholder="結束日期" value-format="YYYY-MM-DD" style="width: 150px;" />
        <el-button type="primary" @click="handleSearch">查詢</el-button>
        <el-button @click="handleReset">重置</el-button>
      </div>
    </el-card>

    <el-table :data="logs" border stripe style="width: 100%; margin-top: 20px;" v-loading="loading" max-height="600">
      <el-table-column label="時間" width="170">
        <template #default="{ row }">
          <span class="time-text">{{ formatTime(row.created_at) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="username" label="使用者" width="120" />
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
      <el-table-column prop="entity_id" label="資源 ID" width="90" />
      <el-table-column prop="summary" label="摘要" min-width="200" show-overflow-tooltip />
      <el-table-column prop="ip_address" label="IP" width="130" />
    </el-table>

    <div class="pagination-wrapper" v-if="total > filters.page_size">
      <el-pagination
        layout="total, prev, pager, next"
        :total="total"
        :page-size="filters.page_size"
        :current-page="filters.page"
        @current-change="handlePageChange"
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
.pagination-wrapper {
  margin-top: var(--space-4);
  display: flex;
  justify-content: center;
}
.time-text {
  font-size: var(--text-sm);
  font-family: monospace;
}
</style>
