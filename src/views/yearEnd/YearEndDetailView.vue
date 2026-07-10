<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
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
  updateCycleStatus,
  exportYearEndSummaryXlsxUrl,
  exportYearEndTransferRosterXlsxUrl,
} from '@/api/yearEnd'
import { apiError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'
import { formatCurrency } from '@/utils/currency'
import { CYCLE_STATUS_TAG, cycleStatusLabel, SIGN_STATUS_TAG } from '@/constants/appraisalYearEnd'
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

const route = useRoute()
const router = useRouter()
const cycleId = Number(route.params.id)

const cycle = ref<YearEndCycle | null>(null)
const settlements = ref<Settlement[]>([])
const specialBonuses = ref<SpecialBonus[]>([])
const classTargets = ref<ClassTarget[]>([])
const loading = ref(false)
const busy = ref(false)
const tab = ref('settlements')

// ── Provenance Drawer ─────────────────────────────────────────────
const provenanceDrawerVisible = ref(false)
const provenanceEmployeeId = ref(0)

const DEDUCTION_KEYS: ProvenanceKey[] = [
  { key: 'attendance_late', label: '遲到/未打卡' },
  { key: 'personal_leave', label: '事假' },
  { key: 'sick_leave', label: '病假' },
  { key: 'meeting_absence', label: '會議缺席' },
]

function openProvenanceDrawer(employeeId: number) {
  provenanceEmployeeId.value = employeeId
  provenanceDrawerVisible.value = true
}
// ─────────────────────────────────────────────────────────────────

const statusLabel = (s: string) =>
  (({
    DRAFT: '草稿',
    SUPERVISOR_SIGNED: '主管已簽',
    ACCOUNTING_SIGNED: '會計已簽',
    FINALIZED: '已核定',
  } as Record<string, string>)[s] || s)

// Task 11②：頂部簽核進度列 counts —— 由已載入 settlements 的 status 本地聚合，
// 不額外打 API（SignProgressBar 純顯示用元件，見 @/views/appraisalYearEnd/components/SignProgressBar.vue）
const settlementCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const s of settlements.value) {
    counts[s.status] = (counts[s.status] ?? 0) + 1
  }
  return counts
})

async function load() {
  loading.value = true
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

// ── 批次簽核/核定 ────────────────────────────────────────────────
const selectedSettlements = ref<Settlement[]>([])
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
    const failed = data?.failed?.length ?? 0
    if (failed) {
      ElMessage.warning(`完成 ${done} 筆，${failed} 筆未處理（狀態不符/職責分離等，明細見伺服器回應）`)
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

// ── Task 11③：週期狀態轉換（OPEN→LOCKED→CLOSED；亦允許倒退救援）────────────
// 自 YearEndListView（Task 10 瘦身時移出）搬入本頁 header；單週期頁故
// statusBusy 簡化為單一 ref（不再是 Task 10 原本的 per-row Record<id, boolean>）。
const canFinalize = computed(() => hasPermission('YEAR_END_FINALIZE'))
const statusBusy = ref(false)

async function transitionStatus(newStatus: 'OPEN' | 'LOCKED' | 'CLOSED', confirmMessage: string) {
  if (!cycle.value) return
  try {
    await ElMessageBox.confirm(confirmMessage, '確認狀態變更', { type: 'warning' })
  } catch {
    return // 使用者按取消
  }
  statusBusy.value = true
  try {
    await updateCycleStatus(cycle.value.id, { status: newStatus })
    ElMessage.success('週期狀態已更新')
    await load()
  } catch (e) {
    ElMessage.error(apiError(e, '狀態更新失敗'))
  } finally {
    statusBusy.value = false
  }
}

function lockCycle() {
  return transitionStatus('LOCKED', `確定要鎖定「${cycle.value?.academic_year} 學年度」週期嗎？鎖定後將無法再自動重新試算。`)
}

// Task 11③：封存前置檢核 —— 尚有結算單未核定（FINALIZED）時直接阻擋，不進入 confirm 流程。
async function closeCycle() {
  const notFinalized = settlements.value.filter((s) => s.status !== 'FINALIZED')
  if (notFinalized.length > 0) {
    ElMessageBox.alert(
      `尚有 ${notFinalized.length} 筆結算單未核定（FINALIZED），無法封存。請先完成簽核。`,
      '無法封存',
      { type: 'error' },
    )
    return
  }
  return transitionStatus('CLOSED', `封存前請確認：此週期所有結算單須全數核定（FINALIZED）。確定要封存「${cycle.value?.academic_year} 學年度」週期嗎？`)
}
function reopenToLocked() {
  return transitionStatus('LOCKED', `確定要將「${cycle.value?.academic_year} 學年度」退回鎖定狀態嗎？（救援用途）`)
}
function reopenToOpen() {
  return transitionStatus('OPEN', `確定要將「${cycle.value?.academic_year} 學年度」退回開放狀態嗎？（救援用途）`)
}

onMounted(load)
</script>

<template>
  <div class="ye-detail">
    <el-page-header @back="router.back()" content="年終獎金明細" />
    <div v-if="cycle" class="meta">
      <strong>{{ cycle.academic_year }} 學年度</strong> ｜
      基準日 {{ cycle.bonus_calc_date }} ｜
      <el-tag :type="CYCLE_STATUS_TAG[cycle.status] || 'info'" size="small">{{ cycleStatusLabel(cycle.status) }}</el-tag>
    </div>

    <!-- Task 11②：頂部簽核進度列，counts 由已載入 settlements 本地聚合 -->
    <SignProgressBar :counts="settlementCounts" class="sign-progress-wrap" />

    <div class="toolbar">
      <el-button :icon="Refresh" @click="load">重新載入</el-button>
      <el-button :icon="Download" tag="a" :href="exportYearEndSummaryXlsxUrl(cycleId)">年終獎金總表</el-button>
      <el-button :icon="Download" tag="a" :href="exportYearEndTransferRosterXlsxUrl(cycleId)">轉帳名冊</el-button>

      <!-- Task 11③：週期狀態機（自 YearEndListView 搬入），須 YEAR_END_FINALIZE 權限 -->
      <template v-if="canFinalize && cycle">
        <el-button
          v-if="cycle.status === 'OPEN'"
          type="warning"
          :loading="statusBusy"
          data-test="lock-cycle-button"
          @click="lockCycle"
        >鎖定</el-button>
        <template v-else-if="cycle.status === 'LOCKED'">
          <el-button
            type="primary"
            :loading="statusBusy"
            data-test="close-cycle-button"
            @click="closeCycle"
          >封存</el-button>
          <el-button
            :loading="statusBusy"
            data-test="reopen-open-button"
            @click="reopenToOpen"
          >退回開放</el-button>
        </template>
        <el-button
          v-else-if="cycle.status === 'CLOSED'"
          :loading="statusBusy"
          data-test="reopen-locked-button"
          @click="reopenToLocked"
        >退回鎖定</el-button>
      </template>
    </div>

    <el-tabs v-model="tab">
      <el-tab-pane label="員工結算單" name="settlements">
        <div v-if="selectedSettlements.length" class="batch-bar">
          <span>已選 {{ selectedSettlements.length }} 筆：</span>
          <el-button v-if="hasPermission('YEAR_END_REVIEW')" size="small" :loading="busy" @click="signBatch('supervisor')">批次主管簽核</el-button>
          <el-button v-if="hasPermission('YEAR_END_ACCOUNTING')" size="small" :loading="busy" @click="signBatch('accounting')">批次會計簽核</el-button>
          <el-button v-if="hasPermission('YEAR_END_FINALIZE')" size="small" type="primary" :loading="busy" @click="signBatch('finalize')">批次核定</el-button>
        </div>
        <el-table :data="settlements" v-loading="loading" stripe size="small" @selection-change="handleSelectionChange">
          <el-table-column type="selection" width="44" />
          <el-table-column label="員工" width="110">
            <template #default="{ row }">
              <span :title="`ID ${row.employee_id}`">{{ row.employee_name }}</span>
            </template>
          </el-table-column>
          <el-table-column label="平均績效%" prop="avg_performance_rate" width="100" />
          <el-table-column label="基本薪俸" width="100">
            <template #default="{ row }">{{ formatCurrency(row.base_salary) }}</template>
          </el-table-column>
          <el-table-column label="節慶獎金" width="100">
            <template #default="{ row }">{{ formatCurrency(row.festival_total) }}</template>
          </el-table-column>
          <el-table-column label="毛額" width="110">
            <template #default="{ row }">{{ formatCurrency(row.gross_amount) }}</template>
          </el-table-column>
          <el-table-column label="達成%" prop="org_achievement_rate" width="80" />
          <el-table-column label="小計" width="110">
            <template #default="{ row }">{{ formatCurrency(row.subtotal_amount) }}</template>
          </el-table-column>
          <el-table-column label="扣項合計" width="120">
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
          <el-table-column label="到職月" prop="hire_months" width="80" />
          <el-table-column label="應領小計" width="120">
            <template #default="{ row }">{{ formatCurrency(row.payable_amount) }}</template>
          </el-table-column>
          <el-table-column label="特別獎金" width="110">
            <template #default="{ row }">{{ formatCurrency(row.special_bonus_total) }}</template>
          </el-table-column>
          <el-table-column label="總額" width="120">
            <template #default="{ row }">
              <strong>{{ formatCurrency(row.total_amount) }}</strong>
            </template>
          </el-table-column>
          <el-table-column label="狀態" width="120">
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
          <el-table-column label="金額" width="120">
            <template #default="{ row }">{{ formatCurrency(row.amount) }}</template>
          </el-table-column>
          <el-table-column label="班級" prop="classroom_id" width="80" />
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
          <el-table-column label="編制人數" prop="head_count_target" width="100" />
          <el-table-column label="平均在籍" prop="avg_monthly_enrollment" width="100" />
          <el-table-column label="經營績效%" prop="class_performance_rate" width="120" />
          <el-table-column label="舊生註冊率" prop="returning_student_rate" width="120" />
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
  </div>
</template>

<style scoped>
.ye-detail { padding: 16px; }
.meta { margin: 12px 0; padding: 12px; background: #f5f7fa; border-radius: 4px; display: flex; align-items: center; gap: 8px; }
.sign-progress-wrap { margin: 0 0 12px; }
.toolbar { margin: 16px 0; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.batch-bar { margin: 0 0 8px; display: flex; align-items: center; gap: 8px; font-size: 13px; }
</style>
