<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh, Download } from '@element-plus/icons-vue'
import {
  listYearEndCycles,
  listYearEndSettlements,
  listSpecialBonuses,
  listClassEnrollmentTargets,
  signSupervisorSettlement,
  signAccountingSettlement,
  finalizeSettlement,
  signSupervisorBatch,
  signAccountingBatch,
  finalizeBatch,
  exportYearEndSummaryXlsxUrl,
  exportYearEndTransferRosterXlsxUrl,
  rejectSettlement,
} from '@/api/yearEnd'
import { rejectableStages, formatBatchFailures } from './settlementReject'
import { apiError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'
import { formatCurrency } from '@/utils/currency'
import { SIGN_STATUS_TAG, SIGN_STATUS_ORDER, signStatusLabel } from '@/constants/appraisalYearEnd'
import SignProgressBar from '@/views/appraisalYearEnd/components/SignProgressBar.vue'
import ProvenanceDrawer from './components/ProvenanceDrawer.vue'
import type { ProvenanceKey } from './components/ProvenanceDrawer.vue'

interface Settlement { id: number; employee_id: number; employee_name?: string; status: string; total_amount?: number | string; [key: string]: unknown }
interface SpecialBonus { id: number; employee_id: number; employee_name?: string; bonus_type: string; period_label: string; amount: number | string; classroom_id?: number | null }
interface ClassTarget {
  id: number
  classroom_id: number
  classroom_name?: string | null
  head_teacher_employee_id?: number | null
  head_teacher_name?: string | null
  assistant_employee_id?: number | null
  deputy_teacher_name?: string | null
  [key: string]: unknown
}
interface YearEndCycle { id: number; academic_year: number; bonus_calc_date: string; status: string }

const props = defineProps<{ cycleId: number }>()
const cycleId = props.cycleId

const cycle = ref<YearEndCycle | null>(null)
const settlements = ref<Settlement[]>([])
const specialBonuses = ref<SpecialBonus[]>([])
const classTargets = ref<ClassTarget[]>([])
const loading = ref(false)
const busy = ref(false)
const route = useRoute()
const router = useRouter()

// tab／employee 上 URL query：分享連結或重整能停在同一個分頁／同一個員工的
// 計算軌跡，不用重新點（比照 CycleDetailPanel.vue 的 view query 同步 pattern）。
const VALID_TABS = ['settlements', 'bonuses', 'classes']
const initialQueryTab = String(route?.query?.tab ?? '')
const tab = ref(VALID_TABS.includes(initialQueryTab) ? initialQueryTab : 'settlements')
watch(tab, (next) => {
  if (router?.replace) {
    router.replace({ query: { ...(route?.query || {}), tab: next } })
  }
})

// ── Provenance Drawer ─────────────────────────────────────────────
const provenanceDrawerVisible = ref(false)
const provenanceEmployeeId = ref(0)

// Task 16 動態化：keys 對齊後端 services/provenance/base.py KNOWN_KEYS（唯一可被
// /api/provenance/{key} 接受的 4 個 key，非本頁自訂）；label 走查表 + fallback raw
// key，未來 KNOWN_KEYS 新增項目時只需補一筆查表，不會漏標籤整段消失。
const DEDUCTION_KEY_LABELS: Record<string, string> = {
  attendance_late: '遲到/未打卡',
  personal_leave: '事假',
  sick_leave: '病假',
  meeting_absence: '會議缺席',
}
const DEDUCTION_KEYS: ProvenanceKey[] = Object.keys(DEDUCTION_KEY_LABELS).map((key) => ({
  key,
  label: DEDUCTION_KEY_LABELS[key] ?? key,
}))

function openProvenanceDrawer(employeeId: number) {
  provenanceEmployeeId.value = employeeId
  provenanceDrawerVisible.value = true
  if (router?.replace) {
    router.replace({ query: { ...(route?.query || {}), employee: String(employeeId) } })
  }
}

// drawer 關閉時清掉 employee query（同 CycleDetailPanel.vue 的 openDetail 收尾 pattern）。
// ⚠ 不可加 `if (!route?.query?.employee) return` 這種依賴 route.query 即時反應性的
// guard：測試 mock 的 router.replace 無 side effect，不會回寫 route.query，guard
// 會誤判「本來就沒有」而整個跳過清除（Task 1 CycleDetailPanel.vue 已踩過同一坑，
// 此處比照拿掉 guard，改無條件呼叫）。
watch(provenanceDrawerVisible, (visible) => {
  if (visible) return
  const q = { ...(route?.query || {}) }
  delete q.employee
  router?.replace?.({ query: q })
})
// ─────────────────────────────────────────────────────────────────

// 文案取自單一來源（constants/appraisalYearEnd.STATUS_LABEL），保留本地名供 template 與既有測試
const statusLabel = signStatusLabel

// Task 11②：頂部簽核進度列 counts —— 由已載入 settlements 的 status 本地聚合，
// 不額外打 API（SignProgressBar 純顯示用元件，見 @/views/appraisalYearEnd/components/SignProgressBar.vue）
const settlementCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const s of settlements.value) {
    counts[s.status] = (counts[s.status] ?? 0) + 1
  }
  return counts
})

// T11-M1：特別獎金表「班級」欄原本只顯示裸 classroom_id——用同頁已載入的
// class targets（載入 classTargets 時已含 classroom_name）建 id → name map；
// 查無對應（未編班/資料缺口）時 fallback 顯示「班級 {id}」而非空白或裸 ID。
const classroomNameById = computed(() => {
  const map = new Map<number, string>()
  for (const ct of classTargets.value) {
    if (ct.classroom_name) map.set(ct.classroom_id, ct.classroom_name)
  }
  return map
})
function classroomLabel(classroomId: number | null | undefined): string {
  if (classroomId == null) return '—'
  return classroomNameById.value.get(classroomId) ?? `班級 ${classroomId}`
}

// ── 表格排序（Task 16）────────────────────────────────────────────
// 金額/百分比欄位是後端 Decimal 序列化的字串或 template 渲染值，非 row 直接可比較的
// 數字，plain sortable 會做字典序比較（"10000" 排到 "9000" 前）或直接失效
// （欄位值來自 template slot 而非 prop）；一律走 sort-method 轉數字比較。
// 泛型收 Record<string, unknown>：結算單（Settlement）、特別獎金（SpecialBonus）、
// 班級績效（ClassTarget）三表共用。
function sortByField(field: string) {
  return (a: Record<string, unknown>, b: Record<string, unknown>) =>
    Number(a[field] ?? 0) - Number(b[field] ?? 0)
}
function sortBySettlementStatus(a: Settlement, b: Settlement) {
  const order = SIGN_STATUS_ORDER as readonly string[]
  return order.indexOf(a.status) - order.indexOf(b.status)
}

const loadError = ref(false)

async function load() {
  loading.value = true
  loadError.value = false
  try {
    // 四支彼此無依賴、皆只吃 cycleId → 併發載入，首載等待取最慢者而非四次 round-trip 相加
    const [cyclesRes, settRes, sbRes, ctRes] = await Promise.all([
      listYearEndCycles(),
      listYearEndSettlements(cycleId),
      listSpecialBonuses(cycleId),
      listClassEnrollmentTargets(cycleId),
    ])
    const cycles = cyclesRes.data as YearEndCycle[]
    cycle.value = cycles.find((c) => c.id === cycleId) ?? null
    settlements.value = settRes.data
    specialBonuses.value = sbRes.data
    classTargets.value = ctRes.data
  } catch (e) {
    ElMessage.error(apiError(e, '載入失敗'))
    loadError.value = true
  } finally {
    loading.value = false
  }
}

// 對齊 BE _apply_accounting_sign 狀態機：DRAFT 或 SUPERVISOR_SIGNED 皆可會計簽核
// （批次主管簽核後，行級「會計簽核」按鈕不可消失）
function canAccountingSign(row: { status: string }): boolean {
  return ['DRAFT', 'SUPERVISOR_SIGNED'].includes(row.status) && hasPermission('YEAR_END_ACCOUNTING')
}

async function sign(s: Settlement, stage: string) {
  busy.value = true
  try {
    if (stage === 'supervisor') await signSupervisorSettlement(s.id)
    else if (stage === 'accounting') await signAccountingSettlement(s.id)
    else if (stage === 'finalize') await finalizeSettlement(s.id)
    ElMessage.success('簽核完成')
    await load()
  } catch (e) {
    ElMessage.error(apiError(e, '簽核失敗'))
  } finally {
    busy.value = false
  }
}

// ── 退回草稿（含 FINALIZED 警示）─────────────────────────────────
const rejectDialog = ref(false)
const rejectTarget = ref<Settlement | null>(null)
const rejectReason = ref('')

function canReject(row: { status: string }): boolean {
  const perm = rejectableStages[row.status]
  return !!perm && hasPermission(perm) && cycle.value?.status === 'OPEN'
}

function openReject(row: Settlement) {
  rejectTarget.value = row
  rejectReason.value = ''
  rejectDialog.value = true
}

async function submitReject() {
  if (!rejectTarget.value || !rejectReason.value.trim()) return
  busy.value = true
  try {
    await rejectSettlement(rejectTarget.value.id, rejectReason.value.trim())
    ElMessage.success('已退回草稿，可重新手動調整或試算')
    rejectDialog.value = false
    await load()
  } catch (e) {
    ElMessage.error(apiError(e, '退回失敗'))
  } finally {
    busy.value = false
  }
}

// ── 批次簽核/核定 ────────────────────────────────────────────────
const selectedSettlements = ref<Settlement[]>([])
const batchFailures = ref<string[]>([])
function handleSelectionChange(rows: Settlement[]) {
  selectedSettlements.value = rows
}

async function signBatch(stage: 'supervisor' | 'accounting' | 'finalize') {
  if (!selectedSettlements.value.length) return
  const ids = selectedSettlements.value.map((s) => s.id)
  busy.value = true
  try {
    const res =
      stage === 'supervisor'
        ? await signSupervisorBatch(ids)
        : stage === 'accounting'
          ? await signAccountingBatch(ids)
          : await finalizeBatch(ids)
    const data = res.data as { succeeded_count?: number; failed?: { settlement_id: number; reason: string }[] }
    const done = data?.succeeded_count ?? 0
    const failedItems = data?.failed ?? []
    batchFailures.value = formatBatchFailures(failedItems, settlements.value)
    if (failedItems.length) {
      ElMessage.warning(`完成 ${done} 筆，${failedItems.length} 筆未處理（明細見下方清單）`)
    } else {
      ElMessage.success(`已完成 ${done} 筆`)
    }
    selectedSettlements.value = []
    await load()
  } catch (e) {
    ElMessage.error(apiError(e, '批次簽核失敗'))
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  load()
  const initialEmployee = Number(route?.query?.employee)
  if (!Number.isNaN(initialEmployee) && initialEmployee > 0) {
    openProvenanceDrawer(initialEmployee)
  }
})
</script>

<template>
  <div class="ye-detail">
    <!-- Task 11②：頂部簽核進度列，counts 由已載入 settlements 本地聚合 -->
    <SignProgressBar :counts="settlementCounts" class="sign-progress-wrap" />

    <div class="toolbar">
      <el-button :icon="Refresh" @click="load">重新載入</el-button>
      <el-button :icon="Download" tag="a" :href="exportYearEndSummaryXlsxUrl(cycleId)">年終獎金總表</el-button>
      <el-button :icon="Download" tag="a" :href="exportYearEndTransferRosterXlsxUrl(cycleId)">轉帳名冊</el-button>
    </div>

    <div v-if="loadError" class="ye-detail-error">
      載入失敗
      <el-button data-test="detail-load-retry" size="small" text type="primary" @click="load">重試</el-button>
    </div>

    <el-tabs v-model="tab">
      <el-tab-pane label="員工結算單" name="settlements">
        <div v-if="selectedSettlements.length" class="batch-bar">
          <span>已選 {{ selectedSettlements.length }} 筆：</span>
          <el-button v-if="hasPermission('YEAR_END_REVIEW')" size="small" :loading="busy" @click="signBatch('supervisor')">批次主管簽核</el-button>
          <el-button v-if="hasPermission('YEAR_END_ACCOUNTING')" size="small" :loading="busy" @click="signBatch('accounting')">批次會計簽核</el-button>
          <el-button v-if="hasPermission('YEAR_END_FINALIZE')" size="small" type="primary" :loading="busy" @click="signBatch('finalize')">批次核定</el-button>
        </div>
        <el-alert
          v-if="batchFailures.length"
          type="warning"
          :closable="true"
          show-icon
          title="以下結算單未完成批次簽核"
          style="margin: 8px 0"
          @close="batchFailures = []"
        >
          <ul style="margin: 4px 0 0; padding-left: 18px">
            <li v-for="line in batchFailures" :key="line">{{ line }}</li>
          </ul>
        </el-alert>
        <el-table :data="settlements" v-loading="loading" stripe size="small" @selection-change="handleSelectionChange">
          <el-table-column type="selection" width="44" />
          <el-table-column label="員工" width="110">
            <template #default="{ row }">
              <span :title="`ID ${row.employee_id}`">{{ row.employee_name }}</span>
            </template>
          </el-table-column>
          <el-table-column label="平均績效%" prop="avg_performance_rate" width="100" sortable :sort-method="sortByField('avg_performance_rate')" />
          <el-table-column label="基本薪俸" width="100" sortable :sort-method="sortByField('base_salary')">
            <template #default="{ row }">{{ formatCurrency(row.base_salary) }}</template>
          </el-table-column>
          <el-table-column label="節慶獎金" width="100" sortable :sort-method="sortByField('festival_total')">
            <template #default="{ row }">{{ formatCurrency(row.festival_total) }}</template>
          </el-table-column>
          <el-table-column label="毛額" width="110" sortable :sort-method="sortByField('gross_amount')">
            <template #default="{ row }">{{ formatCurrency(row.gross_amount) }}</template>
          </el-table-column>
          <el-table-column label="達成%" prop="org_achievement_rate" width="80" sortable :sort-method="sortByField('org_achievement_rate')" />
          <el-table-column label="小計" width="110" sortable :sort-method="sortByField('subtotal_amount')">
            <template #default="{ row }">{{ formatCurrency(row.subtotal_amount) }}</template>
          </el-table-column>
          <el-table-column label="扣項合計" width="120" sortable :sort-method="sortByField('deduction_total')">
            <template #default="{ row }">
              <el-button
                type="primary"
                link
                size="small"
                @click="openProvenanceDrawer(row.employee_id)"
              >
                {{ formatCurrency(row.deduction_total) }} ↓
              </el-button>
            </template>
          </el-table-column>
          <el-table-column label="到職月" prop="hire_months" width="80" sortable :sort-method="sortByField('hire_months')" />
          <el-table-column label="應領小計" width="120" sortable :sort-method="sortByField('payable_amount')">
            <template #default="{ row }">{{ formatCurrency(row.payable_amount) }}</template>
          </el-table-column>
          <el-table-column label="特別獎金" width="110" sortable :sort-method="sortByField('special_bonus_total')">
            <template #default="{ row }">{{ formatCurrency(row.special_bonus_total) }}</template>
          </el-table-column>
          <el-table-column label="總額" width="120" sortable :sort-method="sortByField('total_amount')">
            <template #default="{ row }">
              <strong>{{ formatCurrency(row.total_amount) }}</strong>
            </template>
          </el-table-column>
          <el-table-column label="狀態" width="120" sortable :sort-method="sortBySettlementStatus">
            <template #default="{ row }">
              <el-tag size="small" :type="SIGN_STATUS_TAG[row.status]">{{ statusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="簽核" width="220">
            <template #default="{ row }">
              <!-- 簽核流程：DRAFT →（可選批次主管簽）→ 會計簽核 → 老闆核定 -->
              <el-button
                v-if="canAccountingSign(row)"
                size="small"
                @click="sign(row, 'accounting')"
              >會計簽核</el-button>
              <el-button
                v-else-if="row.status === 'ACCOUNTING_SIGNED' && hasPermission('YEAR_END_FINALIZE')"
                size="small"
                type="primary"
                @click="sign(row, 'finalize')"
              >老闆核定</el-button>
              <el-tag
                v-else-if="row.status === 'FINALIZED'"
                type="success"
                size="small"
              >已核定</el-tag>
              <el-button
                v-if="canReject(row)"
                size="small"
                type="warning"
                plain
                @click="openReject(row)"
              >退回</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="特別獎金" name="bonuses">
        <el-table :data="specialBonuses" v-loading="loading" stripe size="small">
          <el-table-column label="員工" width="110">
            <template #default="{ row }">
              <span :title="`ID ${row.employee_id}`">{{ row.employee_name }}</span>
            </template>
          </el-table-column>
          <el-table-column label="獎金類型" prop="bonus_type" width="220" />
          <el-table-column label="期間" prop="period_label" width="160" />
          <el-table-column label="金額" width="120" sortable :sort-method="sortByField('amount')">
            <template #default="{ row }">{{ formatCurrency(row.amount) }}</template>
          </el-table-column>
          <el-table-column label="班級" width="100">
            <template #default="{ row }">
              <span :title="row.classroom_id != null ? `ID ${row.classroom_id}` : ''">{{ classroomLabel(row.classroom_id) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="班級經營績效" name="classes">
        <el-table :data="classTargets" v-loading="loading" stripe size="small">
          <el-table-column label="學期" width="80">
            <template #default="{ row }">{{ row.semester_first ? '上' : '下' }}</template>
          </el-table-column>
          <el-table-column label="班級" width="120">
            <template #default="{ row }">
              <span :title="`ID ${row.classroom_id}`">{{ row.classroom_name ?? `班級 ${row.classroom_id}` }}</span>
            </template>
          </el-table-column>
          <el-table-column label="班導" width="100">
            <template #default="{ row }">
              <span :title="row.head_teacher_employee_id != null ? `ID ${row.head_teacher_employee_id}` : ''">
                {{ row.head_teacher_name ?? '—' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="副班導" width="100">
            <template #default="{ row }">
              <span :title="row.assistant_employee_id != null ? `ID ${row.assistant_employee_id}` : ''">
                {{ row.deputy_teacher_name ?? '—' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="編制人數" prop="head_count_target" width="100" sortable />
          <!-- 下三欄為後端 Decimal→JSON 字串，plain sortable 走字典序（"12.5" 排 "9.3" 前）誤排，需 sort-method 數值比較 -->
          <el-table-column label="平均在籍" prop="avg_monthly_enrollment" width="100" sortable :sort-method="sortByField('avg_monthly_enrollment')" />
          <el-table-column label="經營績效%" prop="class_performance_rate" width="120" sortable :sort-method="sortByField('class_performance_rate')" />
          <el-table-column label="舊生註冊率" prop="returning_student_rate" width="120" sortable :sort-method="sortByField('returning_student_rate')" />
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 扣款 provenance 右側抽屜 -->
    <ProvenanceDrawer
      v-model="provenanceDrawerVisible"
      :cycle-id="cycleId"
      :employee-id="provenanceEmployeeId"
      :provenance-keys="DEDUCTION_KEYS"
    />

    <!-- 退回草稿 dialog -->
    <el-dialog v-model="rejectDialog" title="退回草稿" width="480px">
      <el-alert
        v-if="rejectTarget?.status === 'FINALIZED'"
        type="warning" :closable="false" show-icon
        title="此筆已核定：退回後將自財務報表移除，需重新完成簽核與核定。"
        style="margin-bottom: 12px"
      />
      <el-form label-width="80px">
        <el-form-item label="員工">{{ rejectTarget?.employee_name }}</el-form-item>
        <el-form-item label="原因" required>
          <el-input v-model="rejectReason" type="textarea" :rows="3"
            placeholder="退回原因（必填，寫入簽核軌跡）" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectDialog = false">取消</el-button>
        <el-button type="warning" :loading="busy" :disabled="!rejectReason.trim()"
          @click="submitReject">確認退回</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.ye-detail-error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--el-color-danger);
  font-size: var(--text-sm);
  margin-bottom: var(--space-3);
}
.ye-detail { padding: var(--space-4); }
.sign-progress-wrap { margin: 0 0 var(--space-3); }
.toolbar { margin: var(--space-4) 0; display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
.batch-bar { margin: 0 0 var(--space-2); display: flex; align-items: center; gap: var(--space-2); font-size: 13px; }
</style>
