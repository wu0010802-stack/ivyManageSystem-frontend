<script setup lang="ts">
import { ref, onMounted, computed, watch, h } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDebounceFn } from '@vueuse/core'
import { Plus, Search, ArrowDown } from '@element-plus/icons-vue'
import { getEmployees, deleteEmployee } from '@/api/employees'
import { getProbationAlerts } from '@/api/home'
import { statusKeyOf, getEmployeeStatus, isMissingSalary, type EmployeeStatusKey } from '@/utils/employeeDisplay'
import OffboardingModal from '@/components/offboarding/OffboardingModal.vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import EmptyState from '@/components/common/EmptyState.vue'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'
import EmployeeFormDialog from '@/components/employee/EmployeeFormDialog.vue'
import { useEmployeeStore } from '@/stores/employee'
import { useLatestSearch } from '@/composables'
import { downloadFile } from '@/utils/download'
import { mapEmployeeError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'
import { useIsMobile } from '@/composables/useIsMobile'
import { useResetPunchPin } from '@/composables/useResetPunchPin'

const employeeStore = useEmployeeStore()

// 手機版（≤767.98px）：清單改卡片視圖
const { isMobile } = useIsMobile()

// 手機卡片視圖欄位（__status 為 slot-only 欄，值由 #cell-__status slot 渲染）
const employeeCardColumns = [
  { label: '編號', prop: 'employee_id' },
  { label: '教育局職稱', prop: 'title' },
  { label: '園內職務', prop: 'position' },
  { label: '到職日', prop: 'hire_date' },
  { label: '狀態', prop: '__status' },
]

const loading = ref(false)

// ── 權限 ──────────────────────────────────────────────
const canWriteEmployees = computed(() => hasPermission('EMPLOYEES_WRITE'))
const canResetPunchPin = computed(() => hasPermission('ATTENDANCE_WRITE'))

const { resetEmployeePin } = useResetPunchPin()

const showError = (err: unknown) => {
  const m = mapEmployeeError(err)
  if (m.type === 'success') ElMessage.success(m.message)
  else if (m.type === 'warning') ElMessage.warning(m.message)
  else ElMessage.error(m.message)
}

interface EmployeeRow {
  id: number
  employee_id?: string
  name?: string
  is_active?: boolean
  resign_date?: string
  [key: string]: unknown
}

// ── 辦理離職 ──────────────────────────────────────
const offboardVisible = ref(false)
const offboardTarget = ref<EmployeeRow | null>(null)

const openOffboard = (emp: Record<string, unknown>) => {
  offboardTarget.value = emp as EmployeeRow
  offboardVisible.value = true
}

const route = useRoute()
const router = useRouter()
const searchQuery = ref('')
const debouncedSearch = ref('')
const updateSearch = useDebounceFn((val) => { debouncedSearch.value = val }, 300)
watch(searchQuery, updateSearch)

// 序列化搜尋：只套用最新查詢的回應，避免 debounced 搜尋的 out-of-order 舊回應覆蓋新結果
const {
  result: searchResults,
  search: runEmployeeSearch,
  reset: resetEmployeeSearch,
} = useLatestSearch<Record<string, unknown>[]>(
  async (val) => (await getEmployees({ search: val })).data as Record<string, unknown>[],
)

const filteredEmployees = computed(() =>
  searchResults.value !== null ? searchResults.value : (employeeStore.employees as Record<string, unknown>[])
)

// ── 狀態篩選（純前端，疊在 filteredEmployees 之上；搜尋中也同時生效）──
type StatusFilter = 'all' | EmployeeStatusKey
const statusFilter = ref<StatusFilter>('all')
const matchesStatus = (emp: Record<string, unknown>) =>
  statusFilter.value === 'all' || statusKeyOf(emp) === statusFilter.value

// ── 職稱篩選（清單 title 欄位的去重值，純前端 chain 在狀態篩選之後）──
const titleFilter = ref<string>('all')
const titleOptions = computed(() => {
  const titles = (employeeStore.employees as Record<string, unknown>[])
    .map((e) => (e.title as string) || '')
    .filter(Boolean)
  return [...new Set(titles)]
})
const matchesTitle = (emp: Record<string, unknown>) =>
  titleFilter.value === 'all' || emp.title === titleFilter.value

// ── HR 待辦 chips（finding #3 phase 1）：待補薪資／試用期將到期，roster-stats 旁可點篩選 ──
type TodoFilter = 'none' | 'missing_salary' | 'probation'
const todoFilter = ref<TodoFilter>('none')

// 待補薪資：口徑同名冊列 tag（isMissingSalary，單一來源），以整份 store 名冊計數
// （同 rosterStats 基準，不受搜尋/其他篩選影響，避免「共 N 人」式的誤讀）
const missingSalaryCount = computed(() =>
  (employeeStore.employees as Record<string, unknown>[]).filter(isMissingSalary).length
)

// 試用期將到期：onMounted 呼叫後端 alerts 端點取得 id 清單；API 失敗靜默（catch 後維持空陣列，
// chip 因 n=0 天然不渲染，不擋名冊主流程、不跳錯誤訊息）
const probationAlertIds = ref<number[]>([])
const probationAlertCount = computed(() => probationAlertIds.value.length)

const matchesTodo = (emp: Record<string, unknown>) => {
  if (todoFilter.value === 'missing_salary') return isMissingSalary(emp)
  if (todoFilter.value === 'probation') return probationAlertIds.value.includes(emp.id as number)
  return true
}

const toggleTodoFilter = (filter: 'missing_salary' | 'probation') => {
  todoFilter.value = todoFilter.value === filter ? 'none' : filter
}

// 表格實際渲染的清單：搜尋/store 結果 → 狀態篩選 → 職稱篩選 → HR 待辦篩選（單一 chain，不開平行路徑）
const displayedEmployees = computed(() =>
  (filteredEmployees.value as Record<string, unknown>[]).filter((e) => matchesStatus(e) && matchesTitle(e) && matchesTodo(e))
)

// 名冊統計：永遠以整份 store 名冊為基準（不受搜尋/狀態篩選影響），
// 提供穩定的全園總覽；搜尋時若改算搜尋結果，「共 N 人」易被誤讀為全園人數
const rosterStats = computed(() => {
  const counts = { active: 0, pending: 0, resigned: 0 }
  const list = employeeStore.employees as Record<string, unknown>[]
  for (const e of list) counts[statusKeyOf(e)] += 1
  return { total: list.length, ...counts }
})

const clearFilters = () => {
  searchQuery.value = ''
  statusFilter.value = 'all'
  titleFilter.value = 'all'
  todoFilter.value = 'none'
}

watch(debouncedSearch, async (val) => {
  if (!val) {
    resetEmployeeSearch()
    return
  }
  try {
    await runEmployeeSearch(val)
  } catch {
    ElMessage.error('搜尋員工失敗')
  }
})

// ── 匯出 Excel：帶入目前搜尋與 status/title 篩選（後端 Task 2 已支援）；
// todoFilter（HR 待辦篩選）為純前端衍生資料，後端匯出端點不支援，不放進 params ──
const exportTooltip = computed(() => {
  const hasFilters = !!searchQuery.value.trim() || statusFilter.value !== 'all' || titleFilter.value !== 'all'
  const base = hasFilters ? '匯出符合目前搜尋與篩選的名冊' : '匯出全部名冊'
  return todoFilter.value !== 'none' ? `${base}（HR 待辦篩選不影響匯出）` : base
})

const exportEmployees = () => {
  const params: Record<string, unknown> = {}
  const q = searchQuery.value.trim()
  if (q) params.search = q
  if (statusFilter.value !== 'all') params.status = statusFilter.value
  if (titleFilter.value !== 'all') params.title = titleFilter.value
  downloadFile('/exports/employees', '員工名冊.xlsx', Object.keys(params).length ? params : undefined)
}

const fetchEmployees = async (force = true) => {
  loading.value = true
  try {
    await employeeStore.fetchEmployees(force)
  } catch (error) {
    ElMessage.error('載入員工資料失敗')
  } finally {
    loading.value = false
  }
}

// ── 整列點擊進詳情頁 ──────────────────────────────────
const goDetail = (row: Record<string, unknown>) => router.push(`/employees/${row.id}`)
// row-click：點到操作欄不導航（操作欄有自己的按鈕）
const onRowClick = (row: Record<string, unknown>, column: { label?: string }) => {
  if (column?.label === '操作') return
  goDetail(row)
}

// ── 已離職/待離職列淡化 ───────────────────────────────
const rowClassName = ({ row }: { row: Record<string, unknown> }) => {
  const k = statusKeyOf(row)
  return k === 'resigned' ? 'row-resigned' : k === 'pending' ? 'row-pending' : ''
}

// ── 快速標記離職（軟刪，取代舊「刪除」）────────────────
const quickResign = (row: Record<string, unknown>) => {
  ElMessageBox.confirm(
    h('div', null, [
      h('p', null, `確定將「${row.name}」快速標記離職？此操作會：`),
      h('ul', { style: 'margin:8px 0 8px 18px; line-height:1.9' }, [
        h('li', null, '立即設定離職（今日）並撤銷登入帳號'),
        h('li', null, '不產生離職證明、不做假別結算快照'),
        h('li', null, '不計算最終薪資預覽'),
      ]),
      h('p', { style: 'color:var(--el-color-warning)' }, '正式離職請優先走「辦理離職」完整流程；本功能適用於誤建帳號或極簡情境。'),
    ]),
    '快速標記離職',
    { type: 'warning', confirmButtonText: '確認標記離職', cancelButtonText: '取消' },
  ).then(async () => {
    try {
      await deleteEmployee(row.id as number)
      ElMessage.success('已標記離職')
      fetchEmployees()
    } catch (err) {
      showError(err)
    }
  }).catch(() => {})
}

// 操作欄「更多」下拉指令（辦理離職 / 重置打卡 PIN / 快速標記離職收合於此）
const handleRowCommand = (cmd: string, row: Record<string, unknown>) => {
  if (cmd === 'offboard') openOffboard(row)
  else if (cmd === 'reset-punch-pin') resetEmployeePin(row as { id: number; name: string })
  else if (cmd === 'quick-resign') quickResign(row)
}

// ── 統一員工表單彈窗（新增 / 編輯）────────────────────
const formDialog = ref<InstanceType<typeof EmployeeFormDialog> | null>(null)
const openCreate = () => formDialog.value?.openCreate()
const openEdit = (row: Record<string, unknown>) => formDialog.value?.openEdit(row)

onMounted(async () => {
  // Why: 切回此頁時走 store TTL（5 分鐘）避免每次重抓員工清單；CRUD 完成的 callback 仍會
  // force=true 觸發即時更新（quickResign / 表單儲存 / offboard 等路徑）。
  fetchEmployees(false)
  // 全域搜尋導航帶入 ?search=<關鍵字>：預填搜尋框並觸發搜尋（debouncedSearch watcher）
  const kw = typeof route.query.search === 'string' ? route.query.search : ''
  if (kw) {
    searchQuery.value = kw
    debouncedSearch.value = kw
  }
  // 試用期將到期 chip：非關鍵功能，失敗靜默（不跳錯誤訊息、不擋名冊載入）
  getProbationAlerts()
    .then((res) => { probationAlertIds.value = res.data.employees.map((e) => e.id) })
    .catch(() => {})
})
</script>

<template>
  <div class="employees-page">
    <div class="page-header">
      <div class="page-header-left">
        <h2>員工管理</h2>
        <p v-if="!loading" class="roster-stats">
          共 {{ rosterStats.total }} 人
          <span class="stat-sep">·</span> 在職 {{ rosterStats.active }}
          <template v-if="rosterStats.pending">
            <span class="stat-sep">·</span> 待離職 {{ rosterStats.pending }}
          </template>
          <template v-if="rosterStats.resigned">
            <span class="stat-sep">·</span> 已離職 {{ rosterStats.resigned }}
          </template>
        </p>
        <div v-if="!loading && (missingSalaryCount > 0 || probationAlertCount > 0)" class="todo-chips">
          <el-tag
            v-if="missingSalaryCount > 0"
            class="todo-chip"
            type="warning"
            :effect="todoFilter === 'missing_salary' ? 'dark' : 'plain'"
            @click="toggleTodoFilter('missing_salary')"
          >待補薪資 {{ missingSalaryCount }}</el-tag>
          <el-tag
            v-if="probationAlertCount > 0"
            class="todo-chip"
            type="info"
            :effect="todoFilter === 'probation' ? 'dark' : 'plain'"
            @click="toggleTodoFilter('probation')"
          >試用期將到期 {{ probationAlertCount }}</el-tag>
        </div>
      </div>
      <div class="header-actions">
        <el-input
          v-model="searchQuery"
          placeholder="搜尋姓名或編號"
          class="search-input"
          :prefix-icon="Search"
          clearable
        />
        <el-select v-model="statusFilter" class="status-filter" aria-label="狀態篩選">
          <el-option label="全部狀態" value="all" />
          <el-option label="在職" value="active" />
          <el-option label="待離職" value="pending" />
          <el-option label="已離職" value="resigned" />
        </el-select>
        <el-select v-model="titleFilter" class="title-filter" aria-label="職稱篩選">
          <el-option label="全部職稱" value="all" />
          <el-option v-for="t in titleOptions" :key="t" :label="t" :value="t" />
        </el-select>
        <el-tooltip :content="exportTooltip" placement="top">
          <el-button type="success" @click="exportEmployees">匯出 Excel</el-button>
        </el-tooltip>
        <el-button type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon> 新增員工
        </el-button>
      </div>
    </div>

    <TableSkeleton v-if="loading && !employeeStore.employees.length" :columns="7" />
    <el-card v-else-if="!isMobile" class="no-hover">
      <el-table
        :data="displayedEmployees"
        v-loading="loading"
        stripe
        style="width: 100%"
        max-height="600"
        :row-class-name="rowClassName"
        @row-click="onRowClick"
      >
        <el-table-column prop="employee_id" label="編號" width="100" sortable />
        <el-table-column prop="name" label="姓名" width="120" sortable>
          <template #default="scope">
            <router-link :to="`/employees/${scope.row.id}`" class="name-link" @click.stop>{{ scope.row.name }}</router-link>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="教育局職稱" width="150" sortable />
        <el-table-column prop="position" label="園內職務" width="120" />
        <el-table-column prop="hire_date" label="到職日" width="120" sortable />
        <el-table-column label="狀態" width="160">
          <template #default="scope">
            <el-tag :type="getEmployeeStatus(scope.row).type" size="small">
              {{ getEmployeeStatus(scope.row).label }}
            </el-tag>
            <el-tag
              v-if="isMissingSalary(scope.row)"
              type="warning" size="small" effect="plain" style="margin-left:4px"
            >待補薪資</el-tag>
          </template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="150">
          <template #default="scope">
            <el-tooltip
              v-if="!canWriteEmployees"
              content="需要員工管理編輯權限"
              placement="top"
            >
              <span>
                <el-button link type="primary" size="small" disabled>編輯</el-button>
              </span>
            </el-tooltip>
            <el-button v-else link type="primary" size="small" @click="openEdit(scope.row)">編輯</el-button>
            <el-dropdown
              v-if="canWriteEmployees"
              trigger="click"
              @command="(cmd) => handleRowCommand(cmd, scope.row)"
            >
              <el-button link type="primary" size="small">
                更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-if="scope.row.is_active" command="offboard">辦理離職</el-dropdown-item>
                  <el-dropdown-item v-if="canResetPunchPin" command="reset-punch-pin">重置打卡 PIN</el-dropdown-item>
                  <el-dropdown-item v-if="scope.row.is_active" command="quick-resign" divided>快速標記離職</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState
            v-if="searchQuery || statusFilter !== 'all' || titleFilter !== 'all' || todoFilter !== 'none'"
            title="查無符合條件的員工"
            description="試著調整搜尋關鍵字或篩選條件"
          >
            <template #action>
              <el-button size="small" @click="clearFilters">清除條件</el-button>
            </template>
          </EmptyState>
          <EmptyState v-else title="尚無員工資料" description="點擊「新增員工」開始建立" />
        </template>
      </el-table>
    </el-card>
    <AdminListCards
      v-else
      :items="displayedEmployees"
      :columns="employeeCardColumns"
      row-key="employee_id"
      :loading="loading"
      empty-text="尚無員工資料"
    >
      <template #title="{ item }">
        <router-link :to="`/employees/${item.id}`" class="card-title-link">{{ item.name }}</router-link>
      </template>
      <template #cell-__status="{ item }">
        <el-tag :type="getEmployeeStatus(item).type" size="small">{{ getEmployeeStatus(item).label }}</el-tag>
        <el-tag v-if="isMissingSalary(item)" type="warning" size="small" effect="plain" style="margin-left:4px">待補薪資</el-tag>
      </template>
      <template #actions="{ item }">
        <el-button v-if="canWriteEmployees" link type="primary" size="small" @click="openEdit(item)">編輯</el-button>
        <el-dropdown
          v-if="canWriteEmployees"
          trigger="click"
          @command="(cmd) => handleRowCommand(cmd, item)"
        >
          <el-button link type="primary" size="small">更多<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="item.is_active" command="offboard">辦理離職</el-dropdown-item>
              <el-dropdown-item v-if="canResetPunchPin" command="reset-punch-pin">重置打卡 PIN</el-dropdown-item>
              <el-dropdown-item v-if="item.is_active" command="quick-resign" divided>快速標記離職</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
    </AdminListCards>

    <!-- 統一員工表單彈窗（新增 / 編輯）：儲存後刷新清單 -->
    <EmployeeFormDialog ref="formDialog" @saved="fetchEmployees" />

    <!-- Offboard Modal -->
    <OffboardingModal
      v-if="offboardTarget"
      v-model="offboardVisible"
      :employee-id="offboardTarget.id"
      :employee-name="offboardTarget.name || ''"
      @success="() => fetchEmployees()"
    />
  </div>
</template>

<style scoped>
/* ── 列表頁頂列 ── */
.page-header-left {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}
.roster-stats {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}
.roster-stats .stat-sep {
  margin: 0 var(--space-1);
  color: var(--neutral-300);
}
/* HR 待辦 chips：可點擊，選中時 el-tag effect 切 dark 呈現選中態 */
.todo-chips {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-1);
}
.todo-chip {
  cursor: pointer;
  user-select: none;
}
.search-input { width: 220px; }
.status-filter { width: 132px; }
.title-filter { width: 140px; }

/* 整列可點擊進詳情頁；已離職/待離職列淡化 */
.el-table :deep(tbody tr) { cursor: pointer; }
:deep(.el-table .row-resigned) { opacity: 0.55; }
:deep(.el-table .row-pending) { opacity: 0.8; }
.name-link { color: var(--el-color-primary); text-decoration: none; }
.name-link:hover { text-decoration: underline; }
.card-title-link { cursor: pointer; color: var(--el-color-primary); text-decoration: none; }

/* 窄螢幕：頂列改直向堆疊，搜尋/篩選撐滿好點 */
@media (--to-sm) {
  .employees-page .page-header {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-3);
  }
  .employees-page .header-actions { flex-wrap: wrap; }
  .employees-page .search-input { flex: 1 1 160px; width: auto; }
  .employees-page .status-filter { flex: 1 1 120px; width: auto; }
  .employees-page .title-filter { flex: 1 1 120px; width: auto; }
}
</style>
