<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { listStudentLeaves } from '@/api/studentLeaves'
import { useClassroomStore } from '@/stores/classroom'
import { apiError } from '@/utils/error'

const STATUS_OPTIONS = [
  { value: 'approved', label: '已成立', type: 'success' },
  { value: 'cancelled', label: '已取消', type: 'info' },
]
const STATUS_MAP = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s]))

const filters = reactive({
  status: 'approved',
  classroom_id: null,
})
const loading = ref(false)
const items = ref([])
const classroomStore = useClassroomStore()

const fetchLeaves = async () => {
  loading.value = true
  try {
    const params = { status: filters.status, limit: 200 }
    if (filters.classroom_id) params.classroom_id = filters.classroom_id
    const res = await listStudentLeaves(params)
    items.value = res.data?.items || []
  } catch (error) {
    items.value = []
    ElMessage.error(apiError(error, '載入失敗'))
  } finally {
    loading.value = false
  }
}

const formatDate = (s) => (s ? s.replace(/T.*/, '') : '')

onMounted(() => {
  fetchLeaves()
  classroomStore.fetchClassrooms()
})
</script>

<template>
  <div class="student-leaves-list-view">
    <div class="page-header">
      <h2>學生請假紀錄</h2>
      <p class="hint">家長端提交即自動成立，此頁僅供查閱。如需修改考勤請至「學生考勤」介面。</p>
    </div>

    <el-form :inline="true" class="filter-bar">
      <el-form-item label="狀態">
        <el-select v-model="filters.status" style="width: 140px;" @change="fetchLeaves">
          <el-option
            v-for="opt in STATUS_OPTIONS"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="班級">
        <el-select
          v-model="filters.classroom_id"
          clearable
          placeholder="全部班級"
          style="width: 200px;"
          @change="fetchLeaves"
        >
          <el-option
            v-for="c in classroomStore.classrooms"
            :key="c.id"
            :label="c.name"
            :value="c.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="fetchLeaves">重新整理</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="items" v-loading="loading" stripe border style="width: 100%;">
      <el-table-column label="學生" prop="student_name" width="120" />
      <el-table-column label="假別" prop="leave_type" width="80" align="center" />
      <el-table-column label="期間" min-width="200">
        <template #default="{ row }">
          {{ formatDate(row.start_date) }} ~ {{ formatDate(row.end_date) }}
        </template>
      </el-table-column>
      <el-table-column label="原因" prop="reason" min-width="200" show-overflow-tooltip />
      <el-table-column label="狀態" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="STATUS_MAP[row.status]?.type || 'info'" size="small">
            {{ STATUS_MAP[row.status]?.label || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="申請時間" width="180">
        <template #default="{ row }">
          {{ row.created_at ? row.created_at.replace('T', ' ').slice(0, 16) : '' }}
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.student-leaves-list-view {
  padding: 0;
}

.page-header {
  margin-bottom: 16px;
}

.page-header .hint {
  color: #909399;
  font-size: 13px;
  margin-top: 4px;
}

.filter-bar {
  margin-bottom: 16px;
}
</style>
