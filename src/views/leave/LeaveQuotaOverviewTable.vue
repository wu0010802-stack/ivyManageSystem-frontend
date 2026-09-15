<!--
  配額總覽（2026-09-15 UI/UX 改版 mockup 畫面 E）：全員 × 假別一眼總覽，
  取代「一次只能查一人」的舊配額管理彈窗流程。

  純前端達成，不需新後端端點——GET /leaves/quotas 省略 employee_id 時
  後端本來就回「該年度全部已初始化員工」的配額列（含批次算好的 used/pending/
  remaining），本檔只是把既有回應依員工分組、依假別排欄。
-->
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { getLeaveQuotas, initLeaveQuotas } from '@/api/leaves'
import { ElMessage } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import AdminListToolbar, { type FilterGroup } from '@/components/common/AdminListToolbar.vue'
import { LEAVE_TYPES as leaveTypes } from '@/utils/leaves'

interface QuotaCell {
  total_hours: number
  used_hours: number
  pending_hours: number
  remaining_hours: number
}
interface EmpRow {
  employee_id: number
  employee_name: string
  cells: Record<string, QuotaCell>
  initialized: boolean
}

const props = defineProps<{
  employees: Record<string, unknown>[]
}>()
const emit = defineEmits<{ (e: 'adjust', employeeId: number): void }>()

const currentYear = new Date().getFullYear()
const overviewYear = ref(currentYear)
const overviewLoading = ref(false)
const rawRows = ref<Array<Record<string, unknown>>>([])
const initializingId = ref<number | null>(null)

async function loadOverview() {
  overviewLoading.value = true
  try {
    const res = await getLeaveQuotas({ year: overviewYear.value })
    rawRows.value = (res as { data: Array<Record<string, unknown>> }).data || []
  } catch (e) {
    ElMessage.error(friendlyError('載入配額總覽失敗', e))
  } finally {
    overviewLoading.value = false
  }
}
onMounted(loadOverview)
watch(overviewYear, loadOverview)

// 欄位順序照 LEAVE_TYPES 既有順序，未知假別排最後（穩定排序，不因回應陣列順序漂移）
const columnOrder = leaveTypes.map((t) => t.value)
const columns = computed(() => {
  const present = new Set(rawRows.value.map((r) => r.leave_type as string))
  const ordered = columnOrder.filter((v) => present.has(v))
  const rest = [...present].filter((v) => !columnOrder.includes(v)).sort()
  return [...ordered, ...rest].map((value) => ({
    value,
    label: (rawRows.value.find((r) => r.leave_type === value)?.leave_type_label as string) || value,
  }))
})

const employeeRows = computed<EmpRow[]>(() => {
  const byEmp = new Map<number, EmpRow>()
  for (const emp of props.employees) {
    const id = emp.id as number
    byEmp.set(id, { employee_id: id, employee_name: (emp.name as string) || `#${id}`, cells: {}, initialized: false })
  }
  for (const r of rawRows.value) {
    const empId = r.employee_id as number
    let row = byEmp.get(empId)
    if (!row) {
      row = { employee_id: empId, employee_name: `#${empId}`, cells: {}, initialized: false }
      byEmp.set(empId, row)
    }
    row.initialized = true
    row.cells[r.leave_type as string] = {
      total_hours: r.total_hours as number,
      used_hours: r.used_hours as number,
      pending_hours: r.pending_hours as number,
      remaining_hours: r.remaining_hours as number,
    }
  }
  return [...byEmp.values()].sort((a, b) => a.employee_name.localeCompare(b.employee_name, 'zh-Hant'))
})

const search = ref('')
const filterValues = ref<Record<string, unknown>>({})

const lowAnnualCount = computed(
  () => employeeRows.value.filter((r) => r.initialized && (r.cells.annual?.remaining_hours ?? Infinity) < 16).length,
)
const uninitializedCount = computed(() => employeeRows.value.filter((r) => !r.initialized).length)

const filterGroups = computed<FilterGroup[]>(() => [
  {
    key: 'focus',
    label: '篩選',
    options: [
      { value: 'low_annual', label: `特休剩 <16h（${lowAnnualCount.value}）` },
      { value: 'uninitialized', label: `尚未初始化（${uninitializedCount.value}）` },
    ],
  },
])

const filteredRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  let rows = employeeRows.value
  if (q) rows = rows.filter((r) => r.employee_name.toLowerCase().includes(q))
  const focus = filterValues.value.focus as string | undefined
  if (focus === 'low_annual') rows = rows.filter((r) => r.initialized && (r.cells.annual?.remaining_hours ?? Infinity) < 16)
  if (focus === 'uninitialized') rows = rows.filter((r) => !r.initialized)
  return rows
})

function cellClass(cell?: QuotaCell): string {
  if (!cell) return 'none'
  if (cell.remaining_hours <= 0) return 'bad'
  if (cell.remaining_hours < 16) return 'warn'
  return 'ok'
}

async function initRow(row: EmpRow) {
  initializingId.value = row.employee_id
  try {
    await initLeaveQuotas({ employee_id: row.employee_id, year: overviewYear.value })
    ElMessage.success(`已為 ${row.employee_name} 依勞基法初始化配額`)
    await loadOverview()
  } catch (e) {
    ElMessage.error(friendlyError('初始化配額失敗', e))
  } finally {
    initializingId.value = null
  }
}
</script>

<template>
  <div class="quota-overview">
    <div class="quota-overview__head">
      <h3 class="quota-overview__title">配額總覽</h3>
      <el-select v-model="overviewYear" style="width: 110px;" size="small">
        <el-option v-for="y in 5" :key="y" :label="`${currentYear - 2 + y} 年`" :value="currentYear - 2 + y" />
      </el-select>
    </div>

    <AdminListToolbar
      v-model:search="search"
      v-model:filter-values="filterValues"
      search-placeholder="搜尋員工"
      :filters="filterGroups"
      :total="employeeRows.length"
      :shown="filteredRows.length"
    />

    <div v-loading="overviewLoading" class="quota-overview__table-wrap">
      <table class="quota-overview__table">
        <thead>
          <tr>
            <th class="quota-overview__emp-col">員工</th>
            <th v-for="col in columns" :key="col.value">{{ col.label }}</th>
            <th class="quota-overview__op-col"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in filteredRows" :key="row.employee_id">
            <td class="quota-overview__emp-col">{{ row.employee_name }}</td>
            <template v-if="row.initialized">
              <td v-for="col in columns" :key="col.value" class="quota-cell" :class="cellClass(row.cells[col.value])">
                <template v-if="row.cells[col.value]">
                  {{ row.cells[col.value].remaining_hours }} / {{ row.cells[col.value].total_hours }}h
                  <span v-if="row.cells[col.value].pending_hours > 0" class="quota-cell__pending">待審 {{ row.cells[col.value].pending_hours }}h</span>
                </template>
                <span v-else class="quota-cell__none">—</span>
              </td>
              <td class="quota-overview__op-col">
                <el-button link type="primary" size="small" @click="emit('adjust', row.employee_id)">調整</el-button>
              </td>
            </template>
            <template v-else>
              <td :colspan="columns.length" class="quota-overview__uninit">
                尚未初始化
                <el-button link type="primary" size="small" :loading="initializingId === row.employee_id" @click="initRow(row)">依勞基法初始化</el-button>
              </td>
              <td class="quota-overview__op-col"></td>
            </template>
          </tr>
          <tr v-if="!overviewLoading && !filteredRows.length">
            <td :colspan="columns.length + 2" class="quota-overview__empty">沒有符合條件的員工</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.quota-overview__head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: var(--space-3);
}
.quota-overview__title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}
.quota-overview__table-wrap {
  overflow-x: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
}
.quota-overview__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  white-space: nowrap;
}
.quota-overview__table th,
.quota-overview__table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  text-align: left;
}
.quota-overview__table thead th {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-weight: 500;
  font-size: 12.5px;
}
.quota-overview__emp-col {
  position: sticky;
  left: 0;
  background: var(--el-bg-color);
  font-weight: 500;
}
.quota-overview__table thead .quota-overview__emp-col {
  background: var(--el-fill-color-light);
}
.quota-overview__op-col {
  width: 64px;
}
.quota-cell.warn { color: var(--el-color-warning); }
.quota-cell.bad { color: var(--el-color-danger); font-weight: 600; }
.quota-cell__pending {
  display: block;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.quota-cell__none {
  color: var(--el-text-color-placeholder);
}
.quota-overview__uninit {
  color: var(--el-text-color-secondary);
}
.quota-overview__empty {
  text-align: center;
  color: var(--el-text-color-secondary);
  padding: 24px;
}
</style>
