<template>
  <div>
    <PageHeader title="招生獎金" subtitle="教職員個人招生獎勵：候選同步、確認歸屬、結算轉帳">
      <template #actions>
        <el-button v-if="!selectedCampaignId && canWrite" type="primary" :icon="Plus" @click="openCreateDialog">
          新增期間
        </el-button>
        <el-button v-if="selectedCampaignId" @click="backToList">返回列表</el-button>
      </template>
    </PageHeader>

    <!-- ============ 列表 ============ -->
    <template v-if="!selectedCampaignId">
      <EmptyState v-if="!listLoading && campaigns.length === 0" title="尚無招生獎金期" description="點右上角「新增期間」建立第一期" />
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
    <template v-else-if="detail">
      <div class="detail-header">
        <h3>
          {{ detail.name }}
          <el-tag :type="isSettled ? 'success' : 'primary'">{{ isSettled ? '已結算' : '進行中' }}</el-tag>
        </h3>
        <p class="hint">{{ detail.start_date }} ～ {{ detail.end_date }}</p>
        <p v-if="isSettled" class="readonly-banner">
          本期已結算（唯讀），已寫入表外獎金（招生獎金）。歸屬列與參數不可再修改。
        </p>
      </div>

      <div class="action-bar">
        <el-button v-if="canWrite && !isSettled" :loading="syncing" @click="doSync">同步候選</el-button>
        <el-button v-if="canWrite && !isSettled" @click="openAddDialog">新增歸屬列</el-button>
        <el-button v-if="canWrite && !isSettled" type="danger" :disabled="settleDisabled" :loading="settling" @click="doSettle">
          結算
        </el-button>
        <span v-if="settleDisabledReason" class="hint settle-reason">{{ settleDisabledReason }}</span>
      </div>

      <p v-if="unassignedCount > 0" class="unassigned-banner">
        {{ unassignedCount }} 筆招生人待指定，請於下表「招生人」欄手動選擇（比對不到唯一員工姓名時系統不會自動猜）。
      </p>

      <el-table :data="pagedAttributionRows" stripe style="width: 100%" :row-class-name="attributionRowClass">
        <el-table-column label="幼生" min-width="120">
          <template #default="{ row }">{{ row.visitLabel }}</template>
        </el-table-column>
        <el-table-column label="來源點數類型" min-width="160">
          <template #default="{ row }">
            <el-select
              v-model="row.point_code"
              :disabled="readOnly"
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
              @change="(v?: number) => v != null && patchRow(row, { grade_multiplier: v })"
            />
          </template>
        </el-table-column>
        <el-table-column label="招生人" min-width="160">
          <template #default="{ row }">
            <el-select
              v-model="row.employee_id"
              filterable
              clearable
              :disabled="readOnly"
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
              @change="(v: number | null) => patchRow(row, { collector_employee_id: v })"
            >
              <el-option v-for="emp in employeeOptions" :key="emp.id" :value="emp.id" :label="emp.name" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="狀態" width="140">
          <template #default="{ row }">
            <el-select v-model="row.status" :disabled="readOnly" @change="(v: string) => onStatusChange(row, v)">
              <el-option v-for="opt in ATTR_STATUS_OPTIONS" :key="opt.value" :value="opt.value" :label="opt.label" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="備註" min-width="160">
          <template #default="{ row }">
            <el-input
              v-model="row.notes"
              :disabled="readOnly"
              @blur="patchRow(row, { notes: row.notes })"
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
        <h4 class="summary-title">已發放明細（表外獎金－招生獎金）</h4>
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

    <!-- ============ 新增期間 dialog ============ -->
    <el-dialog v-model="createDialogVisible" title="新增招生獎金期" width="480px">
      <el-form :model="createForm" label-width="80px">
        <el-form-item label="名稱">
          <el-input v-model="createForm.name" placeholder="例：115上招生獎勵（115.3.16–9.15）" />
        </el-form-item>
        <el-form-item label="起日">
          <el-date-picker v-model="createForm.start_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="迄日">
          <el-date-picker v-model="createForm.end_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <p class="hint">級距表／班別倍數／來源點數目錄／代收分潤金額一律先套辦法預設值，建立後可於歸屬列逐筆調整。</p>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitCreate">建立</el-button>
      </template>
    </el-dialog>

    <!-- ============ 新增歸屬列 dialog ============ -->
    <el-dialog v-model="addDialogVisible" title="新增歸屬列" width="480px">
      <el-form :model="addForm" label-width="90px">
        <el-form-item label="幼生 visit id">
          <el-input-number v-model="addForm.recruitment_visit_id" :min="1" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="來源點數">
          <el-select v-model="addForm.point_code" style="width: 100%">
            <el-option v-for="opt in pointCatalogOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
          </el-select>
        </el-form-item>
        <el-form-item label="點數">
          <el-input-number v-model="addForm.points" :min="0" :step="0.1" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="班別倍數">
          <el-input-number v-model="addForm.grade_multiplier" :min="0" :step="0.1" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="招生人">
          <el-select v-model="addForm.employee_id" filterable clearable style="width: 100%">
            <el-option v-for="emp in employeeOptions" :key="emp.id" :value="emp.id" :label="emp.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="代收人">
          <el-select v-model="addForm.collector_employee_id" filterable clearable style="width: 100%">
            <el-option v-for="emp in employeeOptions" :key="emp.id" :value="emp.id" :label="emp.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="addForm.notes" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitAdd">新增</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { hasPermission } from '@/utils/auth'
import { formatCurrency } from '@/utils/currency'
import { friendlyError } from '@/utils/errorMessages'
import { useEmployeeStore } from '@/stores/employee'
import {
    listCampaigns,
    createCampaign,
    getCampaign,
    syncCandidates,
    createAttribution,
    patchAttribution,
    settleCampaign,
} from '@/api/recruitmentBonus'
import { listExtraBonuses } from '@/api/extraBonuses'
import type { ApiBody, Schema } from '@/api/_generated/typed'

// 招生獎金核算頁（計畫 Task 10）：campaign 列表/建立 → 明細（同步候選、attribution grid、
// 每師彙總卡、結算）。結算把已確認歸屬換算成錢寫入表外獎金通道（ExtraBonusPayment，
// category="recruitment"），本頁沒有其他錢落地頁面可看，結算後改讀
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

const canWrite = computed(() => hasPermission('SALARY_WRITE'))

const employeeStore = useEmployeeStore()
const employeeOptions = computed<EmployeeOption[]>(() => (employeeStore.employees || []) as EmployeeOption[])

// ---- 列表 ----
const campaigns = ref<CampaignRow[]>([])
const listLoading = ref(false)
const campaignTableData = computed(() =>
    campaigns.value.map((c) => ({ ...c, statusLabel: STATUS_LABELS[c.status] || c.status })),
)

const fetchCampaigns = async () => {
    listLoading.value = true
    try {
        const res = await listCampaigns()
        campaigns.value = res.data.items
    } catch (e) {
        ElMessage.error(friendlyError('載入招生獎金期列表失敗', e))
    } finally {
        listLoading.value = false
    }
}

// ---- 新增期間 ----
const createDialogVisible = ref(false)
const createForm = reactive({ name: '', start_date: '', end_date: '' })
const openCreateDialog = () => {
    createForm.name = ''
    createForm.start_date = ''
    createForm.end_date = ''
    createDialogVisible.value = true
}
const submitCreate = async () => {
    if (!createForm.name || !createForm.start_date || !createForm.end_date) {
        ElMessage.warning('請填寫名稱與起訖日')
        return
    }
    const body: CampaignCreateBody = {
        name: createForm.name,
        start_date: createForm.start_date,
        end_date: createForm.end_date,
    }
    try {
        await createCampaign(body)
        ElMessage.success('新增成功')
        createDialogVisible.value = false
        await fetchCampaigns()
    } catch (e) {
        ElMessage.error(friendlyError('新增招生獎金期失敗', e))
    }
}

// ---- 明細 ----
const selectedCampaignId = ref<number | null>(null)
const detail = ref<CampaignDetail | null>(null)
const detailLoading = ref(false)

const isSettled = computed(() => detail.value?.status === 'settled')
const readOnly = computed(() => isSettled.value || !canWrite.value)

const fetchDetail = async (id: number) => {
    detailLoading.value = true
    try {
        const res = await getCampaign(id)
        detail.value = res.data
    } catch (e) {
        ElMessage.error(friendlyError('載入招生獎金期明細失敗', e))
    } finally {
        detailLoading.value = false
    }
}

const openDetail = async (row: CampaignRow) => {
    selectedCampaignId.value = row.id
    extraBonusItems.value = []
    await fetchDetail(row.id)
    if (detail.value?.status === 'settled') {
        await fetchSettledPayments()
    }
}

const backToList = () => {
    selectedCampaignId.value = null
    detail.value = null
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
    unassigned: boolean
}
const pagedAttributionRows = computed<AttributionDisplayRow[]>(() =>
    pagedAttributions.value.map((row) => ({
        ...row,
        statusLabel: ATTR_STATUS_LABELS[row.status] || row.status,
        pointLabel: pointCatalog.value[row.point_code]?.label || row.point_code,
        // ⚠ AttributionOut 沒有幼生姓名欄位（後端未 join RecruitmentVisit），只能顯示
        // visit id 供 HR 對照招生名冊；已知缺口，見報告 (c)。
        visitLabel: row.recruitment_visit_id != null ? `訪視 #${row.recruitment_visit_id}` : '（手動加列）',
        unassigned: row.employee_id == null,
    })),
)
const unassignedCount = computed(() => attributions.value.filter((a) => a.employee_id == null).length)
const attributionRowClass = ({ row }: { row: AttributionDisplayRow }) => (row.unassigned ? 'row-unassigned' : '')

// ---- 同步候選 ----
const syncing = ref(false)
const doSync = async () => {
    if (!selectedCampaignId.value) return
    syncing.value = true
    try {
        const res = await syncCandidates(selectedCampaignId.value)
        const r = res.data
        ElMessage.success(
            `同步完成：新增 ${r.created}／排除 ${r.excluded}／跳過（他期已歸屬）${r.skipped_other_campaign}／遞延承接 ${r.carried_over}`,
        )
        await fetchDetail(selectedCampaignId.value)
    } catch (e) {
        ElMessage.error(friendlyError('同步候選失敗', e))
    } finally {
        syncing.value = false
    }
}

// ---- 歸屬列編輯 ----
const patchRow = async (row: AttributionRow, patch: AttributionUpdateBody) => {
    if (!selectedCampaignId.value) return
    try {
        await patchAttribution(selectedCampaignId.value, row.id, patch)
        await fetchDetail(selectedCampaignId.value)
    } catch (e) {
        ElMessage.error(friendlyError('更新歸屬列失敗', e))
        await fetchDetail(selectedCampaignId.value) // 失敗時重抓，還原成伺服器端真實值
    }
}

const onStatusChange = (row: AttributionRow, status: string) => {
    if (status === 'confirmed' && row.employee_id == null) {
        ElMessage.warning('招生人未指定，無法確認（錢無人可歸）；請先於本列選擇招生人')
        // el-select 的 v-model 已樂觀更新成 'confirmed'，不送 PATCH（後端本來就會 422）；
        // 重抓明細把顯示值還原成伺服器端真實的 pending，避免畫面與資料庫不一致。
        if (selectedCampaignId.value != null) fetchDetail(selectedCampaignId.value)
        return
    }
    patchRow(row, { status })
}

// ---- 手動新增歸屬列 ----
const addDialogVisible = ref(false)
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
const openAddDialog = () => {
    addForm.recruitment_visit_id = null
    addForm.employee_id = null
    addForm.point_code = pointCatalogOptions.value[0]?.value || ''
    addForm.points = 0
    addForm.grade_multiplier = 1
    addForm.collector_employee_id = null
    addForm.status = 'pending'
    addForm.notes = ''
    addDialogVisible.value = true
}
const submitAdd = async () => {
    if (!selectedCampaignId.value) return
    const body: AttributionCreateBody = { ...addForm }
    try {
        await createAttribution(selectedCampaignId.value, body)
        ElMessage.success('新增成功')
        addDialogVisible.value = false
        await fetchDetail(selectedCampaignId.value)
    } catch (e) {
        ElMessage.error(friendlyError('新增歸屬列失敗', e))
    }
}

// ---- 結算 ----
const settling = ref(false)
const settleDisabledReason = computed(() => {
    if (!detail.value) return ''
    if (detail.value.status === 'settled') return '本期已結算'
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
        ElMessage.success('結算完成，已寫入表外獎金通道')
        await fetchDetail(selectedCampaignId.value)
        await fetchSettledPayments()
    } catch (e) {
        ElMessage.error(friendlyError('結算失敗', e))
    } finally {
        settling.value = false
    }
}

// ---- 已發放明細（表外獎金） ----
const extraBonusItems = ref<ExtraBonusRow[]>([])
const extraBonusLoading = ref(false)
const extraBonusTableData = computed(() =>
    extraBonusItems.value.map((row) => ({ ...row, amountLabel: formatCurrency(row.amount) })),
)
const fetchSettledPayments = async () => {
    if (!detail.value?.settled_at) return
    const settledDate = new Date(detail.value.settled_at)
    extraBonusLoading.value = true
    try {
        const res = await listExtraBonuses({
            year: settledDate.getFullYear(),
            month: settledDate.getMonth() + 1,
            category: 'recruitment',
        })
        extraBonusItems.value = res.data.items
    } catch (e) {
        ElMessage.error(friendlyError('載入已發放明細失敗', e))
    } finally {
        extraBonusLoading.value = false
    }
}

onMounted(() => {
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
.action-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: var(--space-3) 0;
}
.settle-reason {
  color: var(--el-color-warning);
}
.unassigned-banner {
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
  padding: var(--space-2) var(--space-3);
  border-radius: 4px;
  margin-bottom: var(--space-3);
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
