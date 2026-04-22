<script setup>
import { ref, watch, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listSalarySnapshots,
  getSalarySnapshot,
  createManualSnapshot,
  getSnapshotDiff,
} from '@/api/salary'
import { apiError } from '@/utils/error'
import { money } from '@/utils/format'

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  canWrite: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const snapshots = ref([])
const loading = ref(false)
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailData = ref(null)
const diffVisible = ref(false)
const diffLoading = ref(false)
const diffData = ref(null)

const TYPE_LABEL = {
  month_end: { text: '月底快照', type: 'success' },
  finalize: { text: '封存快照', type: 'warning' },
  manual: { text: '手動快照', type: 'info' },
}

const loadList = async () => {
  if (!props.year || !props.month) return
  loading.value = true
  try {
    const res = await listSalarySnapshots(props.year, props.month)
    snapshots.value = res.data?.snapshots || []
  } catch (e) {
    apiError(e, '讀取快照列表失敗')
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.modelValue, props.year, props.month],
  ([open]) => {
    if (open) loadList()
  }
)

const formatDateTime = (iso) => {
  if (!iso) return '-'
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const openDetail = async (row) => {
  detailVisible.value = true
  detailLoading.value = true
  try {
    const res = await getSalarySnapshot(row.id)
    detailData.value = res.data
  } catch (e) {
    apiError(e, '讀取快照詳情失敗')
  } finally {
    detailLoading.value = false
  }
}

const openDiff = async (row) => {
  diffVisible.value = true
  diffLoading.value = true
  try {
    const res = await getSnapshotDiff(row.id)
    diffData.value = res.data
  } catch (e) {
    apiError(e, '讀取差異失敗')
  } finally {
    diffLoading.value = false
  }
}

const triggerManualSnapshot = async () => {
  if (!snapshots.value && snapshots.value.length === 0) {
    // 即使 0 也允許觸發；後端會回 404 if no records
  }
  try {
    const { value: remark } = await ElMessageBox.prompt(
      '請輸入快照備註（用於辨識這次手動補拍的原因）',
      `為 ${props.year}/${props.month} 手動補拍快照`,
      {
        inputPlaceholder: '例：發薪前留底',
        inputValidator: (v) => (v && v.length <= 500) || '請輸入 500 字內的備註',
        confirmButtonText: '建立快照',
        cancelButtonText: '取消',
      }
    )
    const res = await createManualSnapshot(props.year, props.month, { remark })
    ElMessage.success(res.data?.message || '快照建立成功')
    await loadList()
  } catch (e) {
    if (e === 'cancel') return
    apiError(e, '手動補拍快照失敗')
  }
}

const DETAIL_ROWS = [
  ['base_salary', '底薪'],
  ['festival_bonus', '節慶獎金'],
  ['overtime_bonus', '超額獎金'],
  ['overtime_pay', '加班費'],
  ['meeting_overtime_pay', '會議加班費'],
  ['birthday_bonus', '生日禮金'],
  ['supervisor_dividend', '主管紅利'],
  ['labor_insurance_employee', '勞保（員工）'],
  ['health_insurance_employee', '健保（員工）'],
  ['pension_employee', '勞退自提'],
  ['late_deduction', '遲到扣款'],
  ['early_leave_deduction', '早退扣款'],
  ['missing_punch_deduction', '未打卡扣款'],
  ['leave_deduction', '請假扣款'],
  ['absence_deduction', '曠職扣款'],
  ['meeting_absence_deduction', '會議缺席扣'],
  ['gross_salary', '應發總額'],
  ['total_deduction', '扣款總額'],
  ['net_salary', '實發金額'],
]

const FIELD_LABEL = Object.fromEntries(DETAIL_ROWS)

const formatDiffValue = (v) => (v == null ? '-' : money(v))
</script>

<template>
  <el-dialog v-model="visible" :title="`${year} 年 ${month} 月 薪資快照`" width="900px">
    <div class="snapshot-header">
      <span class="muted">共 {{ snapshots.length }} 筆快照</span>
      <el-button v-if="canWrite" type="primary" size="small" @click="triggerManualSnapshot">
        手動補拍快照
      </el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="snapshots"
      border
      stripe
      height="420"
      empty-text="此月份尚無快照"
    >
      <el-table-column label="類型" width="110">
        <template #default="{ row }">
          <el-tag :type="TYPE_LABEL[row.snapshot_type]?.type || ''">
            {{ TYPE_LABEL[row.snapshot_type]?.text || row.snapshot_type }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="employee_name" label="員工" width="110" />
      <el-table-column label="捕捉時間" width="160">
        <template #default="{ row }">{{ formatDateTime(row.captured_at) }}</template>
      </el-table-column>
      <el-table-column prop="captured_by" label="觸發者" width="120" />
      <el-table-column label="來源版本" width="90">
        <template #default="{ row }">v{{ row.source_version ?? '-' }}</template>
      </el-table-column>
      <el-table-column label="實發金額" width="110">
        <template #default="{ row }">{{ money(row.net_salary) }}</template>
      </el-table-column>
      <el-table-column prop="snapshot_remark" label="備註" min-width="140" />
      <el-table-column label="操作" width="170" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="openDetail(row)">檢視</el-button>
          <el-button size="small" link type="warning" @click="openDiff(row)">與當前比對</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 快照詳情 -->
    <el-dialog v-model="detailVisible" title="快照詳情" width="720px" append-to-body>
      <div v-loading="detailLoading">
        <el-descriptions v-if="detailData" :column="2" border>
          <el-descriptions-item label="員工">
            {{ detailData.employee_name }}
          </el-descriptions-item>
          <el-descriptions-item label="月份">
            {{ detailData.salary_year }} 年 {{ detailData.salary_month }} 月
          </el-descriptions-item>
          <el-descriptions-item label="類型">
            {{ TYPE_LABEL[detailData.snapshot_type]?.text || detailData.snapshot_type }}
          </el-descriptions-item>
          <el-descriptions-item label="捕捉時間">
            {{ formatDateTime(detailData.captured_at) }}
          </el-descriptions-item>
          <el-descriptions-item label="觸發者">{{ detailData.captured_by || '-' }}</el-descriptions-item>
          <el-descriptions-item label="來源版本">v{{ detailData.source_version ?? '-' }}</el-descriptions-item>
          <el-descriptions-item v-if="detailData.snapshot_remark" label="備註" :span="2">
            {{ detailData.snapshot_remark }}
          </el-descriptions-item>
          <el-descriptions-item
            v-for="[key, label] in DETAIL_ROWS"
            :key="key"
            :label="label"
          >
            {{ money(detailData[key]) }}
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>

    <!-- 與當前比對 -->
    <el-dialog v-model="diffVisible" title="與當前薪資比對" width="720px" append-to-body>
      <div v-loading="diffLoading">
        <template v-if="diffData">
          <p v-if="!diffData.has_current_record" class="warn-text">
            ⚠ 當前無對應 SalaryRecord（可能已刪除）
          </p>
          <p v-else-if="diffData.changes.length === 0" class="muted">
            快照與目前狀態完全一致，沒有差異。
          </p>
          <el-table v-else :data="diffData.changes" border stripe max-height="400">
            <el-table-column label="欄位" width="180">
              <template #default="{ row }">
                {{ FIELD_LABEL[row.field] || row.field }}
              </template>
            </el-table-column>
            <el-table-column label="快照值">
              <template #default="{ row }">{{ formatDiffValue(row.snapshot) }}</template>
            </el-table-column>
            <el-table-column label="當前值">
              <template #default="{ row }">{{ formatDiffValue(row.current) }}</template>
            </el-table-column>
          </el-table>
        </template>
      </div>
    </el-dialog>
  </el-dialog>
</template>

<style scoped>
.snapshot-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.warn-text {
  color: var(--el-color-warning);
  margin: 0 0 10px;
}
</style>
