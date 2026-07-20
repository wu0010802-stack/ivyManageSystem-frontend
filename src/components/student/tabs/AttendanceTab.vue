<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { getAttendanceByStudent } from '@/api/studentAttendance'
import type { Schema } from '@/api/_generated/typed'
import { apiError } from '@/utils/error'

const props = withDefaults(defineProps<{
  studentId: number
  active?: boolean
  externalDateRange?: [string, string] | null
}>(), {
  active: true,
  externalDateRange: null,
})

type ElTagType = '' | 'primary' | 'success' | 'warning' | 'info' | 'danger'
const ATTENDANCE_TAG: Record<string, ElTagType> = {
  出席: 'success',
  缺席: 'danger',
  病假: 'warning',
  事假: 'info',
  遲到: 'warning',
}

type AttendanceItem = Schema<'StudentAttendanceByStudentItemOut'>

const items = ref<AttendanceItem[]>([])
const counts = ref<Record<string, number>>({})
const loading = ref(false)
const loaded = ref(false)
const filterRange = ref<string[]>([])

let requestSeq = 0
async function fetchData() {
  if (!props.studentId) return
  const seq = ++requestSeq
  const sid = props.studentId
  loading.value = true
  try {
    const res = await getAttendanceByStudent(sid, { limit: 200 })
    if (seq !== requestSeq || props.studentId !== sid) return
    items.value = res.data.items || []
    counts.value = res.data.counts || {}
    loaded.value = true
  } catch (e) {
    if (seq !== requestSeq || props.studentId !== sid) return
    ElMessage.error(apiError(e, '載入每日出席失敗'))
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

// detail panel 切換學生時會重用同一分頁實例，須重置 loaded 並重載；requestSeq
// 防舊學生的慢回應覆寫新學生（同 ActivityTab）。
watch(
  () => props.studentId,
  () => {
    requestSeq += 1
    items.value = []
    counts.value = {}
    loaded.value = false
    loading.value = false
    if (props.active) fetchData()
  },
)
watch(
  () => props.active,
  (active) => {
    if (active && !loaded.value && !loading.value) fetchData()
  },
  { immediate: true },
)

// 接收外部跳轉帶來的區間
watch(
  () => props.externalDateRange,
  (range) => {
    if (range && range.length === 2) {
      filterRange.value = [range[0], range[1]]
    }
  },
  { immediate: true },
)

const filteredItems = computed(() => {
  if (!filterRange.value || filterRange.value.length !== 2) return items.value
  const [from, to] = filterRange.value
  return items.value.filter((r) => (r.date ?? '') >= from && (r.date ?? '') <= to)
})

const isInRange = (date: string | null | undefined) => {
  if (!date || !filterRange.value || filterRange.value.length !== 2) return false
  return date >= filterRange.value[0] && date <= filterRange.value[1]
}

const clearFilter = () => {
  filterRange.value = []
}

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
      <el-date-picker
        v-model="filterRange"
        type="daterange"
        size="small"
        range-separator="至"
        start-placeholder="起"
        end-placeholder="迄"
        value-format="YYYY-MM-DD"
        style="width: 240px"
      />
      <el-button v-if="filterRange?.length === 2" size="small" link @click="clearFilter">清除區間</el-button>
      <el-button size="small" :icon="Refresh" @click="fetchData">重新整理</el-button>
    </div>
    <el-empty v-if="!loading && !filteredItems.length" description="尚無出席紀錄" />
    <el-table
      v-else
      v-loading="loading"
      :data="filteredItems"
      size="small"
      stripe
      max-height="560"
      :row-class-name="({ row }) => (isInRange(row.date) ? 'row-highlight' : '')"
    >
      <el-table-column label="日期" prop="date" width="130" />
      <el-table-column label="狀態" width="100">
        <template #default="{ row }">
          <el-tag :type="ATTENDANCE_TAG[row.status ?? ''] || 'info'" size="small">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="備註" prop="remark" min-width="200">
        <template #default="{ row }">{{ row.remark || '-' }}</template>
      </el-table-column>
      <el-table-column label="來源" width="120">
        <template #default="{ row }">
          <el-tooltip
            v-if="row.source_leave_id"
            :content="`來自家長請假 #${row.source_leave_id}`"
            placement="top"
          >
            <el-tag size="small" type="info" effect="plain">家長請假</el-tag>
          </el-tooltip>
          <span v-else class="sub">-</span>
        </template>
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
.sub {
  color: var(--el-text-color-secondary);
  font-size: 0.85em;
}
:deep(.row-highlight) {
  background: rgba(255, 217, 102, 0.15) !important;
}
</style>
