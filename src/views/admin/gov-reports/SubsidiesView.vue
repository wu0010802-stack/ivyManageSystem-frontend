<template>
  <div class="page">
    <h2>特教加給 / 助理鐘點費</h2>

    <div class="summary-row">
      <el-card><div>本期申請總額</div><strong>${{ summary.requested }}</strong></el-card>
      <el-card><div>待核准筆數</div><strong>{{ summary.pendingCount }}</strong></el-card>
      <el-card><div>已撥款總額</div><strong>${{ summary.paid }}</strong></el-card>
    </div>

    <el-form :model="filters" inline @submit.prevent="load">
      <el-form-item label="員工 ID"><el-input v-model="filters.employee_id" clearable /></el-form-item>
      <el-form-item label="狀態">
        <el-select v-model="filters.status_filter" clearable style="width:120px">
          <el-option v-for="s in statusOptions" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="期間">
        <el-date-picker v-model="filters.range" type="daterange" value-format="YYYY-MM-DD" />
      </el-form-item>
      <el-button type="primary" @click="load">查詢</el-button>
      <el-button @click="onExport">匯出 Excel</el-button>
      <el-button type="success" @click="openCreate">新增申領</el-button>
    </el-form>

    <el-table :data="rows" v-loading="loading">
      <el-table-column prop="id" label="#" width="60" />
      <el-table-column label="類型">
        <template #default="{ row }">{{ typeLabel(row.subsidy_type) }}</template>
      </el-table-column>
      <el-table-column prop="employee_id" label="員工 ID" width="80" />
      <el-table-column prop="period_start" label="起期" width="110" />
      <el-table-column prop="period_end" label="迄期" width="110" />
      <el-table-column prop="amount_requested" label="申請金額" />
      <el-table-column prop="amount_approved" label="核定金額" />
      <el-table-column label="狀態" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="動作" width="280">
        <template #default="{ row }">
          <el-button v-if="row.status === 'draft'" size="small"
                     @click="onSubmit(row)">送審</el-button>
          <el-button v-if="row.status === 'submitted'" size="small" type="success"
                     @click="onApprove(row)">核准</el-button>
          <el-button v-if="row.status === 'approved'" size="small" type="primary"
                     @click="onMarkPaid(row)">標記撥款</el-button>
          <el-button v-if="['submitted','approved'].includes(row.status)"
                     size="small" type="danger" plain @click="onReject(row)">退回</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增申領 dialog -->
    <el-dialog v-model="createOpen" title="新增申領" width="520px">
      <el-form :model="createForm" label-width="100px">
        <el-form-item label="類型" required>
          <el-select v-model="createForm.subsidy_type">
            <el-option label="特教加給" value="teacher_extra" />
            <el-option label="助理鐘點費" value="assistant_hourly" />
          </el-select>
        </el-form-item>
        <el-form-item label="員工 ID" required>
          <el-input-number v-model="createForm.employee_id" :min="1" />
        </el-form-item>
        <el-form-item label="期間" required>
          <el-date-picker v-model="createForm.range" type="daterange" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="時數/費率">
          <el-input-number v-model="createForm.hours_or_rate" :step="0.5" />
        </el-form-item>
        <el-form-item label="申請金額" required>
          <el-input-number v-model="createForm.amount_requested" :min="0" />
        </el-form-item>
        <el-form-item label="備註"><el-input v-model="createForm.notes" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createOpen = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitCreate">建立</el-button>
      </template>
    </el-dialog>

    <!-- 核准 dialog -->
    <el-dialog v-model="approveOpen" title="核准 — 填入核定金額" width="360px">
      <el-form :model="approveForm" label-width="100px">
        <el-form-item label="核定金額" required>
          <el-input-number v-model="approveForm.amount_approved" :min="0" />
        </el-form-item>
        <el-form-item label="備註"><el-input v-model="approveForm.notes" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="approveOpen = false">取消</el-button>
        <el-button type="primary" @click="submitApprove">核准</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listSubsidies, createSubsidy, submitSubsidy, approveSubsidy,
  markSubsidyPaid, rejectSubsidy, exportSubsidies,
} from '@/api/govMoe'

interface SubsidyRow {
  id: number
  subsidy_type: string
  employee_id: number
  period_start: string
  period_end: string
  amount_requested: number | string
  amount_approved?: number | string
  status: string
  notes?: string
}

const filters = ref<{ employee_id: string; status_filter: string; range: string[] }>({ employee_id: '', status_filter: '', range: [] })
const rows = ref<SubsidyRow[]>([])
const loading = ref(false)
const statusOptions: Array<{ value: string; label: string }> = [
  { value: 'draft', label: '草稿' },
  { value: 'submitted', label: '待核' },
  { value: 'approved', label: '已核' },
  { value: 'paid', label: '已撥款' },
  { value: 'rejected', label: '退回' },
]
const TYPE_LABEL: Record<string, string> = { teacher_extra: '特教加給', assistant_hourly: '助理鐘點費' }
const typeLabel = (t: string) => TYPE_LABEL[t] || t
const statusLabel = (s: string) => statusOptions.find(o => o.value === s)?.label || s
type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'
const statusTagType = (s: string): ElTagType => (({
  draft: 'info', submitted: 'warning', approved: 'success',
  paid: 'primary', rejected: 'danger',
} as Record<string, ElTagType>)[s]) ?? 'info'

const summary = computed(() => {
  const requested = rows.value.reduce((a, r) => a + Number(r.amount_requested || 0), 0)
  const paid = rows.value.filter(r => r.status === 'paid')
    .reduce((a, r) => a + Number(r.amount_approved || 0), 0)
  const pendingCount = rows.value.filter(r => r.status === 'submitted').length
  return { requested, paid, pendingCount }
})

async function load() {
  loading.value = true
  try {
    const params: Record<string, unknown> = {}
    if (filters.value.employee_id) params.employee_id = filters.value.employee_id
    if (filters.value.status_filter) params.status_filter = filters.value.status_filter
    if (filters.value.range?.[0]) params.since = filters.value.range[0]
    if (filters.value.range?.[1]) params.until = filters.value.range[1]
    const { data } = await listSubsidies(params)
    rows.value = data
  } finally { loading.value = false }
}

const createOpen = ref(false)
const createForm = ref<{
  subsidy_type: string; employee_id: number;
  range: string[]; hours_or_rate: number | null; amount_requested: number; notes: string
}>({
  subsidy_type: 'teacher_extra', employee_id: 1,
  range: [], hours_or_rate: null, amount_requested: 0, notes: '',
})
const submitting = ref(false)
function openCreate() { createOpen.value = true }
async function submitCreate() {
  if (!createForm.value.range?.[0]) {
    ElMessage.warning('請填寫期間'); return
  }
  submitting.value = true
  try {
    await createSubsidy({
      subsidy_type: createForm.value.subsidy_type,
      employee_id: createForm.value.employee_id,
      period_start: createForm.value.range[0],
      period_end: createForm.value.range[1],
      hours_or_rate: createForm.value.hours_or_rate,
      amount_requested: createForm.value.amount_requested,
      notes: createForm.value.notes,
    })
    ElMessage.success('已建立草稿')
    createOpen.value = false
    await load()
  } catch (e) {
    ElMessage.error((e as { response?: { data?: { detail?: string } } }).response?.data?.detail || '建立失敗')
  } finally { submitting.value = false }
}

async function onSubmit(row: SubsidyRow) { await submitSubsidy(row.id); await load() }
const approveOpen = ref(false)
const approveTarget = ref<SubsidyRow | null>(null)
const approveForm = ref({ amount_approved: 0, notes: '' })
function onApprove(row: SubsidyRow) {
  approveTarget.value = row
  approveForm.value = { amount_approved: Number(row.amount_requested), notes: '' }
  approveOpen.value = true
}
async function submitApprove() {
  await approveSubsidy(approveTarget.value!.id, approveForm.value)
  approveOpen.value = false; await load()
}
async function onMarkPaid(row: SubsidyRow) {
  await ElMessageBox.confirm(`確認 ${row.id} 已撥款？`, '撥款確認')
  await markSubsidyPaid(row.id, { paid_at: new Date().toISOString() })
  await load()
}
async function onReject(row: SubsidyRow) {
  await ElMessageBox.confirm('確認退回？', '退回確認')
  await rejectSubsidy(row.id); await load()
}
async function onExport() {
  const params: Record<string, string> = {}
  if (filters.value.range?.[0]) params.since = filters.value.range[0]
  if (filters.value.range?.[1]) params.until = filters.value.range[1]
  const { data } = await exportSubsidies(params)
  const url = URL.createObjectURL(data as Blob)
  const a = document.createElement('a')
  a.href = url; a.download = '義華幼兒園_特教加給.xlsx'; a.click()
  URL.revokeObjectURL(url)
}

onMounted(load)
</script>

<style scoped>
.page { padding: 16px; }
.summary-row { display: flex; gap: 12px; margin-bottom: 16px; }
.summary-row .el-card { flex: 1; }
</style>
