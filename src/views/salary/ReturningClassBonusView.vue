<template>
  <div>
    <el-result
      v-if="!canViewFullSalary"
      icon="warning"
      title="無法檢視全員薪資資料"
      sub-title="此功能僅開放具完整薪資視野的角色使用"
    />
    <template v-else>
    <PageHeader title="舊生註冊／預繳獎金" subtitle="逐班舊生註冊率與預繳 100% 達標推導，結算後以獨立轉帳發放">
      <template #actions>
        <el-radio-group v-model="kind" aria-label="獎金類別">
          <el-radio-button value="registration">{{ KIND_LABELS.registration }}</el-radio-button>
          <el-radio-button value="prepay">{{ KIND_LABELS.prepay }}</el-radio-button>
        </el-radio-group>
        <el-select v-model="year" style="width: 110px" aria-label="年度">
          <el-option v-for="y in yearOptions" :key="y" :value="y" :label="`${y} 年`" />
        </el-select>
        <el-select
          v-model="month"
          style="width: 110px"
          aria-label="核算月"
          placeholder="核算月"
          :disabled="checkMonths.length === 0"
        >
          <el-option v-for="m in checkMonths" :key="m" :value="m" :label="`${m} 月`" />
        </el-select>
      </template>
    </PageHeader>

    <!-- ---- 設定 ---- -->
    <section class="config-section">
      <div class="section-header">
        <h3>獎金設定</h3>
        <div class="section-actions">
          <span v-if="canWrite && configDirty" class="dirty-hint" data-test="config-dirty-hint">有尚未儲存的變更</span>
          <el-button
            v-if="canWrite"
            type="primary"
            :loading="configSaving"
            :disabled="configLoading || configError || !configDirty"
            @click="saveConfig"
          >儲存設定</el-button>
        </div>
      </div>
      <p class="hint">
        每位領取人領固定額；副班導缺額不轉給班導。核算日請填「月-日」（例：03-15），多個以逗號分隔，同一類別同一個月只能有一個。
        預設兩類皆關閉、金額 0，不會產生任何獎金。設定要按「儲存設定」後，下方的推導才會依新設定重算。
      </p>
      <LoadErrorState
        v-if="configError"
        compact
        title="獎金設定載入失敗"
        description="載入成功前無法儲存設定，以免用空白設定蓋掉原本的內容，請重新載入。"
        :retrying="configLoading"
        @retry="fetchConfig"
      />
      <div v-else v-loading="configLoading" class="config-grid">
        <el-card v-for="k in KINDS" :key="k" shadow="never" class="config-card">
          <template #header>
            <div class="config-card__header">
              <span>{{ KIND_LABELS[k] }}</span>
              <el-switch
                v-model="configForm[k].enabled"
                :disabled="!canWrite"
                :aria-label="`啟用${KIND_LABELS[k]}`"
                active-text="啟用"
              />
            </div>
          </template>
          <el-form
            :label-width="isMobile ? 'auto' : '96px'"
            :label-position="isMobile ? 'top' : 'right'"
            :disabled="!canWrite"
            @submit.prevent
          >
            <el-form-item label="核算日">
              <el-input
                v-model="checkDateTexts[k]"
                :aria-label="`${KIND_LABELS[k]}核算日`"
                :placeholder="k === 'registration' ? '例：03-15, 09-15' : '例：06-15, 12-15'"
              />
            </el-form-item>
            <el-form-item label="班導金額">
              <el-input-number
                v-model="configForm[k].head_amount"
                :min="0"
                :max="MAX_RETURNING_BONUS_AMOUNT"
                :step="100"
                :precision="0"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item label="副班導金額">
              <el-input-number
                v-model="configForm[k].assistant_amount"
                :min="0"
                :max="MAX_RETURNING_BONUS_AMOUNT"
                :step="100"
                :precision="0"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
          </el-form>
        </el-card>
      </div>
    </section>

    <!-- ---- 預覽 ---- -->
    <section class="preview-section">
      <div class="section-header">
        <h3>逐班推導（{{ KIND_LABELS[kind] }}）</h3>
        <span v-if="preview" class="hint">
          核算日 {{ preview.check_date }}・舊生名單基準日 {{ preview.cohort_date }}
        </span>
      </div>

      <EmptyState
        v-if="configError"
        variant="inline"
        title="無法推導"
        description="獎金設定尚未載入成功，請先重新載入上方的設定"
      />
      <EmptyState
        v-else-if="checkMonths.length === 0 && !configLoading"
        variant="inline"
        title="尚未設定核算日"
        description="請先在上方「獎金設定」填入核算日並儲存"
      />
      <LoadErrorState
        v-else-if="previewError"
        compact
        title="逐班推導載入失敗"
        description="載入成功前無法結算，也請勿視為沒有達標的班級，請重新載入。"
        :retrying="previewLoading"
        @retry="fetchPreview"
      />
      <template v-else>
        <el-alert
          v-if="preview && !preview.enabled"
          class="block-alert"
          type="info"
          show-icon
          :closable="false"
          title="尚未啟用"
          description="此類別目前未啟用，僅供預覽，無法結算。請在上方設定開啟後儲存。"
        />
        <el-alert
          v-for="(w, i) in preview?.warnings ?? []"
          :key="`pw-${i}`"
          class="block-alert"
          type="warning"
          show-icon
          :closable="false"
          :title="w"
        />

        <p class="scroll-hint">表格可左右滑動，查看全部欄位</p>
        <el-table v-loading="previewLoading" :data="classTableData" stripe style="width: 100%">
          <el-table-column prop="classroom_name" label="班級" min-width="110" fixed />
          <el-table-column prop="cohort_count" label="舊生人數" width="90" />
          <el-table-column label="已達成" width="90">
            <template #default="{ row }">{{ row.qualified_count ?? '—' }}</template>
          </el-table-column>
          <el-table-column label="比率" width="90">
            <template #default="{ row }">{{ row.rateLabel }}</template>
          </el-table-column>
          <el-table-column label="達標" width="90">
            <template #default="{ row }">
              <el-tag :type="row.qualifies ? 'success' : 'info'">{{ row.qualifies ? '100% 達標' : '未達標' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="應領" min-width="260">
            <template #default="{ row }">
              <div v-for="p in row.payouts" :key="`${p.employee_id}-${p.role}`" class="class-payout">
                {{ roleLabel(p.role) }}：{{ p.employee_name || '（未具名）' }}
                <strong>{{ formatCurrency(p.amount) }}</strong>
                <span v-if="p.note" class="hint">（{{ p.note }}）</span>
              </div>
              <span v-if="row.payouts.length === 0" class="hint">—</span>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </section>

    <!-- ---- 結算 ---- -->
    <section v-if="preview && preview.payouts.length > 0" class="settle-section">
      <div class="section-header">
        <h3>領取人（依員工合併）</h3>
        <div class="section-actions">
          <span class="hint">已勾選 {{ selectedRows.length }} 位，共 {{ formatCurrency(selectedTotal) }}</span>
          <el-button
            v-if="canWrite"
            type="primary"
            :loading="settling"
            :disabled="settleDisabled"
            @click="doSettle"
          >結算</el-button>
        </div>
      </div>
      <p class="scroll-hint">表格可左右滑動，查看全部欄位</p>
      <el-table :data="preview.payouts" stripe style="width: 100%">
        <el-table-column label="發放" width="70" fixed>
          <template #default="{ row }">
            <el-checkbox
              :model-value="!row.already_paid && selectedIds.includes(row.employee_id)"
              :disabled="row.already_paid || !canWrite"
              :aria-label="`勾選 ${row.employee_name}`"
              @update:model-value="(v: unknown) => toggleSelected(row.employee_id, v === true)"
            />
          </template>
        </el-table-column>
        <el-table-column prop="employee_name" label="員工" min-width="110" fixed />
        <el-table-column label="角色" width="140">
          <template #default="{ row }">{{ row.roles.map(roleLabel).join('、') }}</template>
        </el-table-column>
        <el-table-column label="班級" min-width="140">
          <template #default="{ row }">{{ row.classrooms.join('、') }}</template>
        </el-table-column>
        <el-table-column label="金額" width="110">
          <template #default="{ row }">{{ formatCurrency(row.amount) }}</template>
        </el-table-column>
        <el-table-column label="狀態" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.already_paid" type="info">已發放</el-tag>
            <el-tooltip
              v-else-if="hasLegacyOther(row)"
              :content="`同歸屬月已有「其他」類別表外獎金 ${formatCurrency(row.legacy_other_amount ?? 0)}，可能是改版前手登的同一筆；確認不是後再勾選`"
              placement="top"
            >
              <el-tag type="warning">同月已手登</el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section v-if="settleResult" class="settle-result">
      <el-alert
        type="success"
        show-icon
        :closable="false"
        :title="`本次結算：發放 ${settleResult.created.length} 位，共 ${formatCurrency(settleResult.total_amount)}（歸屬 ${settleResult.period_year}/${settleResult.period_month}）`"
      />
      <el-alert
        v-for="g in settleSkipGroups"
        :key="g.key"
        class="block-alert"
        type="warning"
        show-icon
        :closable="false"
        :title="`跳過（${g.label}）${g.names.length} 位：${g.names.join('、')}`"
        :description="g.hint"
      />
      <el-alert
        v-for="(w, i) in settleResult.warnings"
        :key="`sw-${i}`"
        class="block-alert"
        type="warning"
        show-icon
        :closable="false"
        :title="w"
      />
    </section>

    <!-- ---- 已發放明細 ---- -->
    <section v-if="preview" class="paid-section">
      <h3>已發放明細（獨立轉帳－{{ preview.category_label }}）</h3>
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
        description="此核算月尚未結算，或查無紀錄"
      />
      <el-table v-else v-loading="extraBonusLoading" :data="extraBonusItems" stripe style="width: 100%">
        <el-table-column prop="employee_name" label="員工" min-width="120" />
        <el-table-column label="金額" width="120">
          <template #default="{ row }">{{ formatCurrency(row.amount) }}</template>
        </el-table-column>
        <el-table-column label="歸屬年月" width="120">
          <template #default="{ row }">{{ row.period_year }} / {{ row.period_month }}</template>
        </el-table-column>
        <el-table-column prop="remark" label="備註" min-width="200" />
      </el-table>
    </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import LoadErrorState from '@/components/salary/LoadErrorState.vue'
import { useIsMobile } from '@/composables/useIsMobile'
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'
import { hasFullSalaryView, hasPermission } from '@/utils/auth'
import { formatCurrency } from '@/utils/currency'
import { friendlyError } from '@/utils/errorMessages'
import {
    getReturningBonusConfig,
    putReturningBonusConfig,
    getReturningBonusPreview,
    settleReturningBonus,
} from '@/api/returningClassBonus'
import { listExtraBonuses } from '@/api/extraBonuses'
import type { Schema } from '@/api/_generated/typed'
import {
    KIND_LABELS,
    MAX_RETURNING_BONUS_AMOUNT,
    roleLabel,
    emptyKindConfig,
    parseCheckDates,
    formatCheckDates,
    checkMonthsOf,
    pickDefaultMonth,
    validateConfig,
    defaultSelectedIds,
    selectedPayouts,
    sumAmount,
    buildSettleBody,
    formatRate,
    skipGroupsOf,
    hasLegacyOther,
    type ReturningBonusKind,
    type ReturningBonusConfig,
    type ReturningBonusSettleResult,
} from './returningClassBonus'

// 舊生註冊率獎金（3/15、9/15）與舊生預繳 100% 獎金（6/15、12/15）：設定 → 逐班推導 →
// 勾選領取人結算（寫入表外獎金，畫面稱「獨立轉帳」，per-employee 冪等）→ 已發放明細。
// 核算日與金額為 per-tenant 設定，前端不寫死任何租戶金額。

type PreviewOut = Schema<'ReturningBonusPreviewOut'>
type ExtraBonusRow = Schema<'ExtraBonusOut'>

const KINDS: ReturningBonusKind[] = ['registration', 'prepay']

const canViewFullSalary = computed(() => hasPermission('SALARY_READ') && hasFullSalaryView())
const canWrite = computed(() => canViewFullSalary.value && hasPermission('SALARY_WRITE'))
const { isMobile } = useIsMobile()

const today = new Date()
const kind = ref<ReturningBonusKind>('registration')
const baseYear = today.getFullYear()
const year = ref(baseYear)
const yearOptions = [baseYear - 1, baseYear, baseYear + 1]
// 使用者最後選的月；實際查詢用 month（不在目前類別核算月內時自動改用預設核算月，
// 避免切類別或改設定後打出 422）。
const pickedMonth = ref<number | null>(null)

// ---- 設定 ----
const configLoading = ref(false)
const configSaving = ref(false)
// 載入失敗時表單會停在「全關、金額 0」的預設值；若這時還能按儲存，會把原本的設定整個蓋掉。
const configError = ref(false)
// 已儲存的設定（核算月選單以此為準，避免未儲存的輸入讓預覽打出 422）。
const savedConfig = ref<ReturningBonusConfig>({ registration: emptyKindConfig(), prepay: emptyKindConfig() })
const configForm = reactive<ReturningBonusConfig>({ registration: emptyKindConfig(), prepay: emptyKindConfig() })
const checkDateTexts = reactive<Record<ReturningBonusKind, string>>({ registration: '', prepay: '' })

const applyConfigToForm = (cfg: ReturningBonusConfig) => {
    for (const k of KINDS) {
        configForm[k] = { ...cfg[k], check_dates: [...cfg[k].check_dates] }
        checkDateTexts[k] = formatCheckDates(cfg[k].check_dates)
    }
}

const fetchConfig = async () => {
    configLoading.value = true
    configError.value = false
    try {
        const res = await getReturningBonusConfig()
        savedConfig.value = res.data
        applyConfigToForm(res.data)
    } catch (e) {
        configError.value = true
        ElMessage.error(friendlyError('載入獎金設定失敗', e))
    } finally {
        configLoading.value = false
    }
}

const buildConfigBody = (): ReturningBonusConfig => ({
    registration: { ...configForm.registration, check_dates: parseCheckDates(checkDateTexts.registration) },
    prepay: { ...configForm.prepay, check_dates: parseCheckDates(checkDateTexts.prepay) },
})
const sameKindConfig = (a: ReturningBonusConfig[ReturningBonusKind], b: ReturningBonusConfig[ReturningBonusKind]) =>
    a.enabled === b.enabled &&
    a.head_amount === b.head_amount &&
    a.assistant_amount === b.assistant_amount &&
    a.check_dates.join(',') === b.check_dates.join(',')
// 表單與已儲存設定不同＝有未儲存的變更（核算日先正規化再比，'3-15' 與 '03-15' 視為相同）
const configDirty = computed(() => {
    if (configError.value) return false
    const body = buildConfigBody()
    return KINDS.some((k) => !sameKindConfig(body[k], savedConfig.value[k]))
})
useUnsavedChangesGuard(() => canWrite.value && configDirty.value)

const saveConfig = async () => {
    if (configError.value || configLoading.value) {
        ElMessage.warning('獎金設定尚未載入成功，請先重新載入再儲存')
        return
    }
    if (configSaving.value) return
    const body = buildConfigBody()
    const errors = validateConfig(body)
    if (errors.length > 0) {
        ElMessage.warning(errors.join('；'))
        return
    }
    configSaving.value = true
    try {
        const res = await putReturningBonusConfig(body)
        savedConfig.value = res.data
        applyConfigToForm(res.data)
        ElMessage.success('已儲存獎金設定')
        // 啟用與否、金額變更不影響核算月，watcher 不會觸發，這裡主動重抓。
        await fetchPreview()
    } catch (e) {
        ElMessage.error(friendlyError('儲存獎金設定失敗', e))
    } finally {
        configSaving.value = false
    }
}

const checkMonths = computed(() => checkMonthsOf(savedConfig.value[kind.value]))
const month = computed<number | null>({
    get: () =>
        pickedMonth.value != null && checkMonths.value.includes(pickedMonth.value)
            ? pickedMonth.value
            : pickDefaultMonth(checkMonths.value, today.getMonth() + 1),
    set: (v) => {
        pickedMonth.value = v
    },
})

// ---- 預覽 ----
const preview = ref<PreviewOut | null>(null)
const previewLoading = ref(false)
const previewError = ref(false)
const selectedIds = ref<number[]>([])
const settleResult = ref<ReturningBonusSettleResult | null>(null)

let previewSeq = 0
const fetchPreview = async () => {
    if (!canViewFullSalary.value) return
    const m = month.value
    if (m == null) {
        preview.value = null
        selectedIds.value = []
        previewError.value = false
        return
    }
    const seq = ++previewSeq
    previewLoading.value = true
    previewError.value = false
    try {
        const res = await getReturningBonusPreview({ kind: kind.value, year: year.value, month: m })
        if (seq !== previewSeq) return
        preview.value = res.data
        selectedIds.value = defaultSelectedIds(res.data.payouts)
        fetchSettledPayments()
    } catch (e) {
        if (seq !== previewSeq) return
        preview.value = null
        selectedIds.value = []
        previewError.value = true
        ElMessage.error(friendlyError('載入逐班推導失敗', e))
    } finally {
        if (seq === previewSeq) previewLoading.value = false
    }
}

const classTableData = computed(() =>
    (preview.value?.classes ?? []).map((c) => ({ ...c, rateLabel: formatRate(c.rate) })),
)

const toggleSelected = (employeeId: number, checked: boolean) => {
    const rest = selectedIds.value.filter((id) => id !== employeeId)
    selectedIds.value = checked ? [...rest, employeeId] : rest
}

const selectedRows = computed(() => selectedPayouts(preview.value?.payouts ?? [], selectedIds.value))
const selectedTotal = computed(() => sumAmount(selectedRows.value))
const settleDisabled = computed(
    () =>
        !preview.value ||
        !preview.value.enabled ||
        selectedRows.value.length === 0 ||
        previewLoading.value ||
        previewError.value,
)

// ---- 結算 ----
const settling = ref(false)
const settleSkipGroups = computed(() => (settleResult.value ? skipGroupsOf(settleResult.value) : []))

const doSettle = async () => {
    const p = preview.value
    if (!p || !p.enabled || month.value == null) return
    if (selectedRows.value.length === 0) {
        ElMessage.warning('請至少勾選一位領取人')
        return
    }
    const legacySelected = selectedRows.value.filter(hasLegacyOther)
    const legacyNote =
        legacySelected.length > 0
            ? `（本次勾選含 ${legacySelected.length} 位同月已手登：${legacySelected.map((r) => r.employee_name).join('、')}）`
            : ''
    try {
        await ElMessageBox.confirm(
            `即將結算 ${year.value} 年 ${month.value} 月${p.category_label}：發給 ${selectedRows.value.length} 位共 ${formatCurrency(selectedTotal.value)}，以獨立轉帳發放（計入補充保費累計、不進應發薪資）。本類別已發放過的員工會自動跳過；但改版前以「其他」類別手登的紀錄系統無法判斷是否同一筆，勾選了標示「同月已手登」的員工就會再發一次。${legacyNote}確定結算？`,
            '確認結算',
            { confirmButtonText: '確定結算', cancelButtonText: '取消', type: 'warning' },
        )
    } catch {
        return
    }
    settling.value = true
    try {
        const body = buildSettleBody(kind.value, year.value, month.value, p.payouts, selectedIds.value)
        const res = await settleReturningBonus(body)
        settleResult.value = res.data
        ElMessage.success(`結算完成：發放 ${res.data.created.length} 位，共 ${formatCurrency(res.data.total_amount)}`)
        await fetchPreview()
    } catch (e) {
        ElMessage.error(friendlyError('結算失敗', e))
    } finally {
        settling.value = false
    }
}

// ---- 已發放明細（表外獎金，category 由預覽回傳） ----
const extraBonusItems = ref<ExtraBonusRow[]>([])
const extraBonusLoading = ref(false)
// 失敗時不能顯示「查無已發放明細」，否則會被誤讀成「還沒發」
const extraBonusError = ref(false)
let extraBonusSeq = 0
const fetchSettledPayments = async () => {
    const p = preview.value
    if (!p) return
    const [y, m] = p.check_date.split('-').map(Number)
    if (!y || !m) return
    const seq = ++extraBonusSeq
    extraBonusLoading.value = true
    extraBonusError.value = false
    try {
        const res = await listExtraBonuses({ year: y, month: m, category: p.category })
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

// 設定載入後 month 由 null 變成核算月，也走這條觸發首次預覽。
watch([kind, year, month], () => {
    settleResult.value = null
    extraBonusItems.value = []
    extraBonusError.value = false
    fetchPreview()
})

onMounted(() => {
    if (!canViewFullSalary.value) return
    fetchConfig()
})
</script>

<style scoped>
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2);
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
.dirty-hint {
  color: var(--el-color-warning);
  font-size: 13px;
}
.scroll-hint {
  display: none;
  margin: 0 0 var(--space-2);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
@media (--to-sm) {
  .section-actions {
    width: 100%;
  }
  .scroll-hint {
    display: block;
  }
}
.config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-3);
}
.config-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.block-alert {
  margin-bottom: var(--space-2);
}
.class-payout {
  line-height: 1.8;
}
.settle-result {
  margin-top: var(--space-3);
}
.settle-result > .el-alert:first-child {
  margin-bottom: var(--space-2);
}
.paid-section {
  margin-top: var(--space-5);
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
