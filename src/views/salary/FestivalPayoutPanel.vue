<script setup lang="ts">
// 節慶發放開關（義華 Q10／Q12／Q14）與「節慶未扣餘額」帳。
// 讀開關：GET /salaries/festival-carry/settings（SALARY_READ）；
// 寫開關：PUT /system-configs/{key}（SETTINGS_WRITE）——兩者權限不同，分開 gate。
// 未扣餘額：全員薪資視野（hasFullSalaryView）才看得到；人工登記另需 SALARY_WRITE。
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { hasFullSalaryView, hasPermission } from '@/utils/auth'
import { friendlyError } from '@/utils/errorMessages'
import { formatCurrency } from '@/utils/currency'
import FormDialog from '@/components/common/FormDialog.vue'
import {
  FESTIVAL_CONFIG_KEYS,
  createFestivalCarryManualEntry,
  getFestivalCarryEmployee,
  listFestivalCarryBalances,
  updateFestivalConfig,
  type FestivalConfigKey,
} from '@/api/festivalCarry'
import type { ApiBody, Schema } from '@/api/_generated/typed'
import { useFestivalPayoutSettings } from '@/composables/useFestivalPayoutSettings'
import { festivalPayoutMonthsText } from './festivalCoverage'
import {
  MANUAL_ENTRY_TYPE_OPTIONS,
  isValidYearMonth,
  signedAmountLabel,
  toBoolConfigValue,
  validateManualEntry,
  type ManualEntryDraft,
} from './festivalCarry'

type CarryBalance = Schema<'CarryBalanceOut'>
type CarryEmployeeDetail = Schema<'CarryEmployeeDetailOut'>
type ManualEntryBody = ApiBody<'/salaries/festival-carry/manual-entries', 'post'>

const RECALC_HINT = '改完需重算未封存的發放月薪資，才會套用新口徑。'

const canReadSalary = computed(() => hasPermission('SALARY_READ'))
const canEditSettings = computed(() => hasPermission('SETTINGS_WRITE'))
const canViewCarry = computed(() => canReadSalary.value && hasFullSalaryView())
const canWriteCarry = computed(() => canViewCarry.value && hasPermission('SALARY_WRITE'))

// ── 開關 ──────────────────────────────────────────────────────────────
const { settings, loading: settingsLoading, load: loadSettings } = useFestivalPayoutSettings()
const savingKey = ref<FestivalConfigKey | null>(null)
const earlyFromDraft = ref<string>('')

const thisYear = new Date().getFullYear()
const payoutMonthsPreview = computed(() => {
  const ym = settings.value?.early_payout_from_ym ?? null
  return [thisYear, thisYear + 1].map((y) => `${y} 年：${festivalPayoutMonthsText(y, ym)}`).join('；')
})

const refreshSettings = async () => {
  await loadSettings()
  earlyFromDraft.value = settings.value?.early_payout_from_ym ?? ''
}

const writeConfig = async (key: FestivalConfigKey, value: string, label: string): Promise<boolean> => {
  savingKey.value = key
  try {
    await updateFestivalConfig(key, value)
    ElMessage.success(`已更新「${label}」。${RECALC_HINT}`)
    await refreshSettings()
    return true
  } catch (e) {
    ElMessage.error(friendlyError(`儲存「${label}」失敗`, e))
    return false
  } finally {
    savingKey.value = null
  }
}

const confirmChange = async (message: string): Promise<boolean> => {
  try {
    await ElMessageBox.confirm(`${message}\n\n${RECALC_HINT}`, '變更節慶發放設定', {
      confirmButtonText: '確定變更',
      cancelButtonText: '取消',
      type: 'warning',
    })
    return true
  } catch {
    return false
  }
}

const saveEarlyPayout = async () => {
  const value = earlyFromDraft.value
  if (!isValidYearMonth(value)) {
    ElMessage.warning('請選擇生效年月（YYYY-MM）')
    return
  }
  if (!(await confirmChange(`節慶獎金將自 ${value} 起，改隨前月薪資發放（1／5／8／11 月）。`))) return
  await writeConfig(FESTIVAL_CONFIG_KEYS.earlyPayoutFromYm, value, '節慶隨前月薪資發放生效年月')
}

const makeBeforeChange = (key: FestivalConfigKey, label: string, current: () => boolean) => async () => {
  const next = !current()
  if (!(await confirmChange(`「${label}」將${next ? '開啟' : '關閉'}。`))) return false
  return writeConfig(key, toBoolConfigValue(next), label)
}

const julyMergeBeforeChange = makeBeforeChange(
  FESTIVAL_CONFIG_KEYS.julyLeaverMerge,
  '7/31 離職者 7 月合併發放 6、7 月節慶',
  () => settings.value?.july_leaver_merge_enabled ?? false,
)
const carryoverBeforeChange = makeBeforeChange(
  FESTIVAL_CONFIG_KEYS.deductionCarryover,
  '懲處／會議扣款不足額結轉',
  () => settings.value?.deduction_carryover_enabled ?? false,
)

// ── 未扣餘額 ──────────────────────────────────────────────────────────
const balances = ref<CarryBalance[]>([])
const totalBalance = ref(0)
const balancesLoading = ref(false)

const fetchBalances = async () => {
  if (!canViewCarry.value) return
  balancesLoading.value = true
  try {
    const res = await listFestivalCarryBalances()
    balances.value = res.data.items
    totalBalance.value = res.data.total_balance
  } catch (e) {
    ElMessage.error(friendlyError('載入節慶未扣餘額失敗', e))
  } finally {
    balancesLoading.value = false
  }
}

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<CarryEmployeeDetail | null>(null)

const openDetail = async (employeeId: number) => {
  detailVisible.value = true
  detailLoading.value = true
  detail.value = null
  try {
    const res = await getFestivalCarryEmployee(employeeId)
    detail.value = res.data
  } catch (e) {
    ElMessage.error(friendlyError('載入未扣餘額明細失敗', e))
  } finally {
    detailLoading.value = false
  }
}

// ── 人工登記 ──────────────────────────────────────────────────────────
const entryDialogVisible = ref(false)
const entrySubmitting = ref(false)
const entryTarget = ref<CarryBalance | null>(null)
const entryYm = ref('')
const entryForm = reactive<ManualEntryDraft>({
  entry_type: 'offset_other_bonus',
  amount: null,
  salary_year: null,
  salary_month: null,
  note: '',
})
const entryTypeHint = computed(
  () => MANUAL_ENTRY_TYPE_OPTIONS.find((o) => o.value === entryForm.entry_type)?.hint ?? '',
)

const openEntryDialog = (row: CarryBalance) => {
  entryTarget.value = row
  const now = new Date()
  entryYm.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  Object.assign(entryForm, {
    entry_type: 'offset_other_bonus',
    amount: row.balance,
    salary_year: null,
    salary_month: null,
    note: '',
  })
  entryDialogVisible.value = true
}

const submitEntry = async () => {
  const target = entryTarget.value
  if (!target) return
  const [y, m] = entryYm.value ? entryYm.value.split('-').map(Number) : [null, null]
  entryForm.salary_year = y ?? null
  entryForm.salary_month = m ?? null
  const err = validateManualEntry(entryForm, target.balance)
  if (err) {
    ElMessage.warning(err)
    return
  }
  const body: ManualEntryBody = {
    employee_id: target.employee_id,
    salary_year: entryForm.salary_year as number,
    salary_month: entryForm.salary_month as number,
    entry_type: entryForm.entry_type as ManualEntryBody['entry_type'],
    amount: entryForm.amount as number,
    note: entryForm.note.trim(),
  }
  entrySubmitting.value = true
  try {
    await createFestivalCarryManualEntry(body)
    ElMessage.success(`已登記 ${target.employee_name} ${formatCurrency(body.amount)}`)
    entryDialogVisible.value = false
    await fetchBalances()
    if (detailVisible.value && detail.value?.employee_id === target.employee_id) {
      await openDetail(target.employee_id)
    }
  } catch (e) {
    ElMessage.error(friendlyError('人工登記失敗', e))
  } finally {
    entrySubmitting.value = false
  }
}

onMounted(() => {
  if (!canReadSalary.value) return
  refreshSettings()
  fetchBalances()
})
</script>

<template>
  <div class="festival-payout-panel">
    <el-alert
      v-if="!canReadSalary"
      type="warning"
      :closable="false"
      show-icon
      title="目前帳號沒有查看薪資的權限（SALARY_READ）"
    />
    <template v-else>
      <el-card v-loading="settingsLoading" shadow="never" class="mb-4" data-testid="festival-payout-settings">
        <template #header>
          <div>
            <h3 class="card-title">節慶發放設定</h3>
            <span class="hint">每個園所各自設定；{{ RECALC_HINT }}</span>
          </div>
        </template>

        <el-form label-position="top">
          <el-form-item label="節慶隨前月薪資發放（1/5/8/11 月）生效年月">
            <div class="early-row">
              <el-date-picker
                v-model="earlyFromDraft"
                type="month"
                value-format="YYYY-MM"
                placeholder="未設定＝標準 2/6/9/12 月發放"
                :disabled="!canEditSettings"
                style="width: 220px"
              />
              <el-button
                v-if="canEditSettings"
                type="primary"
                :loading="savingKey === FESTIVAL_CONFIG_KEYS.earlyPayoutFromYm"
                :disabled="!earlyFromDraft || earlyFromDraft === (settings?.early_payout_from_ym ?? '')"
                @click="saveEarlyPayout"
              >儲存</el-button>
            </div>
            <div class="hint">
              最後一個期間月 ≥ 生效月的批次改隨該月薪資發放（12–1 月→1 月、2–5 月→5 月、6–8 月→8 月、9–11 月→11 月），
              以批次判定，每批恰好發一次。目前發放月：{{ payoutMonthsPreview }}。
              設定後無法在此清除（後端只接受 YYYY-MM），如需改回標準發放月請聯絡系統管理員。
            </div>
          </el-form-item>

          <el-form-item label="7/31 離職者 7 月合併發放 6、7 月節慶">
            <el-switch
              :model-value="settings?.july_leaver_merge_enabled ?? false"
              :disabled="!canEditSettings || !settings"
              :loading="savingKey === FESTIVAL_CONFIG_KEYS.julyLeaverMerge"
              :before-change="julyMergeBeforeChange"
              aria-label="7/31 離職者 7 月合併發放"
            />
            <div class="hint">開啟後，離職日為 7/31（含預告離職）的人在 7 月薪資一次發 6、7 月節慶，並扣該窗內的會議缺席與懲處。</div>
          </el-form-item>

          <el-form-item label="懲處／會議扣款不足額結轉">
            <el-switch
              :model-value="settings?.deduction_carryover_enabled ?? false"
              :disabled="!canEditSettings || !settings"
              :loading="savingKey === FESTIVAL_CONFIG_KEYS.deductionCarryover"
              :before-change="carryoverBeforeChange"
              aria-label="懲處與會議扣款不足額結轉"
            />
            <div class="hint">開啟後，發放月的節慶獎金扣不完的懲處與會議缺席扣款會記入「未扣餘額」，下個發放月繼續扣（只從獎金扣，不進應扣合計）。</div>
          </el-form-item>
        </el-form>

        <el-alert
          v-if="!canEditSettings"
          type="info"
          :closable="false"
          show-icon
          title="目前帳號無系統設定編輯權限（SETTINGS_WRITE），僅能檢視。"
        />
      </el-card>

      <el-card v-if="canViewCarry" shadow="never" data-testid="festival-carry-balances">
        <template #header>
          <div class="balance-header">
            <div>
              <h3 class="card-title">節慶未扣餘額</h3>
              <span class="hint">懲處與會議缺席扣款超過當期節慶獎金時結轉的差額；合計 {{ formatCurrency(totalBalance) }}</span>
            </div>
            <el-button :loading="balancesLoading" @click="fetchBalances">重新整理</el-button>
          </div>
        </template>

        <el-table v-loading="balancesLoading" :data="balances" stripe style="width: 100%" empty-text="目前沒有未扣餘額">
          <el-table-column prop="employee_name" label="員工" min-width="140" />
          <el-table-column label="未扣餘額" width="140" align="right">
            <template #default="{ row }">{{ formatCurrency(row.balance) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button link size="small" @click="openDetail(row.employee_id)">明細</el-button>
              <el-button v-if="canWriteCarry" link size="small" type="primary" @click="openEntryDialog(row)">人工登記</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>

    <el-drawer v-model="detailVisible" :title="detail ? `${detail.employee_name} 未扣餘額明細` : '未扣餘額明細'" size="640px">
      <div v-loading="detailLoading">
        <template v-if="detail">
          <p class="detail-balance">目前餘額：<strong>{{ formatCurrency(detail.balance) }}</strong></p>
          <el-table :data="detail.entries" stripe size="small" empty-text="沒有異動紀錄">
            <el-table-column label="薪資年月" width="100">
              <template #default="{ row }">{{ row.salary_year }}/{{ row.salary_month }}</template>
            </el-table-column>
            <el-table-column prop="entry_type_label" label="類型" min-width="120" />
            <el-table-column label="金額" width="100" align="right">
              <template #default="{ row }">{{ signedAmountLabel(row.amount) }}</template>
            </el-table-column>
            <el-table-column prop="note" label="備註" min-width="160" />
            <el-table-column prop="created_by" label="登記者" width="100" />
          </el-table>
        </template>
      </div>
    </el-drawer>

    <FormDialog
      v-model="entryDialogVisible"
      title="未扣餘額人工登記"
      size="compact"
      submit-text="登記"
      :loading="entrySubmitting"
      :enter-submit="false"
      @submit="submitEntry"
    >
      <template v-if="entryTarget">
        <p class="hint">{{ entryTarget.employee_name }}，目前餘額 {{ formatCurrency(entryTarget.balance) }}</p>
        <el-form label-position="top" @submit.prevent>
          <el-form-item label="登記類型">
            <el-radio-group v-model="entryForm.entry_type">
              <el-radio v-for="o in MANUAL_ENTRY_TYPE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</el-radio>
            </el-radio-group>
            <div class="hint">{{ entryTypeHint }}</div>
          </el-form-item>
          <el-form-item label="金額">
            <el-input-number
              v-model="entryForm.amount"
              :min="1"
              :max="entryTarget.balance"
              :step="100"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="歸屬薪資年月">
            <el-date-picker v-model="entryYm" type="month" value-format="YYYY-MM" style="width: 100%" />
          </el-form-item>
          <el-form-item label="備註">
            <el-input v-model="entryForm.note" type="textarea" :rows="2" placeholder="例：已於 116 年 8 月自主成長獎勵金扣抵" />
          </el-form-item>
        </el-form>
      </template>
    </FormDialog>
  </div>
</template>

<style scoped>
.mb-4 {
  margin-bottom: var(--space-4);
}
.card-title {
  margin: 0 0 4px;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  display: block;
  line-height: 1.5;
}
.early-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2, 8px);
  align-items: center;
}
.balance-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4);
}
.detail-balance {
  margin: 0 0 var(--space-3, 12px);
}
</style>
