<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { getRegistrations } from '@/api/activity'
import { hasPermission } from '@/utils/auth'
import { apiError } from '@/utils/error'

const props = withDefaults(defineProps<{
  studentId: number
  active?: boolean
}>(), {
  active: true,
})

const canRead = computed(() => hasPermission('ACTIVITY_READ'))

const items = ref<Record<string, unknown>[]>([])
const loading = ref(false)
const loaded = ref(false)
let requestSeq = 0

async function fetchData() {
  if (!props.studentId || !canRead.value) return
  const seq = ++requestSeq
  const studentId = props.studentId
  loading.value = true
  try {
    const res = await getRegistrations({ student_id: studentId, limit: 100 })
    if (seq !== requestSeq || props.studentId !== studentId) return
    items.value = res.data.items || []
    loaded.value = true
  } catch (e) {
    if (seq !== requestSeq || props.studentId !== studentId) return
    ElMessage.error(apiError(e, '載入才藝報名紀錄失敗'))
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

watch(
  () => props.studentId,
  () => {
    // detail panel 可能重用同一個 ActivityTab 實例切換學生；舊資料不可留在
    // 新學生標頭下，也不可讓舊學生的慢回應覆寫新學生。
    requestSeq += 1
    items.value = []
    loaded.value = false
    loading.value = false
    if (props.active) fetchData()
  },
)

watch(
  () => props.active,
  (active) => {
    if (!active) {
      requestSeq += 1
      loading.value = false
      return
    }
    if (!loaded.value && !loading.value) fetchData()
  },
  { immediate: true },
)

const formatSemesterLabel = (row: Record<string, unknown>) => {
  if (row?.school_year && row?.semester) {
    return `${row.school_year} 學年 ${row.semester === 1 ? '上' : '下'}學期`
  }
  return '-'
}

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'
const paymentStatusLabel = (row: Record<string, unknown>): { label: string; type: ElTagType } => {
  const total = (row.total_amount as number) || 0
  const paid = (row.paid_amount as number) || 0
  if (total > 0 && paid >= total) return { label: '已繳費', type: 'success' }
  if (paid > 0) return { label: '部分繳費', type: 'warning' }
  return { label: '未繳費', type: 'info' }
}

const formatTimestamp = (iso: unknown) => {
  if (!iso) return '-'
  const s = String(iso)
  return s.length >= 16 ? s.slice(0, 16).replace('T', ' ') : s
}

defineExpose({ refresh: fetchData })
</script>

<template>
  <div class="activity-tab">
    <el-empty v-if="!canRead" description="您沒有檢視才藝報名的權限" />
    <template v-else>
      <div class="toolbar">
        <span class="muted">共 {{ items.length }} 筆</span>
        <el-button size="small" :icon="Refresh" @click="fetchData">重新整理</el-button>
      </div>
      <el-empty v-if="!loading && !items.length" description="尚無才藝報名紀錄" />
      <el-table
        v-else
        v-loading="loading"
        :data="items"
        size="small"
        stripe
        max-height="560"
      >
        <el-table-column label="學期" width="140">
          <template #default="{ row }">{{ formatSemesterLabel(row) }}</template>
        </el-table-column>
        <el-table-column label="報名課程" min-width="200">
          <template #default="{ row }">
            <span>{{ row.course_names || '-' }}</span>
            <el-tag v-if="row.course_count" size="small" style="margin-left: 6px">{{ row.course_count }}門</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="用品" width="80" align="center">
          <template #default="{ row }">
            <span v-if="row.supply_count">{{ row.supply_count }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="繳費" width="220">
          <template #default="{ row }">
            <el-tag :type="paymentStatusLabel(row).type" size="small">{{ paymentStatusLabel(row).label }}</el-tag>
            <span class="muted" style="margin-left: 6px">
              {{ row.paid_amount || 0 }} / {{ row.total_amount || 0 }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="備註" prop="remark" min-width="160">
          <template #default="{ row }">{{ row.remark || '-' }}</template>
        </el-table-column>
        <el-table-column label="報名時間" width="160">
          <template #default="{ row }">{{ formatTimestamp(row.created_at) }}</template>
        </el-table-column>
      </el-table>
    </template>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 0.85em;
}
</style>
