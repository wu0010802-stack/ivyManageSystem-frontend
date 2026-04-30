<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { getAttendanceByStudent } from '@/api/studentAttendance'
import { apiError } from '@/utils/error'

const props = defineProps({
  studentId: { type: Number, required: true },
  active: { type: Boolean, default: true },
})

const ATTENDANCE_TAG = {
  出席: 'success',
  缺席: 'danger',
  病假: 'warning',
  事假: 'info',
  遲到: 'warning',
}

const items = ref([])
const counts = ref({})
const loading = ref(false)
const loaded = ref(false)

async function fetchData() {
  if (!props.studentId) return
  loading.value = true
  try {
    const res = await getAttendanceByStudent(props.studentId, { limit: 200 })
    items.value = res.data.items || []
    counts.value = res.data.counts || {}
    loaded.value = true
  } catch (e) {
    ElMessage.error(apiError(e, '載入每日出席失敗'))
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.active, props.studentId],
  ([active]) => {
    if (active && !loaded.value) fetchData()
  },
  { immediate: true },
)

defineExpose({ refresh: fetchData })
</script>

<template>
  <div class="attendance-tab">
    <div class="toolbar">
      <div class="stat-row" v-if="counts && Object.keys(counts).length">
        <el-tag
          v-for="(v, k) in counts"
          :key="k"
          :type="ATTENDANCE_TAG[k] || 'info'"
          size="small"
        >{{ k }} {{ v }}</el-tag>
      </div>
      <el-button size="small" :icon="Refresh" @click="fetchData">重新整理</el-button>
    </div>
    <el-empty v-if="!loading && !items.length" description="尚無出席紀錄" />
    <el-table
      v-else
      v-loading="loading"
      :data="items"
      size="small"
      stripe
      max-height="560"
    >
      <el-table-column label="日期" prop="date" width="130" />
      <el-table-column label="狀態" width="100">
        <template #default="{ row }">
          <el-tag :type="ATTENDANCE_TAG[row.status] || 'info'" size="small">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="備註" prop="remark" min-width="200">
        <template #default="{ row }">{{ row.remark || '-' }}</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  gap: 12px;
  flex-wrap: wrap;
}
.stat-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
</style>
