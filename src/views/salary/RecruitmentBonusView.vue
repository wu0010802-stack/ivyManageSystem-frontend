<template>
  <div>
    <el-result
      v-if="!canViewFullSalary"
      icon="warning"
      title="無法檢視全員薪資資料"
      sub-title="此功能僅開放具完整薪資視野的角色使用"
    />
    <template v-else>
    <PageHeader title="招生獎金" subtitle="教職員個人招生獎勵：候選同步、確認歸屬、結算轉帳">
      <template #actions>
        <el-button v-if="selectedCampaignId" :icon="ArrowLeft" @click="backToList">返回列表</el-button>
        <el-button
          v-if="selectedCampaignId && canWrite"
          :icon="Download"
          :loading="exporting"
          @click="doExport"
        >匯出 Excel</el-button>
        <AdminCreateButton v-if="!selectedCampaignId && canWrite" @click="openCreateDialog">新增期間</AdminCreateButton>
      </template>
    </PageHeader>

    <!-- ============ 列表 ============ -->
    <template v-if="!selectedCampaignId">
      <LoadErrorState
        v-if="listError"
        title="招生獎金期載入失敗"
        description="載入成功前請勿視為沒有招生獎金期，請重新載入。"
        :retrying="listLoading"
        @retry="fetchCampaigns"
      />
      <EmptyState
        v-else-if="!listLoading && campaigns.length === 0"
        title="尚無招生獎金期"
        :description="canWrite ? '點右上角「新增期間」建立第一期' : '目前沒有任何招生獎金期'"
      />
      <AdminListCards
        v-else-if="isMobile"
        :items="campaignCards"
        :columns="CAMPAIGN_CARD_COLUMNS"
        row-key="id"
        :loading="listLoading"
        clickable
        @row-click="onCampaignCardClick"
      >
        <template #title="{ item }">{{ item.name }}</template>
        <template #cell-statusLabel="{ item }">
          <el-tag :type="item.status === 'settled' ? 'success' : 'primary'" size="small">{{ item.statusLabel }}</el-tag>
        </template>
      </AdminListCards>
      <el-table
        v-else
        v-loading="listLoading"
        :data="campaignTableData"
        stripe
        style="width: 100%"
        @row-click="openDetail"
      >
        <el-table-column prop="name" label="名稱" min-width="200" />
        <el-table-column label="期間" min-width="200">
          <template #default="{ row }">{{ row.start_date }} ～ {{ row.end_date }}</template>
        </el-table-column>
        <el-table-column label="狀態" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'settled' ? 'success' : 'primary'">{{ row.statusLabel }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="pending_count" label="待確認" width="100" />
        <el-table-column prop="confirmed_count" label="已確認" width="100" />
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link size="small" @click.stop="openDetail(row)">查看明細</el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <!-- ============ 明細 ============ -->
    <LoadErrorState
      v-else-if="detailError && !detail"
      title="招生獎金期明細載入失敗"
      description="載入成功前請勿視為這一期沒有歸屬資料，請重新載入。"
      :retrying="detailLoading"
      @retry="retryDetail"
    />
    <el-skeleton v-else-if="!detail" :rows="5" animated />
    <template v-else>
      <div class="detail-header">
        <h3>
          {{ detail.name }}
          <el-tag :type="isSettled ? 'success' : 'primary'">{{ isSettled ? '已結算' : '進行中' }}</el-tag>
        </h3>
        <p class="hint">{{ detail.start_date }} ～ {{ detail.end_date }}</p>
        <p v-if="isSettled" class="readonly-banner">
          本期已結算（唯讀）：獎金已列入獨立轉帳發放，歸屬資料與參數不可再修改。
        </p>
      </div>

      <div v-if="detailError" class="stale-banner" role="alert" data-test="detail-stale-banner">
        <span>重新載入失敗，畫面上的資料可能不是最新的，在重新載入成功前無法結算。</span>
        <el-button size="small" :loading="detailLoading" @click="retryDetail">重新載入</el-button>
      </div>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="統計表" name="statement">
          <ReportStatementTab
            v-if="selectedCampaignId"
            ref="statementRef"
            :campaign-id="selectedCampaignId"
          />
        </el-tab-pane>
        <el-tab-pane label="歸屬核對" name="grid">

      <div class="action-bar">
        <el-button v-if="canWrite && !isSettled" :loading="syncing" @click="doSync">同步候選</el-button>
        <el-button v-if="canWrite && !isSettled" @click="openAddDialog">新增歸屬列</el-button>
        <el-button v-if="canWrite && !isSettled" type="primary" :disabled="settleDisabled" :loading="settling" @click="doSettle">
          結算
        </el-button>
        <span v-if="settleDisabledReason" class="hint settle-reason">{{ settleDisabledReason }}</span>
      </div>

      <p v-if="unassignedCount > 0" class="unassigned-banner">
        {{ unassignedCount }} 筆招生人待指定，請於下表「招生人」欄手動選擇（比對不到唯一員工姓名或英文名時系統不會自動猜）。
      </p>
      <p v-if="gradeUnconfirmedCount > 0" class="unassigned-banner">
        {{ gradeUnconfirmedCount }} 筆班別倍數待確認：幼生班別缺值或無法辨識，倍數暫以 1.0 帶入；請於「班別倍數」欄修正或按「確認倍數」後才能確認。
      </p>
      <p v-if="splitIncompleteCount > 0" class="unassigned-banner">
        {{ splitIncompleteCount }} 筆拆分未完成（邀約原招生人 0.4／兄姊均分 0.5 的另一位老師），請以「新增歸屬列」補上，詳見該列備註。
      </p>

      <p class="scroll-hint">表格可左右滑動，查看全部欄位</p>
      <el-table
        v-loading="detailLoading"
        :data="pagedAttributionRows"
        stripe
        style="width: 100%"
        :row-class-name="attributionRowClass"
      >
        <el-table-column label="幼生" min-width="120" fixed>
          <template #default="{ row }">
            <div>{{ row.visitLabel }}</div>
            <div v-if="row.visitSubLabel" class="visit-sub">{{ row.visitSubLabel }}</div>
          </template>
        </el-table-column>
        <el-table-column label="來源類型" min-width="160">
          <template #default="{ row }">
            <el-select
              v-model="row.point_code"
              :disabled="readOnly"
              aria-label="來源類型"
              @change="(v: string) => patchRow(row, { point_code: v })"
            >
              <el-option
                v-for="opt in pointCatalogOptions"
                :key="opt.value"
                :value="opt.value"
                :label="opt.label"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="點數" width="110">
          <template #default="{ row }">
            <el-input-number
              v-model="row.points"
              :min="0"
              :step="0.1"
              :disabled="readOnly"
              controls-position="right"
              aria-label="點數"
              @change="(v?: number) => v != null && patchRow(row, { points: v })"
            />
          </template>
        </el-table-column>
        <el-table-column label="班別倍數" width="110">
          <template #default="{ row }">
            <el-input-number
              v-model="row.grade_multiplier"
              :min="0"
              :step="0.1"
              :disabled="readOnly"
              controls-position="right"
              aria-label="班別倍數"
              @change="(v?: number) => v != null && patchRow(row, { grade_multiplier: v })"
            />
            <div v-if="hasGradeFlag(row)" class="grade-flag">
              <el-tag type="warning" size="small">班別待確認</el-tag>
              <el-button v-if="!readOnly" link type="primary" size="small" @click="confirmGradeMultiplier(row)">
                確認倍數
              </el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="招生人" min-width="160">
          <template #default="{ row }">
            <el-select
              v-model="row.employee_id"
              filterable
              clearable
              :disabled="readOnly"
              aria-label="招生人"
              :placeholder="row.unassigned ? '未指定（需手動選擇）' : ''"
              @change="(v: number | null) => patchRow(row, { employee_id: v })"
            >
              <el-option v-for="emp in employeeOptions" :key="emp.id" :value="emp.id" :label="emp.name" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="代收人" min-width="160">
          <template #default="{ row }">
            <el-select
              v-model="row.collector_employee_id"
              filterable
              clearable
              :disabled="readOnly"
              aria-label="代收人"
              @change="(v: number | null) => patchRow(row, { collector_employee_id: v })"
            >
              <el-option v-for="emp in employeeOptions" :key="emp.id" :value="emp.id" :label="emp.name" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="狀態" width="140">
          <template #default="{ row }">
            <el-select
              v-model="row.status"
              :disabled="readOnly"
              aria-label="歸屬狀態"
              @change="(v: string) => onStatusChange(row, v)"
            >
              <el-option v-for="opt in ATTR_STATUS_OPTIONS" :key="opt.value" :value="opt.value" :label="opt.label" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="備註" min-width="160">
          <template #default="{ row }">
            <el-input
              v-model="row.notes"
              :disabled="readOnly"
              aria-label="備註"
              @blur="onNotesBlur(row)"
            />
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-if="attributions.length > PAGE_SIZE"
        :current-page="attrPage"
        :page-size="PAGE_SIZE"
        :total="attributions.length"
        layout="prev, pager, next"
        @current-change="(p: number) => (attrPage = p)"
      />

      <h4 class="summary-title">每師彙總</h4>
      <div class="summary-cards">
        <div v-for="s in detail.employee_summary" :key="s.employee_id" class="summary-card">
          <div class="summary-card__name">
            {{ s.employee_name }}
            <span v-if="s.resigned" class="badge-resigned">已離職</span>
          </div>
          <div class="summary-card__body">
            確認 {{ s.counted_persons }} 人 → 單價 {{ formatCurrency(s.unit_price) }} → 金額
            <strong>{{ formatCurrency(s.total_amount) }}</strong>
          </div>
        </div>
        <EmptyState
          v-if="detail.employee_summary.length === 0"
          variant="inline"
          title="尚無已確認歸屬"
          description="確認歸屬列後這裡會即時算出每師彙總"
        />
      </div>

      <template v-if="isSettled">
        <h4 class="summary-title">已發放明細（獨立轉帳）</h4>
        <LoadErrorState
          v-if="extraBonusError"
          compact
          title="已發放明細載入失敗"
          description="載入成功前請勿視為尚未發放，請重新載入。"
          :retrying="extraBonusLoading"
          @retry="fetchSettledPayments"
        />
        <template v-else>
          <el-table v-loading="extraBonusLoading" :data="extraBonusTableData" stripe style="width: 100%">
            <el-table-column prop="employee_name" label="員工" min-width="120" />
            <el-table-column label="金額" width="120">
              <template #default="{ row }">{{ row.amountLabel }}</template>
            </el-table-column>
            <el-table-column label="歸屬年月" width="120">
              <template #default="{ row }">{{ row.period_year }} / {{ row.period_month }}</template>
            </el-table-column>
            <el-table-column prop="remark" label="備註" min-width="200" />
          </el-table>
          <EmptyState
            v-if="!extraBonusLoading && extraBonusItems.length === 0"
            variant="inline"
            title="查無已發放明細"
            description="可能尚未寫入或查詢年月不符，請確認結算月份"
          />
        </template>
      </template>

        </el-tab-pane>
        <el-tab-pane label="獎金條" name="slips" lazy>
          <BonusSlipsTab v-if="selectedCampaignId" :campaign-id="selectedCampaignId" />
        </el-tab-pane>
        <el-tab-pane label="轉帳名冊" name="roster" lazy>
          <TransferRosterTab v-if="selectedCampaignId" :campaign-id="selectedCampaignId" />
        </el-tab-pane>
      </el-tabs>
    </template>

    <!-- ============ 新增期間 dialog ============ -->
    <FormDialog
      ref="createDialogRef"
      v-model="createDialogVisible"
      title="新增招生獎金期"
      size="compact"
      submit-text="建立"
      :dirty="createDirty"
      :loading="creating"
      :enter-submit="false"
      @submit="submitCreate"
    >
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top" @submit.prevent>
        <el-form-item label="名稱" prop="name">
          <el-input v-model="createForm.name" placeholder="例：115上招生獎勵（115.3.16–9.15）" />
        </el-form-item>
        <el-form-item label="起日" prop="start_date">
          <el-date-picker v-model="createForm.start_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="迄日" prop="end_date">
          <el-date-picker v-model="createForm.end_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <p class="hint">級距表／班別倍數／來源點數目錄／代收分潤金額一律先套辦法預設值，建立後可於歸屬列逐筆調整。</p>
      </el-form>
    </FormDialog>

    <!-- ============ 新增歸屬列 dialog ============ -->
    <FormDialog
      ref="addDialogRef"
      v-model="addDialogVisible"
      title="新增歸屬列"
      size="standardNarrow"
      submit-text="新增"
      :dirty="addDirty"
      :loading="adding"
      :enter-submit="false"
      @submit="submitAdd"
    >
      <el-form ref="addFormRef" :model="addForm" :rules="addRules" label-position="top" class="form-grid" @submit.prevent>
        <!-- 2026-09-06：原本要手打裸的 visit id，招生人員得自己去記或另開分頁查。
             改成用姓名搜尋招生訪視，選到誰就帶哪個 id。 -->
        <el-form-item label="幼生" class="fg-12">
          <el-select
            v-model="addForm.recruitment_visit_id"
            filterable
            remote
            clearable
            reserve-keyword
            placeholder="輸入幼生姓名搜尋"
            :remote-method="searchVisits"
            :loading="visitSearchLoading"
            style="width: 100%"
            data-test="bonus-visit-search"
          >
            <el-option
              v-for="v in visitOptions"
              :key="v.id"
              :value="v.id"
              :label="v.label"
            />
          </el-select>
          <div class="hint">找不到人時，先確認該筆訪視已建立在「招生入學 → 訪視明細」；不選幼生則為手動加列。</div>
        </el-form-item>
        <el-form-item label="來源類型" prop="point_code" class="fg-6">
          <el-select v-model="addForm.point_code" style="width: 100%">
            <el-option v-for="opt in pointCatalogOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
          </el-select>
        </el-form-item>
        <el-form-item label="點數" prop="points" class="fg-6">
          <el-input-number v-model="addForm.points" :min="0" :step="0.1" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="班別倍數" prop="grade_multiplier" class="fg-6">
          <el-input-number v-model="addForm.grade_multiplier" :min="0" :step="0.1" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="招生人" class="fg-6">
          <el-select v-model="addForm.employee_id" filterable clearable style="width: 100%">
            <el-option v-for="emp in employeeOptions" :key="emp.id" :value="emp.id" :label="emp.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="代收人" class="fg-6">
          <el-select v-model="addForm.collector_employee_id" filterable clearable style="width: 100%">
            <el-option v-for="emp in employeeOptions" :key="emp.id" :value="emp.id" :label="emp.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="備註" class="fg-12">
          <el-input v-model="addForm.notes" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
    </FormDialog>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormItemRule, type FormRules } from 'element-plus'
import { ArrowLeft, Download } from '@element-plus/icons-vue'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import AdminCreateButton from '@/components/common/AdminCreateButton.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'
import FormDialog from '@/components/common/FormDialog.vue'
import LoadErrorState from '@/components/salary/LoadErrorState.vue'
import { useFormDirty } from '@/composables/useFormDirty'
import { useIsMobile } from '@/composables/useIsMobile'
import { required } from '@/validators/rules'
import { hasFullSalaryView, hasPermission } from '@/utils/auth'
import { formatCurrency } from '@/utils/currency'
import { friendlyError } from '@/utils/errorMessages'
import { useEmployeeStore } from '@/stores/employee'
import { getRecruitmentRecords } from '@/api/recruitment'
import {
    listCampaigns,
    createCampaign,
    getCampaign,
    syncCandidates,
    createAttribution,
    patchAttribution,
    settleCampaign,
    exportCampaignXlsx,
} from '@/api/recruitmentBonus'
import ReportStatementTab from '@/components/recruitmentBonus/ReportStatementTab.vue'
import BonusSlipsTab from '@/components/recruitmentBonus/BonusSlipsTab.vue'
import TransferRosterTab from '@/components/recruitmentBonus/TransferRosterTab.vue'
import { listExtraBonuses } from '@/api/extraBonuses'
import type { ApiBody, Schema } from '@/api/_generated/typed'

// 招生獎金核算頁（計畫 Task 10）：campaign 列表/建立 → 明細（同步候選、attribution grid、
// 每師彙總卡、結算）。結算把已確認歸屬換算成錢寫入表外獎金通道（ExtraBonusPayment，
// category="recruitment"；畫面上稱「獨立轉帳」），本頁沒有其他錢落地頁面可看，結算後改讀
// GET /extra-bonuses?category=recruitment 顯示「已發放明細」（spec §5.4）。

type CampaignRow = Schema<'CampaignOut'>
type CampaignDetail = Schema<'CampaignDetailOut'>
type AttributionRow = Schema<'AttributionOut'>
type AttributionUpdateBody = ApiBody<
    '/recruitment-bonus/campaigns/{campaign_id}/attributions/{attribution_id}',
    'patch'
>
type AttributionCreateBody = ApiBody<'/recruitment-bonus/campaigns/{campaign_id}/attributions', 'post'>
type CampaignCreateBody = ApiBody<'/recruitment-bonus/campaigns', 'post'>
type ExtraBonusRow = Schema<'ExtraBonusOut'>

interface EmployeeOption {
    id: number
    name: string
}

const STATUS_LABELS: Record<string, string> = { open: '進行中', settled: '已結算' }
const ATTR_STATUS_LABELS: Record<string, string> = {
    pending: '待確認',
    confirmed: '已確認',
    excluded: '排除',
    deferred: '遞延下期',
}
const ATTR_STATUS_OPTIONS = Object.entries(ATTR_STATUS_LABELS).map(([value, label]) => ({ value, label }))
const PAGE_SIZE = 20

const canViewFullSalary = computed(
    () => hasPermission('SALARY_READ') && hasFullSalaryView(),
)
const canWrite = computed(
    () => canViewFullSalary.value && hasPermission('SALARY_WRITE'),
)

const employeeStore = useEmployeeStore()
const employeeOptions = computed<EmployeeOption[]>(() => (employeeStore.employees || []) as EmployeeOption[])

const { isMobile } = useIsMobile()

// 表單是否通過驗證。ref 未綁定（dialog 尚未渲染）視同失敗（fail-closed），
// 與 EP 的 validate() 在無法判定時的保守行為一致。
const isFormValid = async (form: FormInstance | undefined): Promise<boolean> =>
    form ? await form.validate().catch(() => false) : false

// ---- 列表 ----
const campaigns = ref<CampaignRow[]>([])
const listLoading = ref(false)
// 載入失敗時不能退回「尚無招生獎金期」，否則行政會誤以為還沒建期而重複建立。
const listError = ref(false)
const campaignTableData = computed(() =>
    campaigns.value.map((c) => ({ ...c, statusLabel: STATUS_LABELS[c.status] || c.status })),
)
// 手機改卡片（表格 5 欄＋固定操作欄在 390px 太擠）；整張卡片可點進明細。
const CAMPAIGN_CARD_COLUMNS = [
    { label: '期間', prop: 'periodLabel' },
    { label: '狀態', prop: 'statusLabel' },
    { label: '待確認', prop: 'pending_count' },
    { label: '已確認', prop: 'confirmed_count' },
]
const campaignCards = computed<Record<string, unknown>[]>(() =>
    campaignTableData.value.map((c) => ({ ...c, periodLabel: `${c.start_date} ～ ${c.end_date}` })),
)
const onCampaignCardClick = (item: Record<string, unknown>) => {
    const row = campaigns.value.find((c) => c.id === Number(item.id))
    if (row) void openDetail(row)
}

const fetchCampaigns = async () => {
    if (!canViewFullSalary.value) return
    listLoading.value = true
    listError.value = false
    try {
        const res = await listCampaigns()
        campaigns.value = res.data.items
    } catch (e) {
        campaigns.value = []
        listError.value = true
        ElMessage.error(friendlyError('載入招生獎金期列表失敗', e))
    } finally {
        listLoading.value = false
    }
}

// ---- 新增期間 ----
const createDialogVisible = ref(false)
const creating = ref(false)
const createFormRef = ref<FormInstance>()
const createDialogRef = ref<InstanceType<typeof FormDialog>>()
const createForm = reactive({ name: '', start_date: '', end_date: '' })
const { isDirty: createDirty, snapshot: snapshotCreate } = useFormDirty(createForm)
const createRules: FormRules = {
    name: [required('期間名稱')],
    start_date: [required('起日', { kind: 'select' })],
    end_date: [
        required('迄日', { kind: 'select' }),
        {
            validator: (_rule: unknown, value: string, cb: (error?: Error) => void) => {
                if (value && createForm.start_date && value < createForm.start_date) cb(new Error('迄日不可早於起日'))
                else cb()
            },
            trigger: 'change',
        },
    ],
}
const openCreateDialog = () => {
    createForm.name = ''
    createForm.start_date = ''
    createForm.end_date = ''
    snapshotCreate()
    createDialogVisible.value = true
}
const submitCreate = async () => {
    if (creating.value) return
    creating.value = true
    try {
        if (!(await isFormValid(createFormRef.value))) {
            createDialogRef.value?.scrollToFirstError()
            return
        }
        const body: CampaignCreateBody = {
            name: createForm.name.trim(),
            start_date: createForm.start_date,
            end_date: createForm.end_date,
        }
        await createCampaign(body)
        ElMessage.success('已新增招生獎金期')
        createDialogVisible.value = false
        await fetchCampaigns()
    } catch (e) {
        ElMessage.error(friendlyError('新增招生獎金期失敗', e))
    } finally {
        creating.value = false
    }
}

// ---- 明細 ----
const selectedCampaignId = ref<number | null>(null)
const detail = ref<CampaignDetail | null>(null)
const detailLoading = ref(false)
// 明細載入失敗：還沒有 detail 時整頁顯示錯誤態；已有 detail 時（重抓失敗）顯示「資料可能過期」橫幅並擋結算。
const detailError = ref(false)

// 四 tab：統計表（預設，仿園方 Excel）／歸屬核對（既有編輯表格）／獎金條／轉帳名冊
const activeTab = ref<'statement' | 'grid' | 'slips' | 'roster'>('statement')
const statementRef = ref<{ reload: () => Promise<void> } | null>(null)

// ---- 匯出 Excel（需完整薪資檢視權限，403 時 toast 說明）----
const exporting = ref(false)
const doExport = async () => {
    if (!selectedCampaignId.value) return
    exporting.value = true
    try {
        const res = await exportCampaignXlsx(selectedCampaignId.value)
        const url = URL.createObjectURL(res.data as Blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `招生獎金_${detail.value?.name || selectedCampaignId.value}.xlsx`
        a.click()
        URL.revokeObjectURL(url)
    } catch (e) {
        ElMessage.error(friendlyError('匯出失敗（需完整薪資檢視權限）', e))
    } finally {
        exporting.value = false
    }
}

const isSettled = computed(() => detail.value?.status === 'settled')
const readOnly = computed(() => isSettled.value || !canWrite.value)

// race guard：快速切換期別／返回列表時，只有最後一次發出的請求可寫入畫面狀態。
let detailSeq = 0
const fetchDetail = async (id: number): Promise<boolean> => {
    if (!canViewFullSalary.value) return false
    const seq = ++detailSeq
    detailLoading.value = true
    detailError.value = false
    try {
        const res = await getCampaign(id)
        if (seq !== detailSeq) return false
        detail.value = res.data
        return true
    } catch (e) {
        if (seq !== detailSeq) return false
        detailError.value = true
        ElMessage.error(friendlyError('載入招生獎金期明細失敗', e))
        return false
    } finally {
        if (seq === detailSeq) detailLoading.value = false
    }
}

const openDetail = async (row: CampaignRow) => {
    selectedCampaignId.value = row.id
    activeTab.value = 'statement'
    detail.value = null
    extraBonusItems.value = []
    extraBonusError.value = false
    const ok = await fetchDetail(row.id)
    if (ok && detail.value?.status === 'settled') {
        await fetchSettledPayments()
    }
}

const retryDetail = async () => {
    const id = selectedCampaignId.value
    if (id == null) return
    const ok = await fetchDetail(id)
    if (!ok) return
    if (detail.value?.status === 'settled') await fetchSettledPayments()
    void statementRef.value?.reload()
}

const backToList = () => {
    detailSeq++ // 丟棄還在飛的明細請求
    selectedCampaignId.value = null
    detail.value = null
    detailError.value = false
    detailLoading.value = false
    fetchCampaigns()
}

// 一期上百筆歸屬列（辦法半年一期，Excel 115.03 單月即 15+ 人 × 多期累積）——client 端分頁，
// 避免整批塞進 DOM；資料已在明細一次 GET 回來（後端未分頁），分頁只影響本頁渲染筆數。
const attrPage = ref(1)
const attributions = computed(() => detail.value?.attributions || [])
const pagedAttributions = computed<AttributionRow[]>(() => {
    const start = (attrPage.value - 1) * PAGE_SIZE
    return attributions.value.slice(start, start + PAGE_SIZE)
})

const pointCatalog = computed(() => (detail.value?.point_catalog || {}) as Record<string, { label?: string }>)
const pointCatalogOptions = computed(() =>
    Object.entries(pointCatalog.value).map(([code, meta]) => ({ value: code, label: meta?.label || code })),
)

interface AttributionDisplayRow extends AttributionRow {
    statusLabel: string
    pointLabel: string
    visitLabel: string
    visitSubLabel: string
    unassigned: boolean
}
const pagedAttributionRows = computed<AttributionDisplayRow[]>(() =>
    pagedAttributions.value.map((row) => ({
        ...row,
        statusLabel: ATTR_STATUS_LABELS[row.status] || row.status,
        pointLabel: pointCatalog.value[row.point_code]?.label || row.point_code,
        visitLabel: row.child_name
            ? `${row.child_name}${row.visit_grade ? `（${row.visit_grade}）` : ''}`
            : row.recruitment_visit_id != null
              ? `訪視 #${row.recruitment_visit_id}`
              : '（手動加列）',
        visitSubLabel: row.visit_month ?? '',
        unassigned: row.employee_id == null,
    })),
)
const unassignedCount = computed(() => attributions.value.filter((a) => a.employee_id == null).length)

// 2026-10-22 義華比對 #82／#80：後端 sync 寫入 notes 的標記（字串須與
// ivy-backend services/recruitment_bonus/sync.py 的 GRADE_MISSING_NOTE／拆分警示一致）。
const GRADE_FLAG_TEXT = '班別缺值或無法辨識'
const SPLIT_FLAG_TEXTS = ['邀約拆分未完成', '兄姊二人均分 0.5']
const hasGradeFlag = (row: { notes?: string | null }): boolean =>
    (row.notes ?? '').includes(GRADE_FLAG_TEXT)
const hasSplitFlag = (row: { notes?: string | null; status?: string }): boolean =>
    row.status !== 'excluded' && SPLIT_FLAG_TEXTS.some((t) => (row.notes ?? '').includes(t))
const gradeUnconfirmedCount = computed(
    () => attributions.value.filter((a) => a.status !== 'excluded' && hasGradeFlag(a)).length,
)
const splitIncompleteCount = computed(() => attributions.value.filter((a) => hasSplitFlag(a)).length)
const attributionRowClass = ({ row }: { row: AttributionDisplayRow }) => (row.unassigned ? 'row-unassigned' : '')

// ---- 同步候選 ----
const syncing = ref(false)
const doSync = async () => {
    if (!selectedCampaignId.value) return
    // 同步不只新增候選：已退預繳的列會被自動改成「排除」（連已確認的也一樣），該員工的獎金金額會跟著變。
    try {
        await ElMessageBox.confirm(
            '同步會依招生訪視新增「待確認」的候選列，並把已退預繳的列自動改為「排除」（包含已確認的列，該員工的獎金金額會隨之改變）。可重複執行，已建立的列不會重複產生。確定同步？',
            '確認同步候選',
            { confirmButtonText: '開始同步', cancelButtonText: '取消', type: 'warning' },
        )
    } catch {
        return
    }
    syncing.value = true
    try {
        const res = await syncCandidates(selectedCampaignId.value)
        const r = res.data
        ElMessage.success(
            `同步完成：新增 ${r.created}／排除 ${r.excluded}／跳過（他期已歸屬）${r.skipped_other_campaign}／遞延承接 ${r.carried_over}`,
        )
        await fetchDetail(selectedCampaignId.value)
        void statementRef.value?.reload()
    } catch (e) {
        ElMessage.error(friendlyError('同步候選失敗', e))
    } finally {
        syncing.value = false
    }
}

// ---- 歸屬列編輯 ----
const patchRow = async (row: AttributionRow, patch: AttributionUpdateBody) => {
    const campaignId = selectedCampaignId.value
    if (!campaignId) return
    try {
        await patchAttribution(campaignId, row.id, patch)
    } catch (e) {
        ElMessage.error(friendlyError('更新歸屬列失敗', e))
        await fetchDetail(campaignId) // 失敗時重抓，還原成伺服器端真實值
        return
    }
    await fetchDetail(campaignId)
    void statementRef.value?.reload()
}

// 備註欄 blur 就送太浪費：只有內容真的改過才 PATCH（列是明細的複本，原值取自 detail）。
const onNotesBlur = (row: AttributionRow) => {
    const saved = attributions.value.find((a) => a.id === row.id)
    if ((saved?.notes ?? '') === (row.notes ?? '')) return
    void patchRow(row, { notes: row.notes })
}

// 值不變也要送：el-input-number 同值不觸發 change，HR 確認「維持 1.0」須走此鈕。
const confirmGradeMultiplier = (row: AttributionRow) => {
    patchRow(row, { grade_multiplier: Number(row.grade_multiplier) })
}

const onStatusChange = (row: AttributionRow, status: string) => {
    if (status === 'confirmed' && hasGradeFlag(row)) {
        ElMessage.warning('此列班別缺值或無法辨識，請先修正「班別倍數」或按「確認倍數」後再確認')
        if (selectedCampaignId.value != null) fetchDetail(selectedCampaignId.value)
        return
    }
    if (status === 'confirmed' && row.employee_id == null) {
        ElMessage.warning('招生人未指定，無法確認（錢無人可歸）；請先於本列選擇招生人')
        // el-select 的 v-model 已樂觀更新成 'confirmed'，不送 PATCH（後端本來就會 422）；
        // 重抓明細把顯示值還原成伺服器端真實的 pending，避免畫面與資料庫不一致。
        if (selectedCampaignId.value != null) fetchDetail(selectedCampaignId.value)
        return
    }
    patchRow(row, { status })
}

// ---- 招生訪視搜尋（2026-09-06）----
// 原本要手打裸的 visit id，招生人員得自己去記或另開分頁查訪視編號。
interface VisitOption { id: number; label: string }
const visitOptions = ref<VisitOption[]>([])
const visitSearchLoading = ref(false)

const searchVisits = async (keyword: string) => {
    const kw = keyword.trim()
    if (!kw) {
        visitOptions.value = []
        return
    }
    visitSearchLoading.value = true
    try {
        const resp = await getRecruitmentRecords({ keyword: kw, page_size: 20 })
        const rows = (resp.data as { records?: Record<string, unknown>[] } | undefined)?.records ?? []
        visitOptions.value = rows.map((r) => {
            const term = r.target_school_year != null && r.target_semester != null
                ? ` · ${r.target_school_year}-${r.target_semester}`
                : ''
            const grade = r.grade ? ` · ${String(r.grade)}` : ''
            return {
                id: Number(r.id),
                label: `${String(r.child_name ?? '')}${grade}${term}（#${Number(r.id)}）`,
            }
        })
    } catch (e) {
        ElMessage.error(friendlyError('搜尋招生訪視失敗', e))
        visitOptions.value = []
    } finally {
        visitSearchLoading.value = false
    }
}

// ---- 手動新增歸屬列 ----
const addDialogVisible = ref(false)
const adding = ref(false)
const addFormRef = ref<FormInstance>()
const addDialogRef = ref<InstanceType<typeof FormDialog>>()
const addForm = reactive<{
    recruitment_visit_id: number | null
    employee_id: number | null
    point_code: string
    points: number
    grade_multiplier: number
    collector_employee_id: number | null
    status: string
    notes: string
}>({
    recruitment_visit_id: null,
    employee_id: null,
    point_code: '',
    points: 0,
    grade_multiplier: 1,
    collector_employee_id: null,
    status: 'pending',
    notes: '',
})
const { isDirty: addDirty, snapshot: snapshotAdd } = useFormDirty(addForm)
// 數值欄清空時 el-input-number 會給 null／undefined，送出去後端會 422，先擋在表單。
const numberRequired = (label: string): FormItemRule => ({
    required: true,
    type: 'number',
    min: 0,
    message: `請輸入${label}（0 以上的數字）`,
    trigger: 'change',
})
const addRules: FormRules = {
    point_code: [required('來源類型', { kind: 'select' })],
    points: [numberRequired('點數')],
    grade_multiplier: [numberRequired('班別倍數')],
}
const openAddDialog = () => {
    visitOptions.value = []
    addForm.recruitment_visit_id = null
    addForm.employee_id = null
    addForm.point_code = pointCatalogOptions.value[0]?.value || ''
    addForm.points = 0
    addForm.grade_multiplier = 1
    addForm.collector_employee_id = null
    addForm.status = 'pending'
    addForm.notes = ''
    snapshotAdd()
    addDialogVisible.value = true
}
const submitAdd = async () => {
    const campaignId = selectedCampaignId.value
    if (!campaignId || adding.value) return
    adding.value = true
    try {
        if (!(await isFormValid(addFormRef.value))) {
            addDialogRef.value?.scrollToFirstError()
            return
        }
        const body: AttributionCreateBody = { ...addForm }
        await createAttribution(campaignId, body)
        ElMessage.success('已新增歸屬列')
        addDialogVisible.value = false
        await fetchDetail(campaignId)
        void statementRef.value?.reload()
    } catch (e) {
        ElMessage.error(friendlyError('新增歸屬列失敗', e))
    } finally {
        adding.value = false
    }
}

// ---- 結算 ----
const settling = ref(false)
const settleDisabledReason = computed(() => {
    if (!detail.value) return ''
    if (detail.value.status === 'settled') return '本期已結算'
    if (detailError.value) return '資料重新載入失敗，請先重新載入後再結算'
    if (detail.value.pending_count > 0) return `尚有 ${detail.value.pending_count} 筆候選待確認，請先於上方歸屬列處理`
    return ''
})
const settleDisabled = computed(() => !!settleDisabledReason.value)

const doSettle = async () => {
    if (!detail.value || !selectedCampaignId.value) return
    const payable = detail.value.employee_summary.filter((s) => s.total_amount > 0)
    const totalAmount = payable.reduce((sum, s) => sum + s.total_amount, 0)
    try {
        await ElMessageBox.confirm(
            `即將結算「${detail.value.name}」：將寫入 ${payable.length} 位員工共 ${formatCurrency(totalAmount)}，結算後不可撤銷，歸屬列與參數也不可再修改。確定結算？`,
            '確認結算',
            { confirmButtonText: '確定結算', cancelButtonText: '取消', type: 'warning' },
        )
    } catch {
        return
    }
    settling.value = true
    try {
        await settleCampaign(selectedCampaignId.value)
        ElMessage.success('結算完成，獎金已列入獨立轉帳發放')
        await fetchDetail(selectedCampaignId.value)
        await fetchSettledPayments()
        void statementRef.value?.reload()
    } catch (e) {
        ElMessage.error(friendlyError('結算失敗', e))
    } finally {
        settling.value = false
    }
}

// ---- 已發放明細（表外獎金） ----
const extraBonusItems = ref<ExtraBonusRow[]>([])
const extraBonusLoading = ref(false)
// 失敗時不能顯示「查無已發放明細」，否則會被誤讀成「還沒發」。
const extraBonusError = ref(false)
const extraBonusTableData = computed(() =>
    extraBonusItems.value.map((row) => ({ ...row, amountLabel: formatCurrency(row.amount) })),
)
const fetchSettledPayments = async () => {
    if (!detail.value?.settled_at) return
    const settledDate = new Date(detail.value.settled_at)
    extraBonusLoading.value = true
    extraBonusError.value = false
    try {
        const res = await listExtraBonuses({
            year: settledDate.getFullYear(),
            month: settledDate.getMonth() + 1,
            category: 'recruitment',
        })
        extraBonusItems.value = res.data.items
    } catch (e) {
        extraBonusItems.value = []
        extraBonusError.value = true
        ElMessage.error(friendlyError('載入已發放明細失敗', e))
    } finally {
        extraBonusLoading.value = false
    }
}

onMounted(() => {
    if (!canViewFullSalary.value) return
    fetchCampaigns()
    employeeStore.fetchEmployees?.()
})
</script>

<style scoped>
.detail-header h3 {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.readonly-banner {
  color: var(--el-color-success);
  font-weight: 600;
}
.detail-header h3 {
  flex-wrap: wrap;
}
.action-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin: var(--space-3) 0;
}
.action-bar .el-button + .el-button {
  margin-left: 0;
}
.settle-reason {
  color: var(--el-color-warning);
}
.stale-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2);
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
  padding: var(--space-2) var(--space-3);
  border-radius: 4px;
  margin-bottom: var(--space-3);
}
.scroll-hint {
  display: none;
  margin: 0 0 var(--space-2);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
@media (--to-sm) {
  .action-bar > .el-button {
    flex: 1 1 calc(50% - var(--space-3));
  }
  .settle-reason {
    flex-basis: 100%;
  }
  .scroll-hint {
    display: block;
  }
}
.visit-sub {
    font-size: 12px;
    color: var(--el-text-color-secondary);
}

.unassigned-banner {
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
  padding: var(--space-2) var(--space-3);
  border-radius: 4px;
  margin-bottom: var(--space-3);
}
.grade-flag {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin-top: var(--space-1);
}
.summary-title {
  margin: var(--space-4) 0 var(--space-2);
}
.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}
.summary-card {
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  padding: var(--space-3);
}
.summary-card__name {
  font-weight: 600;
  margin-bottom: var(--space-1);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.badge-resigned {
  font-size: 11px;
  color: #fff;
  background: var(--el-color-danger);
  border-radius: 3px;
  padding: 1px 6px;
}
:deep(.row-unassigned) {
  background-color: var(--el-color-warning-light-9);
}
</style>
