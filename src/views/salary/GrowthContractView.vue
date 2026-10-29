<template>
  <div>
    <el-result
      v-if="!canViewFullSalary"
      icon="warning"
      title="無法檢視全員薪資資料"
      sub-title="此功能僅開放具完整薪資視野的角色使用"
    />
    <template v-else>
    <PageHeader title="自主成長獎勵金" subtitle="研習時數登記、學年結算預覽與每年 8 月發放">
      <template #actions>
        <el-select v-model="schoolYear" style="width: 120px" aria-label="學年">
          <el-option v-for="y in schoolYearOptions" :key="y" :value="y" :label="`${y} 學年`" />
        </el-select>
      </template>
    </PageHeader>

    <el-alert
      v-if="!previewError"
      class="pending-rule-alert"
      type="warning"
      show-icon
      :closable="false"
      title="金額試算規則"
      :description="pendingRule || DEFAULT_PENDING_RULE"
    />
    <p v-if="paidPeriod && !previewError" class="paid-period-hint">將於 {{ paidPeriod }} 發放</p>

    <section class="hours-section">
      <div class="section-header">
        <h3>研習時數登記</h3>
        <div class="section-actions">
          <el-select
            v-model="hoursEmployeeFilter"
            clearable
            filterable
            placeholder="全部員工"
            aria-label="依員工篩選"
            class="hours-filter"
          >
            <el-option v-for="emp in employeeOptions" :key="emp.id" :value="emp.id" :label="emp.name" />
          </el-select>
          <AdminCreateButton v-if="canWrite" @click="openHourDialog()">新增時數</AdminCreateButton>
        </div>
      </div>

      <LoadErrorState
        v-if="hoursError"
        compact
        title="研習時數載入失敗"
        description="載入成功前請勿視為沒有登記過時數，請重新載入。"
        :retrying="hoursLoading"
        @retry="fetchHours"
      />
      <EmptyState
        v-else-if="!hoursLoading && hourTableData.length === 0"
        variant="inline"
        title="尚無時數登記"
        :description="canWrite ? '點右上角「新增時數」開始登記研習時數' : '本學年尚未登記研習時數'"
      />
      <template v-else>
        <p class="scroll-hint">表格可左右滑動，查看全部欄位</p>
        <el-table v-loading="hoursLoading" :data="hourTableData" stripe style="width: 100%">
          <el-table-column prop="employee_name" label="員工" min-width="120" fixed />
          <el-table-column prop="semesterLabel" label="學期" width="90" />
          <el-table-column prop="activity_date" label="日期" width="110" />
          <el-table-column prop="hours" label="時數" width="80" />
          <el-table-column prop="title" label="課程／研習名稱" min-width="160" />
          <el-table-column prop="note" label="備註" min-width="140" />
          <el-table-column v-if="canWrite" label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button link size="small" @click="openHourDialog(row)">編輯</el-button>
              <el-button link size="small" type="danger" @click="confirmDeleteHour(row)">刪除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </section>

    <section class="preview-section">
      <div class="section-header">
        <h3>學年結算預覽</h3>
        <div class="section-actions">
          <el-checkbox v-model="onlyEligiblePayable">只顯示符合資格且金額 &gt; 0</el-checkbox>
          <el-button
            v-if="canWrite"
            type="primary"
            :loading="settling"
            :disabled="settleDisabled"
            @click="doSettle"
          >結算</el-button>
        </div>
      </div>

      <el-alert
        v-if="settleResult"
        class="settle-result-alert"
        type="success"
        show-icon
        :closable="false"
        :title="settleResultLabel"
        :description="settleSelfSkipDescription"
      />

      <LoadErrorState
        v-if="previewError"
        compact
        title="結算預覽載入失敗"
        description="載入成功前無法結算，也請勿視為沒有符合資格的人，請重新載入。"
        :retrying="previewLoading"
        @retry="fetchPreview"
      />
      <EmptyState
        v-else-if="!previewLoading && previewTableData.length === 0"
        variant="inline"
        title="查無資料"
        description="該學年查無在職或於學年內離職的員工，或篩選條件下無符合資格者"
      />
      <template v-else>
        <p class="scroll-hint">表格可左右滑動，查看全部欄位</p>
        <el-table v-loading="previewLoading" :data="previewTableData" stripe style="width: 100%">
          <el-table-column label="員工" min-width="130" fixed>
            <template #default="{ row }">
              {{ row.employee_name }}
              <span v-if="row.position_unknown" class="badge-unknown">職務未知</span>
            </template>
          </el-table-column>
          <el-table-column label="職務月額" width="110">
            <template #default="{ row }">
              {{ row.monthlyRateLabel }}
              <div v-if="row.rate_overridden" class="amount-cell__hint" title="學年中有職務異動月額覆寫，金額依逐月月額小計">
                有異動覆寫・小計 {{ row.subtotalLabel }}
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="required_hours" label="應修時數" width="90" />
          <el-table-column label="實際時數" width="140">
            <template #default="{ row }">
              {{ row.actual_hours }}
              <div v-for="label in row.semesterLabels" :key="label" class="amount-cell__hint">{{ label }}</div>
            </template>
          </el-table-column>
          <el-table-column label="時數比例" width="90">
            <template #default="{ row }">{{ row.hoursRatioLabel }}</template>
          </el-table-column>
          <el-table-column prop="tenure_months" label="在職月數" width="90" />
          <el-table-column label="資格條件" min-width="240">
            <template #default="{ row }">
              <span
                v-for="g in row.gateItems"
                :key="g.code"
                class="gate-tag"
                :class="g.cls"
                :title="`${g.label}：${g.detail}`"
              >{{ g.symbol }} {{ g.label }}</span>
            </template>
          </el-table-column>
          <el-table-column label="金額（試算）" width="180">
            <template #default="{ row }">
              <div class="amount-cell">
                <strong>{{ row.amountLabel }}</strong>
                <span class="amount-cell__badge">試算</span>
                <div v-if="row.amountHintLabel" class="amount-cell__hint">{{ row.amountHintLabel }}</div>
                <div
                  v-if="row.deduction_amount > 0"
                  class="amount-cell__hint"
                  :title="row.deductionDetail"
                >含扣抵 −{{ row.deductionLabel }}</div>
                <div v-if="row.deduction_unapplied > 0" class="amount-cell__warn">
                  ⚠ 扣不完 {{ row.deductionUnappliedLabel }}
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="資格" width="90">
            <template #default="{ row }">
              <el-tag :type="row.eligible ? 'success' : 'info'">{{ row.eligibleLabel }}</el-tag>
            </template>
          </el-table-column>
          <!-- 義華 Q14：節慶未扣餘額（不足額結轉）可勾選以本次獎勵金扣抵；不勾不扣 -->
          <el-table-column v-if="hasPendingCarry" label="節慶未扣餘額" width="150">
            <template #default="{ row }">
              <template v-if="row.pending_festival_carry > 0">
                <div>{{ row.pendingCarryLabel }}</div>
                <el-checkbox
                  v-if="canWrite && row.eligible && row.amount > 0"
                  :model-value="carryOffsetIds.includes(row.employee_id)"
                  size="small"
                  :aria-label="`${row.employee_name} 結算時扣抵節慶未扣餘額`"
                  @update:model-value="(v: string | number | boolean) => toggleCarryOffset(row.employee_id, v === true)"
                >結算時扣抵</el-checkbox>
              </template>
              <span v-else class="hint">—</span>
            </template>
          </el-table-column>
          <el-table-column label="簽約日" width="130" fixed="right">
            <template #default="{ row }">
              <div class="signed-on-cell">
                <span :class="{ 'signed-on-cell__empty': !row.signed_on }">{{ row.signed_on || '未簽約' }}</span>
                <el-button
                  v-if="canWrite"
                  link
                  size="small"
                  type="primary"
                  :aria-label="`設定 ${row.employee_name} 的簽約日`"
                  @click="openSignedOnDialog(row)"
                >{{ row.signed_on ? '修改' : '設定' }}</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </section>

    <GrowthAdjustmentsPanel
      :school-year="schoolYear"
      :can-write="canWrite"
      :employee-options="employeeOptions"
      :paid-employee-ids="paidEmployeeIdList"
      @changed="fetchPreview"
    />

    <section class="paid-section">
      <h3>已發放明細（獨立轉帳）</h3>
      <LoadErrorState
        v-if="extraBonusError"
        compact
        title="已發放明細載入失敗"
        description="載入成功前請勿視為尚未發放，請重新載入。"
        :retrying="extraBonusLoading"
        @retry="fetchSettledPayments"
      />
      <EmptyState
        v-else-if="!extraBonusLoading && extraBonusItems.length === 0"
        variant="inline"
        title="查無已發放明細"
        description="尚未結算過，或該學年對應的發放年月查無紀錄"
      />
      <el-table v-else v-loading="extraBonusLoading" :data="extraBonusTableData" stripe style="width: 100%">
        <el-table-column prop="employee_name" label="員工" min-width="120" />
        <el-table-column label="金額" width="120">
          <template #default="{ row }">{{ row.amountLabel }}</template>
        </el-table-column>
        <el-table-column label="歸屬年月" width="120">
          <template #default="{ row }">{{ row.period_year }} / {{ row.period_month }}</template>
        </el-table-column>
        <el-table-column prop="remark" label="備註" min-width="200" />
      </el-table>
    </section>

    <!-- 新增／編輯時數 dialog -->
    <FormDialog
      ref="hourDialogRef"
      v-model="hourDialogVisible"
      :title="hourForm.id != null ? '編輯時數登記' : '新增時數登記'"
      size="standardNarrow"
      :submit-text="hourForm.id != null ? '儲存' : '新增'"
      :dirty="hourDirty"
      :loading="hourSaving"
      :enter-submit="false"
      @submit="submitHour"
    >
      <el-alert
        v-if="hourPaidNotice"
        class="paid-impact-alert"
        type="warning"
        show-icon
        :closable="false"
        :title="hourPaidNotice"
      />
      <el-form ref="hourFormRef" :model="hourForm" :rules="hourRules" label-position="top" class="form-grid" @submit.prevent>
        <el-form-item label="員工" prop="employee_id" class="fg-12">
          <el-select v-model="hourForm.employee_id" filterable :disabled="hourForm.id != null" style="width: 100%">
            <el-option v-for="emp in employeeOptions" :key="emp.id" :value="emp.id" :label="emp.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="學年" prop="school_year" class="fg-6">
          <el-input-number v-model="hourForm.school_year" :min="100" :max="200" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="學期" prop="semester" class="fg-6">
          <el-select v-model="hourForm.semester" style="width: 100%">
            <el-option :value="1" label="上學期" />
            <el-option :value="2" label="下學期" />
          </el-select>
        </el-form-item>
        <el-form-item label="研習日期" prop="activity_date" class="fg-6">
          <el-date-picker v-model="hourForm.activity_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="時數" prop="hours" class="fg-6">
          <el-input-number v-model="hourForm.hours" :min="0.5" :step="0.5" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="課程名稱" prop="title" class="fg-12">
          <el-input v-model="hourForm.title" maxlength="200" />
        </el-form-item>
        <el-form-item label="備註" class="fg-12">
          <el-input v-model="hourForm.note" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
    </FormDialog>

    <!-- 簽約日維護 dialog -->
    <FormDialog
      ref="signedOnDialogRef"
      v-model="signedOnDialogVisible"
      title="簽約日維護"
      size="compact"
      :dirty="signedOnDirty"
      :loading="signedOnSaving"
      :enter-submit="false"
      @submit="saveSignedOn"
    >
      <template #footer-extra>
        <el-button type="danger" plain :disabled="signedOnSaving" @click="clearSignedOn">清空簽約日</el-button>
      </template>
      <el-alert
        v-if="signedOnPaidNotice"
        class="paid-impact-alert"
        type="warning"
        show-icon
        :closable="false"
        :title="signedOnPaidNotice"
      />
      <p v-if="signedOnTarget" class="signed-on-target">{{ signedOnTarget.employee_name }}</p>
      <el-form ref="signedOnFormRef" :model="signedOnForm" :rules="signedOnRules" label-position="top" @submit.prevent>
        <el-form-item label="簽約日" prop="date">
          <el-date-picker
            v-model="signedOnForm.date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="未簽約"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <p class="hint">要撤銷成未簽約，請按「清空簽約日」；日期沒有變更就按「取消」。</p>
    </FormDialog>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import AdminCreateButton from '@/components/common/AdminCreateButton.vue'
import FormDialog from '@/components/common/FormDialog.vue'
import LoadErrorState from '@/components/salary/LoadErrorState.vue'
import { useFormDirty } from '@/composables/useFormDirty'
import { required } from '@/validators/rules'
import GrowthAdjustmentsPanel from './components/GrowthAdjustmentsPanel.vue'
import { semesterProgressLabels } from './growthAdjustments'
import { hasFullSalaryView, hasPermission } from '@/utils/auth'
import { formatCurrency } from '@/utils/currency'
import { toRocYear } from '@/utils/academic'
import { friendlyError } from '@/utils/errorMessages'
import { useEmployeeStore } from '@/stores/employee'
import {
    listGrowthHours,
    createGrowthHour,
    patchGrowthHour,
    deleteGrowthHour,
    patchSignedOn,
    getGrowthPreview,
    settleGrowthContract,
} from '@/api/growthContract'
import { listExtraBonuses } from '@/api/extraBonuses'
import type { ApiBody, Schema } from '@/api/_generated/typed'

// 自主成長獎勵金頁（計畫 Task 11 + 業主 2026-08-14 裁定發放）：學年選擇 → 時數登記
// （dialog CRUD）與簽約日維護（可設可清空）→ 學年結算預覽（動態試算）→ 結算
// （POST /growth-contract/settle，per-employee 冪等，寫入表外獎金獨立轉帳；畫面稱「獨立轉帳」）→
// 已發放明細（GET /extra-bonuses?category=growth_contract）。`pending_rule` 警示條
// 仍是刻意的制度標記，但金額語意已由業主確認、不再是「待確認、不可發放」，內容一律
// 以後端回傳原文為準，前端不可再寫死「未發放」這類與「已可結算」矛盾的固定文案。

type GrowthHour = Schema<'GrowthHourOut'>
type GrowthPreviewRow = Schema<'GrowthPreviewRowOut'>
type GrowthPreviewGate = Schema<'GrowthPreviewGateOut'>
type GrowthSettleResult = Schema<'GrowthSettleResultOut'>
type ExtraBonusRow = Schema<'ExtraBonusOut'>
type HourCreateBody = ApiBody<'/growth-contract/hours', 'post'>
type HourUpdateBody = ApiBody<'/growth-contract/hours/{hour_id}', 'patch'>
type SignedOnBody = ApiBody<'/growth-contract/employees/{employee_id}/signed-on', 'patch'>
type SettleBody = ApiBody<'/growth-contract/settle', 'post'>

interface EmployeeOption {
    id: number
    name: string
}

const DEFAULT_PENDING_RULE =
    '金額依「每月提撥×在職月數」與各項資格條件計算；結算後以獨立轉帳發放（不併入月薪），實際入帳金額以結算結果為準。'

const SEMESTER_LABELS: Record<number, string> = { 1: '上學期', 2: '下學期' }
// 資格條件 code → 短標籤（用於資格條件欄的 tag 文字）。
const GATE_LABELS: Record<string, string> = {
    signed: '簽約',
    full_term: '做滿聘期',
    returning_rate: '舊生率',
    late_early: '遲到早退',
    leave_days: '請假天數',
}
// (a) pass/fail/no_data 三態故意用「符號＋色系 class」雙重區分，不是只靠顏色：
// HR 一眼就能分辨「沒達標（✗ 紅）」與「資料不足待確認（⚠ 橘，non-blocking）」，
// 不會誤把 gate 2（舊生率無資料）當成真的沒達標。
const GATE_SYMBOL: Record<string, string> = { pass: '✓', fail: '✗', no_data: '⚠' }
const GATE_CLASS: Record<string, string> = { pass: 'gate-pass', fail: 'gate-fail', no_data: 'gate-nodata' }

function gateVisual(status: string): { symbol: string; cls: string } {
    return { symbol: GATE_SYMBOL[status] ?? '?', cls: GATE_CLASS[status] ?? 'gate-nodata' }
}

/** 民國學年：8/1 起算新學年（今天在 8/1 前後決定屬於哪個學年）。 */
function currentSchoolYear(d = new Date()): number {
    const rocYear = toRocYear(d.getFullYear())
    return d.getMonth() + 1 >= 8 ? rocYear : rocYear - 1
}

const canViewFullSalary = computed(
    () => hasPermission('SALARY_READ') && hasFullSalaryView(),
)
const canWrite = computed(
    () => canViewFullSalary.value && hasPermission('SALARY_WRITE'),
)
const employeeStore = useEmployeeStore()
const employeeOptions = computed<EmployeeOption[]>(() => (employeeStore.employees || []) as EmployeeOption[])

// 表單是否通過驗證。ref 未綁定（dialog 尚未渲染）視同失敗（fail-closed）。
const isFormValid = async (form: FormInstance | undefined): Promise<boolean> =>
    form ? await form.validate().catch(() => false) : false

// ---- 學年 ----
const baseSchoolYear = currentSchoolYear()
const schoolYear = ref(baseSchoolYear)
const schoolYearOptions = computed(() => [baseSchoolYear - 1, baseSchoolYear, baseSchoolYear + 1])

// ---- 時數登記 ----
const hourRows = ref<GrowthHour[]>([])
const hoursLoading = ref(false)
// 載入失敗不可退回「尚無時數登記」，也不可留著上一個學年的列
const hoursError = ref(false)
const hoursEmployeeFilter = ref<number | null>(null)
const hourTableData = computed(() =>
    hourRows.value.map((row) => ({
        ...row,
        semesterLabel: SEMESTER_LABELS[row.semester] || String(row.semester),
    })),
)

// (d) race guard：學年／篩選快速切換時，只有「最後一次發出」的請求可以寫入畫面狀態；
// 較晚送出但先回來的仍會贏，較早送出但晚回來的一律被忽略（比對 seq，不是比對到達順序）。
let hoursSeq = 0
const fetchHours = async () => {
    if (!canViewFullSalary.value) return
    const seq = ++hoursSeq
    hoursLoading.value = true
    hoursError.value = false
    try {
        const res = await listGrowthHours({
            school_year: schoolYear.value,
            employee_id: hoursEmployeeFilter.value ?? undefined,
        })
        if (seq !== hoursSeq) return
        hourRows.value = res.data.items
    } catch (e) {
        if (seq !== hoursSeq) return
        hourRows.value = []
        hoursError.value = true
        ElMessage.error(friendlyError('載入時數登記失敗', e))
    } finally {
        if (seq === hoursSeq) hoursLoading.value = false
    }
}

// ---- 結算預覽 ----
const previewRows = ref<GrowthPreviewRow[]>([])
const previewLoading = ref(false)
// 預覽失敗時一定要清掉舊列：結算確認的人數／金額是從預覽列算的，留著舊學年的列等於拿錯的數字請人確認
const previewError = ref(false)
const pendingRule = ref('')
const paidPeriod = ref('')
const onlyEligiblePayable = ref(false)

let previewSeq = 0
const fetchPreview = async () => {
    if (!canViewFullSalary.value) return
    const seq = ++previewSeq
    previewLoading.value = true
    previewError.value = false
    try {
        const res = await getGrowthPreview(schoolYear.value)
        if (seq !== previewSeq) return
        previewRows.value = res.data.rows
        // 勾選只保留仍有未扣餘額者（重抓預覽後餘額可能已被扣抵歸零）
        const stillPending = new Set(
            res.data.rows.filter((r) => (r.pending_festival_carry ?? 0) > 0).map((r) => r.employee_id),
        )
        carryOffsetIds.value = carryOffsetIds.value.filter((id) => stillPending.has(id))
        pendingRule.value = res.data.pending_rule
        paidPeriod.value = res.data.paid_period
        // 不 await：已發放明細是輔助資訊，不必阻塞預覽本身的 loading 狀態。
        fetchSettledPayments()
    } catch (e) {
        if (seq !== previewSeq) return
        previewRows.value = []
        carryOffsetIds.value = []
        pendingRule.value = ''
        paidPeriod.value = ''
        extraBonusItems.value = []
        extraBonusError.value = false
        previewError.value = true
        ElMessage.error(friendlyError('載入結算預覽失敗', e))
    } finally {
        if (seq === previewSeq) previewLoading.value = false
    }
}

interface GateItem extends GrowthPreviewGate {
    symbol: string
    cls: string
    label: string
}
interface PreviewDisplayRow extends GrowthPreviewRow {
    pendingCarryLabel: string
    monthlyRateLabel: string
    subtotalLabel: string
    semesterLabels: string[]
    deductionLabel: string
    deductionDetail: string
    deductionUnappliedLabel: string
    hoursRatioLabel: string
    amountLabel: string
    amountHintLabel: string
    eligibleLabel: string
    gateItems: GateItem[]
}

// (c) 預設排序：符合資格者在前、同屬符合資格時金額高的在前——HR 開頁就先看到
// 「符合資格且金額 > 0」那批，不必自己動手排序；篩選 checkbox 進一步只留這批。
const previewTableData = computed<PreviewDisplayRow[]>(() => {
    const rows: PreviewDisplayRow[] = previewRows.value.map((row) => {
        const gateItems: GateItem[] = row.gates.map((g) => ({
            ...g,
            symbol: gateVisual(g.status).symbol,
            cls: gateVisual(g.status).cls,
            label: GATE_LABELS[g.code] || g.code,
        }))
        return {
            ...row,
            pendingCarryLabel: formatCurrency(row.pending_festival_carry ?? 0),
            monthlyRateLabel: formatCurrency(row.monthly_rate),
            subtotalLabel: formatCurrency(row.subtotal ?? 0),
            semesterLabels: semesterProgressLabels(row.semesters ?? []),
            deductionLabel: formatCurrency(row.deduction_amount ?? 0),
            deductionDetail: (row.deductions ?? [])
                .map((d) => `${d.reason} ${formatCurrency(d.amount)}`)
                .join('；'),
            deductionUnappliedLabel: formatCurrency(row.deduction_unapplied ?? 0),
            hoursRatioLabel: `${Math.round(row.hours_ratio * 100)}%`,
            amountLabel: formatCurrency(row.amount),
            // (b) 不符合資格時額外標示「若符合資格可得多少」，避免 HR 誤以為 0 元
            // 是「本來就沒有」而非「gate 沒過」；只有 amount_if_eligible > 0 才顯示，
            // 避免對「本來月額就是 0」這種異常資料多此一舉。
            // amount 是扣抵後實發；未符合資格時以扣抵後的 net_amount_if_eligible 為「若符合」金額。
            amountHintLabel:
                !row.eligible && row.amount_if_eligible > 0
                    ? `若符合資格：${formatCurrency(row.net_amount_if_eligible ?? row.amount_if_eligible)}`
                    : '',
            eligibleLabel: row.eligible ? '符合資格' : '不符合',
            gateItems,
        }
    })
    const filtered = onlyEligiblePayable.value ? rows.filter((r) => r.eligible && r.amount > 0) : rows
    return [...filtered].sort((a, b) => {
        if (a.eligible !== b.eligible) return a.eligible ? -1 : 1
        return b.amount - a.amount
    })
})

// ---- 結算（per-employee 冪等，寫入表外獎金獨立轉帳；已發過的員工回應會落在
// skipped_already_paid，不重複發，因此結算不是不可逆的整批鎖定——時數後補齊的員工
// 可以再按一次結算補發） ----
const settling = ref(false)
const settleResult = ref<GrowthSettleResult | null>(null)
// 只把「符合資格且金額 > 0」的列算進即將結算的人數／金額，不符合資格或金額為 0
// 的列本來就不會被後端寫入，計入確認文案裡只會誤導 HR。
const settleTargets = computed(() => previewRows.value.filter((r) => r.eligible && r.amount > 0))
const settleTotalAmount = computed(() => settleTargets.value.reduce((sum, r) => sum + r.amount, 0))
const settleDisabled = computed(
    () => settleTargets.value.length === 0 || previewLoading.value || previewError.value,
)

// ---- 節慶未扣餘額扣抵（義華 Q14）：預覽每列帶 pending_festival_carry，HR 勾選才扣抵；
// 未開結轉開關時傳入勾選後端回 422。實發 amount 為扣抵後金額。 ----
const carryOffsetIds = ref<number[]>([])
const hasPendingCarry = computed(() => previewRows.value.some((r) => (r.pending_festival_carry ?? 0) > 0))
const toggleCarryOffset = (employeeId: number, checked: boolean) => {
    const rest = carryOffsetIds.value.filter((id) => id !== employeeId)
    carryOffsetIds.value = checked ? [...rest, employeeId] : rest
}
const selectedCarryTargets = computed(() =>
    settleTargets.value.filter((r) => carryOffsetIds.value.includes(r.employee_id) && (r.pending_festival_carry ?? 0) > 0),
)
// 職權分離（稽核 F08）：結算操作者本人那筆後端會跳過、落在 skipped_self，
// 須由他人另行結算補發；統計文案一併列出，避免 HR 誤以為已全數發放。
const settleCountsText = (r: GrowthSettleResult): string => {
    const selfCount = (r.skipped_self ?? []).length
    const selfPart = selfCount > 0 ? `、本人須由他人結算 ${selfCount} 位` : ''
    const finalizedCount = (r.skipped_finalized ?? []).length
    const finalizedPart = finalizedCount > 0 ? `、發放月薪資已封存跳過 ${finalizedCount} 位` : ''
    const carryTotal = r.created.reduce((sum, c) => sum + (c.carry_offset ?? 0), 0)
    const carryPart = carryTotal > 0 ? `（已扣抵節慶未扣餘額 ${formatCurrency(carryTotal)}）` : ''
    return `發放 ${r.created.length} 位、跳過（已發過）${r.skipped_already_paid.length} 位${selfPart}${finalizedPart}，共 ${formatCurrency(r.total_amount)}${carryPart}`
}
const settleResultLabel = computed(() => {
    if (!settleResult.value) return ''
    return `本次結算：${settleCountsText(settleResult.value)}`
})
const settleSelfSkipDescription = computed(() => {
    const parts: string[] = []
    const selfRows = settleResult.value?.skipped_self ?? []
    if (selfRows.length > 0) {
        parts.push(`未發放給結算者本人：${selfRows.map((r) => r.employee_name).join('、')}，請由其他有權限的人員再次結算即可補發。`)
    }
    // growth2：發放月起已有封存薪資的員工後端會跳過（補充保費累計無法回寫），需 HR 人工處理。
    const finalizedRows = settleResult.value?.skipped_finalized ?? []
    if (finalizedRows.length > 0) {
        parts.push(`發放月起薪資已封存而未發放：${finalizedRows.map((r) => r.employee_name).join('、')}，請先解除封存或改由人工處理。`)
    }
    return parts.join(' ')
})

const doSettle = async () => {
    if (previewLoading.value || previewError.value) {
        ElMessage.warning('結算預覽尚未載入完成，請稍候或重新載入後再結算')
        return
    }
    if (settleTargets.value.length === 0) {
        ElMessage.warning('目前查無符合資格且金額大於 0 的員工，無需結算')
        return
    }
    const carryTargets = selectedCarryTargets.value
    const carryNote =
        carryTargets.length > 0
            ? `其中 ${carryTargets.map((r) => r.employee_name).join('、')} 將以本次獎勵金扣抵節慶未扣餘額，實發金額為扣抵後金額。`
            : ''
    try {
        await ElMessageBox.confirm(
            `即將結算 ${schoolYear.value} 學年自主成長獎勵金：將發給 ${settleTargets.value.length} 位員工共 ${formatCurrency(settleTotalAmount.value)}（扣抵前）。${carryNote}本獎勵金計入二代健保補充保費累計，發放月起的薪資會標記需重算。已發放過的員工本次會自動跳過、不重複發放；發放後仍可再次結算以補發後續才符合資格的員工。確定結算？`,
            '確認結算',
            { confirmButtonText: '確定結算', cancelButtonText: '取消', type: 'warning' },
        )
    } catch {
        return
    }
    settling.value = true
    try {
        const body: SettleBody = { school_year: schoolYear.value }
        if (carryTargets.length > 0) body.carry_offset_employee_ids = carryTargets.map((r) => r.employee_id)
        const res = await settleGrowthContract(body)
        settleResult.value = res.data
        ElMessage.success(`結算完成：${settleCountsText(res.data)}`)
        // fetchPreview 內會一併重抓已發放明細（paid_period 由此帶出）。
        await fetchPreview()
    } catch (e) {
        ElMessage.error(friendlyError('結算失敗', e))
    } finally {
        settling.value = false
    }
}

// ---- 已發放明細（表外獎金，category=growth_contract） ----
const extraBonusItems = ref<ExtraBonusRow[]>([])
const extraBonusLoading = ref(false)
// 失敗時不能顯示「查無已發放明細」，否則會被誤讀成「還沒發」
const extraBonusError = ref(false)
const extraBonusTableData = computed(() =>
    extraBonusItems.value.map((row) => ({ ...row, amountLabel: formatCurrency(row.amount) })),
)

let extraBonusSeq = 0
const fetchSettledPayments = async () => {
    const period = paidPeriod.value
    if (!period) return
    const [yearStr, monthStr] = period.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr)
    if (!year || !month) return
    const seq = ++extraBonusSeq
    extraBonusLoading.value = true
    extraBonusError.value = false
    try {
        const res = await listExtraBonuses({ year, month, category: 'growth_contract' })
        if (seq !== extraBonusSeq) return
        extraBonusItems.value = res.data.items
    } catch (e) {
        if (seq !== extraBonusSeq) return
        extraBonusItems.value = []
        extraBonusError.value = true
        ElMessage.error(friendlyError('載入已發放明細失敗', e))
    } finally {
        if (seq === extraBonusSeq) extraBonusLoading.value = false
    }
}

watch(schoolYear, () => {
    if (!canViewFullSalary.value) return
    settleResult.value = null // 上一個學年的結算結果不可掛在新學年底下
    fetchHours()
    fetchPreview()
})
watch(hoursEmployeeFilter, () => {
    if (canViewFullSalary.value) fetchHours()
})

// ---- 已發放員工的異動提醒 ----
// 結算是 per-employee 冪等：發過的員工再改時數／簽約日，已發金額不會變、也不會自動追扣或補發。
// 行政常以為「改了就會重算」，所以對已發放員工的寫入，先講清楚再讓他確認。
const paidEmployeeIds = computed(() => new Set(extraBonusItems.value.map((i) => Number(i.employee_id))))
const paidEmployeeIdList = computed<number[]>(() => (extraBonusError.value ? [] : [...paidEmployeeIds.value]))
const isPaidEmployee = (employeeId: number | null | undefined, year: number): boolean =>
    employeeId != null && year === schoolYear.value && !extraBonusError.value && paidEmployeeIds.value.has(employeeId)
const employeeNameOf = (employeeId: number | null | undefined): string =>
    employeeOptions.value.find((e) => e.id === employeeId)?.name ??
    extraBonusItems.value.find((i) => i.employee_id === employeeId)?.employee_name ??
    '此員工'
const PAID_IMPACT_NOTE = '已發放的金額不會更動，也不會自動追扣或補發；若需調整，請另行人工處理。'
const confirmPaidImpact = async (
    employeeId: number | null | undefined,
    year: number,
    actionLabel: string,
): Promise<boolean> => {
    if (!isPaidEmployee(employeeId, year)) return true
    try {
        await ElMessageBox.confirm(
            `${employeeNameOf(employeeId)} 本學年的自主成長獎勵金已發放。${actionLabel}後，${PAID_IMPACT_NOTE}確定繼續？`,
            '已發放員工的異動確認',
            { confirmButtonText: '確定繼續', cancelButtonText: '取消', type: 'warning' },
        )
        return true
    } catch {
        return false
    }
}

// ---- 時數 dialog ----
interface HourForm {
    id: number | null
    employee_id: number | null
    school_year: number
    semester: number
    activity_date: string
    hours: number
    title: string
    note: string
}
const hourDialogVisible = ref(false)
const hourSaving = ref(false)
const hourFormRef = ref<FormInstance>()
const hourDialogRef = ref<InstanceType<typeof FormDialog>>()
const hourForm = reactive<HourForm>({
    id: null,
    employee_id: null,
    school_year: baseSchoolYear,
    semester: 1,
    activity_date: '',
    hours: 0,
    title: '',
    note: '',
})
const { isDirty: hourDirty, snapshot: snapshotHour } = useFormDirty(hourForm)
const hourRules: FormRules = {
    employee_id: [required('員工', { kind: 'select' })],
    school_year: [{ required: true, type: 'number', min: 100, max: 200, message: '請輸入學年（民國 100–200）', trigger: 'change' }],
    semester: [required('學期', { kind: 'select' })],
    activity_date: [required('研習日期', { kind: 'select' })],
    hours: [{ required: true, type: 'number', min: 0.5, message: '請輸入時數（至少 0.5 小時）', trigger: 'change' }],
    title: [{ ...required('課程名稱'), whitespace: true }],
}
const hourPaidNotice = computed(() =>
    hourDialogVisible.value && isPaidEmployee(hourForm.employee_id, hourForm.school_year)
        ? `${employeeNameOf(hourForm.employee_id)} 本學年的獎勵金已發放。${PAID_IMPACT_NOTE}`
        : '',
)

const openHourDialog = (row?: GrowthHour) => {
    if (row) {
        hourForm.id = row.id
        hourForm.employee_id = row.employee_id
        hourForm.school_year = row.school_year
        hourForm.semester = row.semester
        hourForm.activity_date = row.activity_date
        hourForm.hours = row.hours
        hourForm.title = row.title
        hourForm.note = row.note || ''
    } else {
        hourForm.id = null
        hourForm.employee_id = hoursEmployeeFilter.value
        hourForm.school_year = schoolYear.value
        hourForm.semester = 1
        hourForm.activity_date = ''
        hourForm.hours = 0
        hourForm.title = ''
        hourForm.note = ''
    }
    snapshotHour()
    hourDialogVisible.value = true
}

const submitHour = async () => {
    if (hourSaving.value) return
    hourSaving.value = true
    const editing = hourForm.id != null
    try {
        if (!(await isFormValid(hourFormRef.value))) {
            hourDialogRef.value?.scrollToFirstError()
            return
        }
        if (!(await confirmPaidImpact(hourForm.employee_id, hourForm.school_year, editing ? '修改時數' : '新增時數'))) return
        if (hourForm.id != null) {
            const body: HourUpdateBody = {
                school_year: hourForm.school_year,
                semester: hourForm.semester,
                activity_date: hourForm.activity_date,
                hours: hourForm.hours,
                title: hourForm.title.trim(),
                note: hourForm.note || null,
            }
            await patchGrowthHour(hourForm.id, body)
        } else {
            const body: HourCreateBody = {
                employee_id: hourForm.employee_id as number,
                school_year: hourForm.school_year,
                semester: hourForm.semester,
                activity_date: hourForm.activity_date,
                hours: hourForm.hours,
                title: hourForm.title.trim(),
                note: hourForm.note || null,
            }
            await createGrowthHour(body)
        }
        ElMessage.success(editing ? '已更新時數登記' : '已新增時數登記')
        hourDialogVisible.value = false
        await fetchHours()
        // 只有本次登記落在目前檢視學年時，實際時數才會影響到畫面上的預覽金額。
        if (hourForm.school_year === schoolYear.value) await fetchPreview()
    } catch (e) {
        ElMessage.error(friendlyError(editing ? '更新時數登記失敗' : '新增時數登記失敗', e))
    } finally {
        hourSaving.value = false
    }
}

const confirmDeleteHour = async (row: GrowthHour) => {
    const paidNote = isPaidEmployee(row.employee_id, row.school_year)
        ? `此員工本學年的獎勵金已發放，刪除時數後${PAID_IMPACT_NOTE}`
        : ''
    try {
        await ElMessageBox.confirm(
            `確定刪除「${row.title}」（${row.employee_name ?? ''} ${row.activity_date}）這筆時數登記？刪除後無法復原。${paidNote}`,
            '確認刪除',
            { confirmButtonText: '確定刪除', cancelButtonText: '取消', type: 'warning' },
        )
    } catch {
        return
    }
    try {
        await deleteGrowthHour(row.id)
        ElMessage.success('已刪除時數登記')
        await fetchHours()
        await fetchPreview()
    } catch (e) {
        ElMessage.error(friendlyError('刪除時數登記失敗', e))
    }
}

// ---- 簽約日維護 ----
const signedOnDialogVisible = ref(false)
const signedOnSaving = ref(false)
const signedOnFormRef = ref<FormInstance>()
const signedOnDialogRef = ref<InstanceType<typeof FormDialog>>()
const signedOnTarget = ref<{ employee_id: number; employee_name: string } | null>(null)
const signedOnForm = reactive<{ date: string | null }>({ date: null })
const signedOnDate = computed<string | null>({
    get: () => signedOnForm.date,
    set: (v) => {
        signedOnForm.date = v
    },
})
const { isDirty: signedOnDirty, snapshot: snapshotSignedOn } = useFormDirty(signedOnForm)
const signedOnRules: FormRules = {
    date: [required('簽約日', { kind: 'select' })],
}
const signedOnPaidNotice = computed(() =>
    signedOnDialogVisible.value && isPaidEmployee(signedOnTarget.value?.employee_id, schoolYear.value)
        ? `${signedOnTarget.value?.employee_name} 本學年的獎勵金已發放。${PAID_IMPACT_NOTE}`
        : '',
)

const openSignedOnDialog = (row: GrowthPreviewRow) => {
    signedOnTarget.value = { employee_id: row.employee_id, employee_name: row.employee_name }
    signedOnForm.date = row.signed_on ?? null
    snapshotSignedOn()
    signedOnDialogVisible.value = true
}

const saveSignedOn = async () => {
    const target = signedOnTarget.value
    if (!target || signedOnSaving.value) return
    signedOnSaving.value = true
    try {
        if (!(await isFormValid(signedOnFormRef.value)) || !signedOnForm.date) {
            signedOnDialogRef.value?.scrollToFirstError()
            return
        }
        if (!(await confirmPaidImpact(target.employee_id, schoolYear.value, '修改簽約日'))) return
        const body: SignedOnBody = { signed_on: signedOnForm.date }
        await patchSignedOn(target.employee_id, body)
        ElMessage.success('已更新簽約日')
        signedOnDialogVisible.value = false
        await fetchPreview()
    } catch (e) {
        ElMessage.error(friendlyError('更新簽約日失敗', e))
    } finally {
        signedOnSaving.value = false
    }
}

const clearSignedOn = async () => {
    const target = signedOnTarget.value
    if (!target || signedOnSaving.value) return
    const paidNote = isPaidEmployee(target.employee_id, schoolYear.value)
        ? `此員工本學年的獎勵金已發放，清空後${PAID_IMPACT_NOTE}`
        : ''
    try {
        await ElMessageBox.confirm(
            `確定清空 ${target.employee_name} 的簽約日？清空後視為未簽約，本學年不符合發放資格。${paidNote}`,
            '確認清空簽約日',
            { confirmButtonText: '確定清空', cancelButtonText: '取消', type: 'warning' },
        )
    } catch {
        return
    }
    signedOnSaving.value = true
    try {
        const body: SignedOnBody = { signed_on: null }
        await patchSignedOn(target.employee_id, body)
        ElMessage.success('已清空簽約日')
        signedOnDialogVisible.value = false
        await fetchPreview()
    } catch (e) {
        ElMessage.error(friendlyError('清空簽約日失敗', e))
    } finally {
        signedOnSaving.value = false
    }
}

onMounted(() => {
    if (!canViewFullSalary.value) return
    fetchHours()
    fetchPreview()
    employeeStore.fetchEmployees?.()
})
</script>

<style scoped>
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-3);
  margin: var(--space-4) 0 var(--space-2);
}
.section-header h3 {
  margin: 0;
}
.section-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.hours-filter {
  width: 160px;
}
.scroll-hint {
  display: none;
  margin: 0 0 var(--space-2);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.paid-impact-alert {
  margin-bottom: var(--space-3);
}
.signed-on-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.signed-on-cell__empty {
  color: var(--el-text-color-secondary);
}
.signed-on-target {
  margin: 0 0 var(--space-2);
  font-weight: 600;
}
@media (--to-sm) {
  .section-actions {
    width: 100%;
  }
  .hours-filter {
    flex: 1 1 140px;
    width: auto;
  }
  .scroll-hint {
    display: block;
  }
}
.pending-rule-alert {
  margin-bottom: var(--space-4);
}
.paid-period-hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin: 0 0 var(--space-4);
}
.settle-result-alert {
  margin-bottom: var(--space-3);
}
.paid-section {
  margin-top: var(--space-5);
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.badge-unknown {
  font-size: 11px;
  color: #fff;
  background: var(--el-color-warning);
  border-radius: 3px;
  padding: 1px 6px;
  margin-left: var(--space-1);
}
.gate-tag {
  display: inline-block;
  font-size: 12px;
  border-radius: 3px;
  padding: 1px 6px;
  margin: 2px 4px 2px 0;
  white-space: nowrap;
}
.gate-tag.gate-pass {
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}
.gate-tag.gate-fail {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}
.gate-tag.gate-nodata {
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}
.amount-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.amount-cell__badge {
  font-size: 11px;
  color: var(--el-color-warning);
  border: 1px solid var(--el-color-warning);
  border-radius: 3px;
  padding: 0 4px;
  width: fit-content;
}
.amount-cell__hint {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.amount-cell__warn {
  font-size: 11px;
  font-weight: 600;
  color: var(--el-color-danger);
}
</style>
