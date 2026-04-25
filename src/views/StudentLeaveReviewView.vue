<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listStudentLeaves,
  approveStudentLeave,
  rejectStudentLeave,
} from '@/api/studentLeaves'
import { useClassroomStore } from '@/stores/classroom'
import { apiError } from '@/utils/error'

const STATUS_OPTIONS = [
  { value: 'pending', label: '待審', type: 'warning' },
  { value: 'approved', label: '已核准', type: 'success' },
  { value: 'rejected', label: '已駁回', type: 'danger' },
  { value: 'cancelled', label: '已取消', type: 'info' },
]
const STATUS_MAP = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s]))

const filters = reactive({
  status: 'pending',
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
    ElMessage.error(apiError(error, '載入失敗'))
  } finally {
    loading.value = false
  }
}

const _confirmAndCall = async (row, label, action) => {
  let note = ''
  try {
    const result = await ElMessageBox.prompt(
      `${label}：${row.student_name}（${row.leave_type} ${row.start_date}~${row.end_date}）`,
      `${label}學生請假`,
      {
        confirmButtonText: label,
        cancelButtonText: '取消',
        inputPlaceholder: '備註（可空）',
        inputValidator: () => true,
      },
    )
    note = result?.value || ''
  } catch {
    return
  }
  try {
    await action(row.id, { review_note: note })
    ElMessage.success(`${label}成功`)
    fetchLeaves()
  } catch (error) {
    ElMessage.error(apiError(error, `${label}失敗`))
  }
}

const onApprove = (row) => _confirmAndCall(row, '核准', approveStudentLeave)
const onReject = (row) => _confirmAndCall(row, '駁回', rejectStudentLeave)

const formatDate = (s) => (s ? s.replace(/T.*/, '') : '')

onMounted(() => {
  fetchLeaves()
  classroomStore.fetchClassrooms()
})
</script>

<template>
  <div class="student-leave-review-view">
    <div class="page-header">
      <h2>家長學生請假審核</h2>
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
      <el-table-column label="審核備註" prop="review_note" min-width="180" show-overflow-tooltip />
      <el-table-column label="操作" width="200" align="center" fixed="right">
        <template #default="{ row }">
          <template v-if="row.status === 'pending'">
            <el-button type="success" size="small" @click="onApprove(row)">核准</el-button>
            <el-button type="danger" size="small" @click="onReject(row)">駁回</el-button>
          </template>
          <template v-else-if="row.status === 'approved'">
            <el-button type="warning" size="small" @click="onReject(row)">改判駁回</el-button>
          </template>
          <span v-else class="text-muted">—</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.student-leave-review-view {
  padding: 0;
}

.page-header {
  margin-bottom: 16px;
}

.filter-bar {
  margin-bottom: 16px;
}

.text-muted {
  color: #909399;
}
</style>
