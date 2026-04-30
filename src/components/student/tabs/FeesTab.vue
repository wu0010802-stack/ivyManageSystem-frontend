<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { getFeeRecords } from '@/api/fees'
import { hasPermission } from '@/utils/auth'
import { apiError } from '@/utils/error'

const props = defineProps({
  studentId: { type: Number, required: true },
  active: { type: Boolean, default: true },
})

const canRead = hasPermission('FEES_READ')

const FEE_STATUS_LABEL = { paid: '已繳', partial: '部分', unpaid: '未繳' }
const FEE_STATUS_TYPE = { paid: 'success', partial: 'warning', unpaid: 'danger' }

const items = ref([])
const loading = ref(false)
const loaded = ref(false)

async function fetchData() {
  if (!props.studentId || !canRead) return
  loading.value = true
  try {
    const data = await getFeeRecords({ student_id: props.studentId, page_size: 200 })
    items.value = data.items || []
    loaded.value = true
  } catch (e) {
    ElMessage.error(apiError(e, '載入學費紀錄失敗'))
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

const totals = computed(() => {
  const acc = { due: 0, paid: 0, unpaid: 0, partial: 0 }
  for (const r of items.value) {
    acc.due += r.amount_due || 0
    acc.paid += r.amount_paid || 0
    if (r.status === 'unpaid') acc.unpaid += 1
    if (r.status === 'partial') acc.partial += 1
  }
  return acc
})

defineExpose({ refresh: fetchData })
</script>

<template>
  <div class="fees-tab">
    <el-empty v-if="!canRead" description="您沒有檢視學費的權限" />
    <template v-else>
      <div class="toolbar">
        <div class="stat-row" v-if="items.length">
          <el-tag type="info" size="small">總應繳 {{ totals.due }}</el-tag>
          <el-tag type="success" size="small">已收 {{ totals.paid }}</el-tag>
          <el-tag type="danger" size="small">未繳 {{ totals.unpaid }} 筆</el-tag>
          <el-tag type="warning" size="small">部分繳 {{ totals.partial }} 筆</el-tag>
        </div>
        <el-button size="small" :icon="Refresh" @click="fetchData">重新整理</el-button>
      </div>
      <el-empty v-if="!loading && !items.length" description="尚無學費紀錄" />
      <el-table
        v-else
        v-loading="loading"
        :data="items"
        size="small"
        stripe
        max-height="560"
      >
        <el-table-column label="期別" prop="period" width="120" />
        <el-table-column label="費用項目" prop="fee_item_name" min-width="140" />
        <el-table-column label="班級" prop="classroom_name" width="110" />
        <el-table-column label="應繳" width="90" align="right">
          <template #default="{ row }">{{ row.amount_due || 0 }}</template>
        </el-table-column>
        <el-table-column label="已繳" width="90" align="right">
          <template #default="{ row }">{{ row.amount_paid || 0 }}</template>
        </el-table-column>
        <el-table-column label="狀態" width="90">
          <template #default="{ row }">
            <el-tag :type="FEE_STATUS_TYPE[row.status] || 'info'" size="small">
              {{ FEE_STATUS_LABEL[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="繳費日" prop="payment_date" width="110">
          <template #default="{ row }">{{ row.payment_date || '-' }}</template>
        </el-table-column>
        <el-table-column label="付款方式" prop="payment_method" width="100">
          <template #default="{ row }">{{ row.payment_method || '-' }}</template>
        </el-table-column>
        <el-table-column label="備註" prop="notes" min-width="140">
          <template #default="{ row }">{{ row.notes || '-' }}</template>
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
  gap: 12px;
  flex-wrap: wrap;
}
.stat-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
</style>
