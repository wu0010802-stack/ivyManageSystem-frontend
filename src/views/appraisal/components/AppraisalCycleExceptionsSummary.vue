<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getAppraisalCycleExceptions } from '@/api/appraisal'
import { exceptionTypeLabel } from '@/constants/appraisalYearEnd'
import { formatTimeTW } from '@/utils/format'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import EmptyState from '@/components/common/EmptyState.vue'

type Severity = 'blocking' | 'warning' | 'info'
interface ExceptionItem {
  type: string
  severity: Severity
  entity_type: string
  entity_id: string
  target_name: string
  reason: string
  impact: string
  suggested_action: string
  deep_link: string
}
interface ExceptionsData {
  cycle_id: number
  generated_at: string
  counts_by_type: Record<string, number>
  items: ExceptionItem[]
}

const SEVERITY_TAG_TYPE: Record<Severity, 'danger' | 'warning' | 'info'> = {
  blocking: 'danger',
  warning: 'warning',
  info: 'info',
}
const SEVERITY_LABEL: Record<Severity, string> = {
  blocking: '衝突',
  warning: '缺資料',
  info: '提示',
}

const props = defineProps<{ cycleId: number }>()

const data = ref<ExceptionsData | null>(null)
const loading = ref(true)
const loadError = ref(false)

async function reload() {
  loading.value = true
  loadError.value = false
  try {
    const res = await getAppraisalCycleExceptions(props.cycleId)
    data.value = res.data as unknown as ExceptionsData
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

onMounted(reload)

defineExpose({ reload, data, loading, loadError })
</script>

<template>
  <div class="ap-exceptions-summary">
    <TableSkeleton v-if="loading" :columns="5" :rows="3" />
    <div v-else-if="loadError" class="ap-exceptions-summary__error">
      載入失敗
      <el-button data-test="exceptions-summary-retry" size="small" text type="primary" @click="reload">重試</el-button>
    </div>
    <EmptyState
      v-else-if="!data || data.items.length === 0"
      title="無待處理例外"
      description="自動計算的人員不需逐筆檢視，可直接前往簽核。"
    />
    <template v-else>
      <p class="ap-exceptions-summary__meta">
        彙整於 {{ formatTimeTW(data.generated_at) }}
      </p>
      <el-table :data="data.items" size="small">
        <el-table-column label="員工" prop="target_name" min-width="120" />
        <el-table-column label="類型" width="110">
          <template #default="{ row }">
            <el-tag :type="SEVERITY_TAG_TYPE[row.severity as Severity]" size="small">
              {{ SEVERITY_LABEL[row.severity as Severity] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="說明" min-width="200">
          <template #default="{ row }">{{ exceptionTypeLabel(row.type) }}：{{ row.reason }}</template>
        </el-table-column>
        <el-table-column label="影響" prop="impact" width="120" />
        <el-table-column label="建議動作" prop="suggested_action" min-width="140" />
      </el-table>
    </template>
  </div>
</template>

<style scoped>
.ap-exceptions-summary__error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--el-color-danger);
  font-size: var(--text-sm);
}
.ap-exceptions-summary__meta {
  font-size: var(--text-xs, 12px);
  color: var(--el-text-color-secondary);
  margin: 0 0 var(--space-2);
}
</style>
