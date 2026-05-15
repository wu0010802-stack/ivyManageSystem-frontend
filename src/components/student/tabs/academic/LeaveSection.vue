<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { listStudentLeaves } from '@/api/studentLeaves'
import { apiError } from '@/utils/error'

const props = defineProps({
  studentId: { type: Number, required: true },
  active: { type: Boolean, default: true },
})

const emit = defineEmits(['jump-attendance'])

const items = ref([])
const loading = ref(false)
const showInactive = ref(false)

async function fetchData() {
  if (!props.studentId) return
  loading.value = true
  try {
    const { data } = await listStudentLeaves({
      student_id: props.studentId,
      page_size: 200,
    })
    items.value = data.items || data || []
  } catch (e) {
    items.value = []
    ElMessage.error(apiError(e, '讀取請假紀錄失敗'))
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.active, props.studentId],
  ([active]) => {
    if (active && props.studentId) fetchData()
  },
  { immediate: true },
)

const visibleItems = computed(() => {
  const list = items.value
  if (showInactive.value) return list
  return list.filter((it) => it.status === 'approved')
})

const STATUS_TAG = {
  approved: 'success',
  pending: 'warning',
  rejected: 'info',
  cancelled: 'info',
}
const STATUS_LABEL = {
  approved: '已核准',
  pending: '待審',
  rejected: '駁回',
  cancelled: '取消',
}

const computeDays = (row) => {
  if (!row?.start_date || !row?.end_date) return '-'
  const start = new Date(row.start_date)
  const end = new Date(row.end_date)
  const days = Math.floor((end - start) / (24 * 3600 * 1000)) + 1
  return `${days} 天`
}

defineExpose({ refresh: fetchData, visibleItems, showInactive })
</script>

<template>
  <div v-loading="loading" class="leave-section">
    <div class="bar">
      <el-checkbox v-model="showInactive" size="small">顯示駁回／取消</el-checkbox>
      <span class="hint">家長端發起，管理端唯讀</span>
      <el-button size="small" link @click="fetchData">重新整理</el-button>
    </div>
    <el-empty v-if="!visibleItems.length && !loading" description="尚無請假紀錄" />
    <el-table v-else :data="visibleItems" stripe size="small" max-height="420">
      <el-table-column label="假別" width="80">
        <template #default="{ row }">
          <el-tag :type="row.leave_type === '病假' ? 'warning' : 'info'" size="small">
            {{ row.leave_type }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="期間" width="220">
        <template #default="{ row }">
          {{ row.start_date }} ~ {{ row.end_date }}
          <span class="sub">（{{ computeDays(row) }}）</span>
        </template>
      </el-table-column>
      <el-table-column label="狀態" width="90">
        <template #default="{ row }">
          <el-tag :type="STATUS_TAG[row.status] || ''" size="small">
            {{ STATUS_LABEL[row.status] || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="原因" min-width="200" prop="reason">
        <template #default="{ row }">
          <span v-if="row.reason">{{ row.reason }}</span>
          <span v-else class="sub">-</span>
        </template>
      </el-table-column>
      <el-table-column label="動作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.status === 'approved'"
            size="small"
            link
            type="primary"
            @click="emit('jump-attendance', { from: row.start_date, to: row.end_date })"
          >
            → 看出席
          </el-button>
          <span v-else class="sub">-</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.leave-section {
  padding: 4px 0;
}
.bar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 10px;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 0.85em;
}
.sub {
  color: var(--el-text-color-secondary);
  font-size: 0.85em;
}
</style>
