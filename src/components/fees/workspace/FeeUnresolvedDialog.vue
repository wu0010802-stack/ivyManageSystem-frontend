<template>
  <el-dialog
    :model-value="modelValue"
    title="未產生費用單的名單"
    width="min(840px, 94vw)"
    destroy-on-close
    @update:model-value="setOpen"
  >
    <p>
      以下檢核檔姓名尚未對上在籍學生，非零元資料未產生費用單。依批次列出，同一姓名可能出現多次。
    </p>
    <p v-if="loading" role="status" data-test="unresolved-loading">正在載入名單…</p>
    <div v-else-if="failed" role="alert" data-test="unresolved-error">
      <p>無法載入完整名單，請重試。</p>
      <el-button @click="load">重新載入</el-button>
    </div>
    <template v-else>
      <p v-if="rows.length === 0" role="status">
        目前沒有未匹配的非零元資料，可重新整理工作台確認最新狀態。
      </p>
      <template v-else>
        <p role="status">共 {{ rows.length }} 筆，合計 {{ formatCurrency(total) }}</p>
        <div class="unresolved-table-scroll">
          <table class="unresolved-table" data-test="unresolved-table">
            <caption class="sr-only">
              未匹配的檢核檔資料
            </caption>
            <thead>
              <tr>
                <th scope="col">檢核檔姓名</th>
                <th scope="col">班級</th>
                <th scope="col">金額</th>
                <th scope="col">發單批次</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="`${row.batchId}-${row.itemId}`">
                <td>{{ row.studentName }}</td>
                <td>{{ row.classroomName || '—' }}</td>
                <td class="amount">{{ formatCurrency(row.netAmount) }}</td>
                <td>{{ row.batchLabel }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>
    <template #footer>
      <el-button @click="setOpen(false)">關閉</el-button>
      <el-button type="primary" @click="emit('imports')">前往匯入紀錄指定學生</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getBillSlipBatches, getOutstandingReport } from '@/api/fees'
import { formatCurrency } from '@/utils/currency'
import { onAdminSessionReset } from '@/utils/adminSession'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  imports: []
}>()
interface UnresolvedRow {
  batchId: number
  itemId: number
  studentName: string
  classroomName: string | null | undefined
  netAmount: number
  batchLabel: string
}
const rows = ref<UnresolvedRow[]>([])
const loading = ref(false)
const failed = ref(false)
const total = computed(() => rows.value.reduce((sum, row) => sum + row.netAmount, 0))
let requestId = 0

function clear() {
  requestId += 1
  rows.value = []
  loading.value = false
  failed.value = false
}
function setOpen(value: boolean) {
  if (!value) clear()
  emit('update:modelValue', value)
}

async function load() {
  const current = ++requestId
  rows.value = []
  failed.value = false
  loading.value = true
  const isCurrent = () => current === requestId && props.modelValue
  try {
    const batches = await getBillSlipBatches()
    if (!isCurrent()) return
    const result: UnresolvedRow[] = []
    // 依序查詢，避免跨月份累積的批次同時發出大量請求；全部成功才顯示名單。
    for (const batch of batches.filter((item) => item.unresolved_count > 0)) {
      const report = await getOutstandingReport(batch.id)
      if (!isCurrent()) return
      for (const item of report.items) {
        if (item.student_id != null || item.net_amount === 0) continue
        result.push({
          batchId: batch.id,
          itemId: item.item_id,
          studentName: item.student_name,
          classroomName: item.classroom_name,
          netAmount: item.net_amount,
          batchLabel: `${batch.bill_year}/${String(batch.bill_month).padStart(2, '0')} ${batch.title}${batch.batch_no ? `（${batch.batch_no}）` : ''} #${batch.id}`,
        })
      }
    }
    if (isCurrent()) rows.value = result
  } catch {
    if (isCurrent()) failed.value = true
  } finally {
    if (isCurrent()) loading.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) void load()
    else clear()
  },
  { immediate: true },
)
const unsubscribe = onAdminSessionReset(() => setOpen(false))
onBeforeUnmount(() => {
  clear()
  unsubscribe()
})
</script>

<style scoped>
.unresolved-table-scroll {
  overflow-x: auto;
}
.unresolved-table {
  width: 100%;
  border-collapse: collapse;
}
.unresolved-table th,
.unresolved-table td {
  padding: var(--space-3);
  text-align: left;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.unresolved-table th {
  color: var(--text-secondary);
}
.unresolved-table .amount {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
</style>
