<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getFinanceSummaryDetail } from '@/api/reports'
import { apiError } from '@/utils/error'
import { money } from '@/utils/format'
// 雜項收款 6 類（rent/donation/subsidy/secondhand_sale/refund_recovery/other）中文
// 標籤沿用收支簽收頁的共用常數，避免同一 enum 兩處映射漂移。
import { categoryLabel as miscCategoryLabel } from '@/constants/signoff'

const props = withDefaults(defineProps<{
  modelValue: boolean
  year: number
  month?: number | null
}>(), {
  month: null,
})
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const loading = ref(false)
const data = ref<{ tuition?: unknown[]; activity?: unknown[]; misc_receipt?: unknown[]; salary?: unknown[]; vendor_payment?: unknown[]; fixed_cost?: unknown[] } | null>(null)
const activeTab = ref('tuition')

const load = async () => {
  if (!props.year || !props.month) return
  loading.value = true
  try {
    const res = await getFinanceSummaryDetail(props.year, props.month)
    data.value = res.data
  } catch (e) {
    ElMessage.error(apiError(e, '載入明細失敗'))
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.modelValue, props.year, props.month],
  ([open]) => {
    if (open) load()
  },
)

const tuitionRows = computed(() => data.value?.tuition || [])
const activityRows = computed(() => data.value?.activity || [])
// 雜項收款明細（get_misc_receipt_detail：date/payer_name/category/amount/
// payment_method/description/receipt_number/status），2026-07-06 補齊下鑽完整性
// ——收入側原本只有學費/才藝兩 tab，misc_receipt 已計入總收入卻無法下鑽。
const miscRows = computed(() => data.value?.misc_receipt || [])
const salaryRows = computed(() => data.value?.salary || [])
const vendorRows = computed(() => data.value?.vendor_payment || [])
const fixedCostRows = computed(() => data.value?.fixed_cost || [])

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'
const kindLabel = (k: string) => (k === 'payment' ? '繳費' : k === 'refund' ? '退款' : k)
const kindTag = (k: string): ElTagType => (k === 'payment' ? 'success' : 'warning')

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: '現金',
  bank_transfer: '銀行匯款',
  check: '支票',
  linepay: 'LINE Pay',
  other: '其他',
}
const methodLabel = (m: string) => PAYMENT_METHOD_LABEL[m] || m

// 8 類固定支出（比照後端 MonthlyFixedCost.category enum；2026-07-05 收支彙總
// 納入固定支出後，下鑽明細同步補上，見 build_finance_detail 的 fixed_cost 欄）
const FIXED_COST_CATEGORY_LABEL: Record<string, string> = {
  rent: '租金',
  water: '水費',
  electricity: '電費',
  phone: '電話費',
  office_petty_cash: '辦公室零用金',
  kitchen_petty_cash: '廚房零用金',
  meals: '餐點',
  old_pension_reserve: '舊制勞退準備金',
}
const fixedCostCategoryLabel = (c: string) => FIXED_COST_CATEGORY_LABEL[c] || c
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="`${year} 年 ${month} 月 收支明細`"
    width="960px"
    append-to-body
  >
    <el-tabs v-model="activeTab" v-loading="loading">
      <el-tab-pane :label="`學費 (${tuitionRows.length})`" name="tuition">
        <el-table :data="tuitionRows" border stripe max-height="480" size="small" empty-text="無資料">
          <el-table-column label="類型" width="80">
            <template #default="{ row }">
              <el-tag :type="kindTag(row.kind)">{{ kindLabel(row.kind) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="date" label="日期" width="110" />
          <el-table-column prop="student_name" label="學生" width="110" />
          <el-table-column prop="classroom_name" label="班級" width="90" />
          <el-table-column prop="fee_item_name" label="費用項目" min-width="120" />
          <el-table-column label="金額" width="110" align="right">
            <template #default="{ row }">{{ money(row.amount) }}</template>
          </el-table-column>
          <el-table-column prop="payment_method" label="付款方式" width="100" />
          <el-table-column prop="reason" label="備註" min-width="120" />
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="`才藝 (${activityRows.length})`" name="activity">
        <el-table :data="activityRows" border stripe max-height="480" size="small" empty-text="無資料">
          <el-table-column label="類型" width="80">
            <template #default="{ row }">
              <el-tag :type="kindTag(row.kind)">{{ kindLabel(row.kind) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="date" label="日期" width="110" />
          <el-table-column prop="student_name" label="學生" min-width="110" />
          <el-table-column label="金額" width="110" align="right">
            <template #default="{ row }">{{ money(row.amount) }}</template>
          </el-table-column>
          <el-table-column prop="payment_method" label="付款方式" width="100" />
          <el-table-column prop="operator" label="操作人" width="100" />
          <el-table-column prop="receipt_no" label="收據號" width="120" />
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="`雜項收款 (${miscRows.length})`" name="misc_receipt">
        <el-table :data="miscRows" border stripe max-height="480" size="small" empty-text="無資料">
          <el-table-column prop="date" label="日期" width="110" />
          <el-table-column prop="payer_name" label="繳款人" min-width="110" />
          <el-table-column label="類別" width="110">
            <template #default="{ row }">{{ miscCategoryLabel(row.category) }}</template>
          </el-table-column>
          <el-table-column label="金額" width="110" align="right">
            <template #default="{ row }">{{ money(row.amount) }}</template>
          </el-table-column>
          <el-table-column label="收付方式" width="110">
            <template #default="{ row }">{{ methodLabel(row.payment_method) }}</template>
          </el-table-column>
          <el-table-column prop="description" label="說明" min-width="140" />
          <el-table-column prop="receipt_number" label="收據號" width="120" />
          <el-table-column label="狀態" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status === 'signed' ? 'success' : 'warning'" size="small">
                {{ row.status === 'signed' ? '已簽收' : '待簽收' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="`薪資 (${salaryRows.length})`" name="salary">
        <el-table :data="salaryRows" border stripe max-height="480" size="small" empty-text="無資料">
          <el-table-column prop="employee_name" label="員工" width="120" fixed />
          <el-table-column label="應發" width="110" align="right">
            <template #default="{ row }">{{ money(row.gross_salary) }}</template>
          </el-table-column>
          <el-table-column label="實發" width="110" align="right">
            <template #default="{ row }">{{ money(row.net_salary) }}</template>
          </el-table-column>
          <el-table-column label="雇主保費+勞退" width="140" align="right">
            <template #default="{ row }">{{ money(row.employer_benefit) }}</template>
          </el-table-column>
          <el-table-column label="園方真實支出" width="140" align="right">
            <template #default="{ row }">
              <strong>{{ money(row.real_cost) }}</strong>
            </template>
          </el-table-column>
          <el-table-column label="封存" width="80" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.is_finalized" size="small" type="info">已封存</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="`廠商付款 (${vendorRows.length})`" name="vendor">
        <el-table :data="vendorRows" border stripe max-height="480" size="small" empty-text="無資料">
          <el-table-column prop="date" label="日期" width="110" />
          <el-table-column prop="vendor_name" label="廠商" min-width="140" />
          <el-table-column label="金額" width="110" align="right">
            <template #default="{ row }">{{ money(row.amount) }}</template>
          </el-table-column>
          <el-table-column label="收付方式" width="110">
            <template #default="{ row }">{{ methodLabel(row.payment_method) }}</template>
          </el-table-column>
          <el-table-column prop="description" label="項目/說明" min-width="140" />
          <el-table-column prop="invoice_number" label="發票號" width="120" />
          <el-table-column label="狀態" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status === 'signed' ? 'success' : 'warning'" size="small">
                {{ row.status === 'signed' ? '已簽收' : '待簽收' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="`固定支出 (${fixedCostRows.length})`" name="fixed_cost">
        <el-table :data="fixedCostRows" border stripe max-height="480" size="small" empty-text="無資料">
          <el-table-column label="年/月" width="100">
            <template #default="{ row }">{{ row.year }} / {{ row.month }}</template>
          </el-table-column>
          <el-table-column label="類別" width="140">
            <template #default="{ row }">{{ fixedCostCategoryLabel(row.category) }}</template>
          </el-table-column>
          <el-table-column label="金額" width="110" align="right">
            <template #default="{ row }">{{ money(row.amount) }}</template>
          </el-table-column>
          <el-table-column prop="notes" label="備註" min-width="140" />
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>
