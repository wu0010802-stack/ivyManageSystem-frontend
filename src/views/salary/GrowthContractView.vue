<template>
  <div>
    <PageHeader title="自主成長獎勵金" subtitle="研習時數登記、學年結算預覽與每年 8 月發放">
      <template #actions>
        <el-select v-model="schoolYear" style="width: 120px" aria-label="學年">
          <el-option v-for="y in schoolYearOptions" :key="y" :value="y" :label="`${y} 學年`" />
        </el-select>
      </template>
    </PageHeader>

    <el-alert
      class="pending-rule-alert"
      type="warning"
      show-icon
      :closable="false"
      title="金額試算規則"
      :description="pendingRule || DEFAULT_PENDING_RULE"
    />
    <p v-if="paidPeriod" class="paid-period-hint">將於 {{ paidPeriod }} 發放</p>

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
            style="width: 160px"
          >
            <el-option v-for="emp in employeeOptions" :key="emp.id" :value="emp.id" :label="emp.name" />
          </el-select>
          <el-button v-if="canWrite" type="primary" :icon="Plus" @click="openHourDialog()">新增時數</el-button>
        </div>
      </div>

      <EmptyState
        v-if="!hoursLoading && hourTableData.length === 0"
        variant="inline"
        title="尚無時數登記"
        description="點右上角「新增時數」開始登記研習時數"
      />
      <el-table v-else v-loading="hoursLoading" :data="hourTableData" stripe style="width: 100%">
        <el-table-column prop="employee_name" label="員工" min-width="120" />
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
    </section>

    <section class="preview-section">
      <div class="section-header">
        <h3>學年結算預覽</h3>
        <div class="section-actions">
          <el-checkbox v-model="onlyEligiblePayable">只顯示符合資格且金額 &gt; 0</el-checkbox>
          <el-button
            v-if="canWrite"
            type="danger"
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
      />

      <EmptyState
        v-if="!previewLoading && previewTableData.length === 0"
        variant="inline"
        title="查無資料"
        description="該學年查無在職或於學年內離職的員工，或篩選條件下無符合資格者"
      />
      <el-table v-else v-loading="previewLoading" :data="previewTableData" stripe style="width: 100%">
        <el-table-column label="員工" min-width="130">
          <template #default="{ row }">
            {{ row.employee_name }}
            <span v-if="row.position_unknown" class="badge-unknown">職務未知</span>
          </template>
        </el-table-column>
        <el-table-column label="職務月額" width="100">
          <template #default="{ row }">{{ row.monthlyRateLabel }}</template>
        </el-table-column>
        <el-table-column prop="required_hours" label="應修時數" width="90" />
        <el-table-column prop="actual_hours" label="實際時數" width="90" />
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
            </div>
          </template>
        </el-table-column>
        <el-table-column label="資格" width="90">
          <template #default="{ row }">
            <el-tag :type="row.eligible ? 'success' : 'info'">{{ row.eligibleLabel }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="canWrite" label="簽約日" width="90" fixed="right">
          <template #default="{ row }">
            <el-button link size="small" @click="openSignedOnDialog(row)">設定</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section class="paid-section">
      <h3>已發放明細（表外獎金－自主成長獎勵金）</h3>
      <EmptyState
        v-if="!extraBonusLoading && extraBonusItems.length === 0"
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
    <el-dialog v-model="hourDialogVisible" :title="hourForm.id != null ? '編輯時數登記' : '新增時數登記'" width="480px">
      <el-form :model="hourForm" label-width="100px">
        <el-form-item label="員工">
          <el-select v-model="hourForm.employee_id" filterable :disabled="hourForm.id != null" style="width: 100%">
            <el-option v-for="emp in employeeOptions" :key="emp.id" :value="emp.id" :label="emp.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="學年">
          <el-input-number v-model="hourForm.school_year" :min="100" :max="200" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="學期">
          <el-select v-model="hourForm.semester" style="width: 100%">
            <el-option :value="1" label="上學期" />
            <el-option :value="2" label="下學期" />
          </el-select>
        </el-form-item>
        <el-form-item label="研習日期">
          <el-date-picker v-model="hourForm.activity_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="時數">
          <el-input-number v-model="hourForm.hours" :min="0.5" :step="0.5" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="課程名稱">
          <el-input v-model="hourForm.title" />
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="hourForm.note" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="hourDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitHour">{{ hourForm.id != null ? '儲存' : '新增' }}</el-button>
      </template>
    </el-dialog>

    <!-- 簽約日維護 dialog -->
    <el-dialog v-model="signedOnDialogVisible" title="簽約日維護" width="360px">
      <p v-if="signedOnTarget" class="hint">{{ signedOnTarget.employee_name }}</p>
      <el-date-picker
        v-model="signedOnDate"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="未簽約"
        style="width: 100%"
      />
      <p class="hint">留空並按「清空簽約日」可撤銷成未簽約；未變更則按「取消」。</p>
      <template #footer>
        <el-button type="danger" plain @click="clearSignedOn">清空簽約日</el-button>
        <el-button @click="signedOnDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveSignedOn">儲存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { hasPermission } from '@/utils/auth'
import { formatCurrency } from '@/utils/currency'
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
// （POST /growth-contract/settle，per-employee 冪等，寫入表外獎金獨立轉帳）→
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
    '金額依「每月提撥×在職月數」與各項資格條件計算；結算後將寫入表外獎金獨立轉帳，實際入帳金額以結算結果為準。'

const SEMESTER_LABELS: Record<number, string> = { 1: '上學期', 2: '下學期' }
// 資格條件 code → 短標籤（用於資格條件欄的 tag 文字）。
const GATE_LABELS: Record<string, string> = {
    signed: '簽約',
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
    const rocYear = d.getFullYear() - 1911
    return d.getMonth() + 1 >= 8 ? rocYear : rocYear - 1
}

const canWrite = computed(() => hasPermission('SALARY_WRITE'))
const employeeStore = useEmployeeStore()
const employeeOptions = computed<EmployeeOption[]>(() => (employeeStore.employees || []) as EmployeeOption[])

// ---- 學年 ----
const baseSchoolYear = currentSchoolYear()
const schoolYear = ref(baseSchoolYear)
const schoolYearOptions = computed(() => [baseSchoolYear - 1, baseSchoolYear, baseSchoolYear + 1])

// ---- 時數登記 ----
const hourRows = ref<GrowthHour[]>([])
const hoursLoading = ref(false)
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
    const seq = ++hoursSeq
    hoursLoading.value = true
    try {
        const res = await listGrowthHours({
            school_year: schoolYear.value,
            employee_id: hoursEmployeeFilter.value ?? undefined,
        })
        if (seq !== hoursSeq) return
        hourRows.value = res.data.items
    } catch (e) {
        if (seq !== hoursSeq) return
        ElMessage.error(friendlyError('載入時數登記失敗', e))
    } finally {
        if (seq === hoursSeq) hoursLoading.value = false
    }
}

// ---- 結算預覽 ----
const previewRows = ref<GrowthPreviewRow[]>([])
const previewLoading = ref(false)
const pendingRule = ref('')
const paidPeriod = ref('')
const onlyEligiblePayable = ref(false)

let previewSeq = 0
const fetchPreview = async () => {
    const seq = ++previewSeq
    previewLoading.value = true
    try {
        const res = await getGrowthPreview(schoolYear.value)
        if (seq !== previewSeq) return
        previewRows.value = res.data.rows
        pendingRule.value = res.data.pending_rule
        paidPeriod.value = res.data.paid_period
        // 不 await：已發放明細是輔助資訊，不必阻塞預覽本身的 loading 狀態。
        fetchSettledPayments()
    } catch (e) {
        if (seq !== previewSeq) return
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
    monthlyRateLabel: string
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
            monthlyRateLabel: formatCurrency(row.monthly_rate),
            hoursRatioLabel: `${Math.round(row.hours_ratio * 100)}%`,
            amountLabel: formatCurrency(row.amount),
            // (b) 不符合資格時額外標示「若符合資格可得多少」，避免 HR 誤以為 0 元
            // 是「本來就沒有」而非「gate 沒過」；只有 amount_if_eligible > 0 才顯示，
            // 避免對「本來月額就是 0」這種異常資料多此一舉。
            amountHintLabel:
                !row.eligible && row.amount_if_eligible > 0
                    ? `若符合資格：${formatCurrency(row.amount_if_eligible)}`
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
const settleDisabled = computed(() => settleTargets.value.length === 0)
const settleResultLabel = computed(() => {
    if (!settleResult.value) return ''
    return `本次結算：發放 ${settleResult.value.created.length} 位、跳過（已發過）${settleResult.value.skipped_already_paid.length} 位，共 ${formatCurrency(settleResult.value.total_amount)}`
})

const doSettle = async () => {
    if (settleTargets.value.length === 0) {
        ElMessage.warning('目前查無符合資格且金額大於 0 的員工，無需結算')
        return
    }
    try {
        await ElMessageBox.confirm(
            `即將結算 ${schoolYear.value} 學年自主成長獎勵金：將發給 ${settleTargets.value.length} 位員工共 ${formatCurrency(settleTotalAmount.value)}。已發放過的員工本次會自動跳過、不重複發放；發放後仍可再次結算以補發後續才符合資格的員工。確定結算？`,
            '確認結算',
            { confirmButtonText: '確定結算', cancelButtonText: '取消', type: 'warning' },
        )
    } catch {
        return
    }
    settling.value = true
    try {
        const body: SettleBody = { school_year: schoolYear.value }
        const res = await settleGrowthContract(body)
        settleResult.value = res.data
        ElMessage.success(
            `結算完成：發放 ${res.data.created.length} 位、跳過（已發過）${res.data.skipped_already_paid.length} 位，共 ${formatCurrency(res.data.total_amount)}`,
        )
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
    try {
        const res = await listExtraBonuses({ year, month, category: 'growth_contract' })
        if (seq !== extraBonusSeq) return
        extraBonusItems.value = res.data.items
    } catch (e) {
        if (seq !== extraBonusSeq) return
        ElMessage.error(friendlyError('載入已發放明細失敗', e))
    } finally {
        if (seq === extraBonusSeq) extraBonusLoading.value = false
    }
}

watch(schoolYear, () => {
    fetchHours()
    fetchPreview()
})
watch(hoursEmployeeFilter, fetchHours)

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
    hourDialogVisible.value = true
}

const submitHour = async () => {
    if (
        !hourForm.activity_date ||
        !hourForm.title ||
        hourForm.hours <= 0 ||
        (hourForm.id == null && hourForm.employee_id == null)
    ) {
        ElMessage.warning('請填寫員工、研習日期、時數（大於 0）與課程名稱')
        return
    }
    try {
        if (hourForm.id != null) {
            const body: HourUpdateBody = {
                school_year: hourForm.school_year,
                semester: hourForm.semester,
                activity_date: hourForm.activity_date,
                hours: hourForm.hours,
                title: hourForm.title,
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
                title: hourForm.title,
                note: hourForm.note || null,
            }
            await createGrowthHour(body)
        }
        ElMessage.success(hourForm.id != null ? '已更新時數登記' : '已新增時數登記')
        hourDialogVisible.value = false
        await fetchHours()
        // 只有本次登記落在目前檢視學年時，實際時數才會影響到畫面上的預覽金額。
        if (hourForm.school_year === schoolYear.value) await fetchPreview()
    } catch (e) {
        ElMessage.error(friendlyError(hourForm.id != null ? '更新時數登記失敗' : '新增時數登記失敗', e))
    }
}

const confirmDeleteHour = async (row: GrowthHour) => {
    try {
        await ElMessageBox.confirm(
            `確定刪除「${row.title}」（${row.employee_name ?? ''} ${row.activity_date}）這筆時數登記？刪除後無法復原。`,
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
const signedOnTarget = ref<{ employee_id: number; employee_name: string } | null>(null)
const signedOnDate = ref<string | null>(null)

const openSignedOnDialog = (row: GrowthPreviewRow) => {
    signedOnTarget.value = { employee_id: row.employee_id, employee_name: row.employee_name }
    signedOnDate.value = row.signed_on ?? null
    signedOnDialogVisible.value = true
}

const saveSignedOn = async () => {
    if (!signedOnTarget.value) return
    if (!signedOnDate.value) {
        ElMessage.warning('請選擇簽約日，或改用「清空簽約日」')
        return
    }
    const body: SignedOnBody = { signed_on: signedOnDate.value }
    try {
        await patchSignedOn(signedOnTarget.value.employee_id, body)
        ElMessage.success('已更新簽約日')
        signedOnDialogVisible.value = false
        await fetchPreview()
    } catch (e) {
        ElMessage.error(friendlyError('更新簽約日失敗', e))
    }
}

const clearSignedOn = async () => {
    if (!signedOnTarget.value) return
    try {
        await ElMessageBox.confirm(
            `確定清空 ${signedOnTarget.value.employee_name} 的簽約日？清空後視為未簽約，本學年不符合發放資格。`,
            '確認清空簽約日',
            { confirmButtonText: '確定清空', cancelButtonText: '取消', type: 'warning' },
        )
    } catch {
        return
    }
    const body: SignedOnBody = { signed_on: null }
    try {
        await patchSignedOn(signedOnTarget.value.employee_id, body)
        ElMessage.success('已清空簽約日')
        signedOnDialogVisible.value = false
        await fetchPreview()
    } catch (e) {
        ElMessage.error(friendlyError('清空簽約日失敗', e))
    }
}

onMounted(() => {
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
  margin: var(--space-4) 0 var(--space-2);
}
.section-header h3 {
  margin: 0;
}
.section-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
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
</style>
