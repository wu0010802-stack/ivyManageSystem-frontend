<script setup lang="ts">
/**
 * 收支下鑽明細抽屜（取代 960px 彈窗，2026-10-12 改版）：表格留在左邊看得到，
 * 頂部先給該月收入／退款／支出與分類小計，分類籤只列有資料的，可搜尋，付款方式一律中文。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { getFinanceSummaryDetail, financeSummaryExportUrl } from '@/api/reports'
import { apiError } from '@/utils/error'
import { downloadFile } from '@/utils/download'
import { categoryLabel as miscCategoryLabel } from '@/constants/signoff'
import { evidenceStatusLabel } from '@/utils/financeSignoff'
import { formatAmount, methodLabel } from './reportFormat'
import {
  CATEGORY_META, CATEGORY_ORDER, initialCategory, matchesSearch, methodBreakdown, splitDetail, subtotal,
  type DetailCategory, type DetailGroup, type DetailRow, type FinanceDetail,
} from './financeDetail'

const props = withDefaults(defineProps<{
  modelValue: boolean
  year: number
  month: number | null
  initialGroup?: DetailGroup
  /** 該月收入／退款／支出（與每月明細表同一來源，保證抽屜頂部數字和表格一致） */
  totals?: { revenue: number; refund: number; expense: number } | null
}>(), { initialGroup: 'revenue', totals: null })
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const loading = ref(false)
const errorText = ref('')
const raw = ref<FinanceDetail | null>(null)
const active = ref<DetailCategory | null>(null)
const query = ref('')
let seq = 0

async function load() {
  if (!props.month) return
  const my = ++seq
  loading.value = true
  errorText.value = ''
  raw.value = null
  active.value = null
  query.value = ''
  try {
    const res = await getFinanceSummaryDetail(props.year, props.month)
    if (my !== seq) return
    raw.value = res.data
    active.value = initialCategory(splitDetail(res.data), props.initialGroup)
  } catch (e) {
    if (my === seq) errorText.value = apiError(e, '載入明細失敗')
  } finally {
    if (my === seq) loading.value = false
  }
}
watch(() => [props.modelValue, props.year, props.month, props.initialGroup] as const, ([isOpen]) => {
  if (isOpen) load()
})

const split = computed(() => splitDetail(raw.value))
const chips = computed(() => CATEGORY_ORDER
  .filter(c => split.value[c].length > 0)
  .map(c => ({ key: c, label: CATEGORY_META[c].label, count: split.value[c].length })))
const activeRows = computed<DetailRow[]>(() => (active.value ? split.value[active.value] : []))
const visibleRows = computed(() => activeRows.value.filter(r => matchesSearch(r, query.value)))
const activeSubtotal = computed(() => (active.value ? subtotal(active.value, activeRows.value) : null))
const activeMethods = computed(() => methodBreakdown(activeRows.value))

const FIXED_COST_LABEL: Record<string, string> = {
  rent: '租金', water: '水費', electricity: '電費', phone: '電話費',
  office_petty_cash: '辦公室零用金', kitchen_petty_cash: '廚房零用金', meals: '餐點', old_pension_reserve: '舊制勞退準備金',
}
const amt = (v: unknown) => (typeof v === 'number' ? formatAmount(v) : '不公開')

const exporting = ref(false)
async function exportMonth() {
  if (!props.month) return
  exporting.value = true
  try {
    await downloadFile(
      financeSummaryExportUrl(props.year, props.month),
      `收支彙總_${props.year}-${String(props.month).padStart(2, '0')}.xlsx`,
    )
  } catch (e) {
    ElMessage.error(apiError(e, '匯出失敗'))
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <el-drawer
    v-model="open"
    :title="`${year} 年 ${month} 月收支明細`"
    size="min(620px, 100vw)"
    append-to-body
    class="fd"
    data-test="finance-detail-drawer"
  >
    <div v-if="totals" class="fd__sum">
      <div><small>收入</small><b>{{ formatAmount(totals.revenue) }}</b></div>
      <div><small>退款</small><b>{{ formatAmount(totals.refund) }}</b></div>
      <div><small>支出</small><b>{{ formatAmount(totals.expense) }}</b></div>
    </div>

    <div v-if="loading" class="fd__state"><el-skeleton :rows="6" animated /></div>
    <el-empty v-else-if="errorText" :description="errorText" :image-size="60">
      <el-button @click="load">重新載入</el-button>
    </el-empty>
    <el-empty v-else-if="!chips.length" description="這個月沒有任何交易紀錄" :image-size="60" />
    <template v-else>
      <div class="fd__chips" role="tablist" aria-label="分類">
        <button
          v-for="c in chips" :key="c.key" type="button" role="tab"
          class="chip" :class="{ 'is-on': c.key === active }"
          :aria-selected="c.key === active"
          :data-test="`chip-${c.key}`"
          @click="active = c.key; query = ''"
        >{{ c.label }} {{ c.count }}</button>
      </div>
      <el-input v-model="query" class="fd__search" clearable placeholder="搜尋姓名、班級、廠商或說明" data-test="detail-search" />
      <p v-if="active && activeSubtotal" class="fd__subtotal" data-test="detail-subtotal">
        {{ CATEGORY_META[active].label }} · {{ activeRows.length }} 筆 · 合計 {{ formatAmount(activeSubtotal.total) }}
        <template v-if="activeSubtotal.masked">（部分金額不公開）</template>
        <template v-if="activeMethods.length > 1"> · {{ activeMethods.map(m => `${m.label} ${formatAmount(m.amount)}`).join(' · ') }}</template>
      </p>

      <el-table :data="visibleRows" size="small" stripe empty-text="沒有符合的紀錄" max-height="560" data-test="detail-table">
        <template v-if="active === 'tuition'">
          <el-table-column prop="date" label="日期" width="100" />
          <el-table-column prop="student_name" label="學生" min-width="90" />
          <el-table-column prop="classroom_name" label="班級" width="90" />
          <el-table-column prop="fee_item_name" label="項目" min-width="120" show-overflow-tooltip />
          <el-table-column label="金額" width="96" align="right" class-name="num-cell">
            <template #default="{ row }">{{ amt(row.amount) }}</template>
          </el-table-column>
          <el-table-column label="方式" width="72"><template #default="{ row }">{{ methodLabel(row.payment_method) }}</template></el-table-column>
        </template>
        <template v-else-if="active === 'activity'">
          <el-table-column prop="date" label="日期" width="100" />
          <el-table-column prop="student_name" label="學生" min-width="100" />
          <el-table-column label="金額" width="96" align="right" class-name="num-cell"><template #default="{ row }">{{ amt(row.amount) }}</template></el-table-column>
          <el-table-column label="方式" width="72"><template #default="{ row }">{{ methodLabel(row.payment_method) }}</template></el-table-column>
          <el-table-column prop="receipt_no" label="收據號" min-width="100" />
        </template>
        <template v-else-if="active === 'misc_receipt'">
          <el-table-column prop="date" label="日期" width="100" />
          <el-table-column prop="payer_name" label="繳款人" min-width="100" />
          <el-table-column label="類別" width="96"><template #default="{ row }">{{ miscCategoryLabel(row.category) }}</template></el-table-column>
          <el-table-column label="金額" width="96" align="right" class-name="num-cell"><template #default="{ row }">{{ amt(row.amount) }}</template></el-table-column>
          <el-table-column label="憑證" width="80"><template #default="{ row }">{{ evidenceStatusLabel(String(row.status)) }}</template></el-table-column>
        </template>
        <template v-else-if="active === 'refund'">
          <!-- 後端退款列沒有學生姓名（只有原因與經辦），不放空欄 -->
          <el-table-column prop="date" label="日期" width="100" />
          <el-table-column prop="source" label="來源" width="64" />
          <el-table-column label="金額" width="96" align="right" class-name="num-cell"><template #default="{ row }">{{ amt(row.amount) }}</template></el-table-column>
          <el-table-column prop="reason" label="原因" min-width="140" show-overflow-tooltip />
          <el-table-column prop="refunded_by" label="經辦" width="90" />
        </template>
        <template v-else-if="active === 'salary'">
          <el-table-column prop="employee_name" label="員工" min-width="90" />
          <el-table-column label="應發" width="92" align="right" class-name="num-cell"><template #default="{ row }">{{ amt(row.gross_salary) }}</template></el-table-column>
          <el-table-column label="雇主負擔" width="92" align="right" class-name="num-cell"><template #default="{ row }">{{ amt(row.employer_benefit) }}</template></el-table-column>
          <el-table-column label="人事成本" width="96" align="right" class-name="num-cell"><template #default="{ row }"><b>{{ amt(row.real_cost) }}</b></template></el-table-column>
        </template>
        <template v-else-if="active === 'vendor_payment'">
          <el-table-column prop="date" label="日期" width="100" />
          <el-table-column prop="vendor_name" label="廠商" min-width="100" />
          <el-table-column prop="description" label="說明" min-width="110" show-overflow-tooltip />
          <el-table-column label="金額" width="96" align="right" class-name="num-cell"><template #default="{ row }">{{ amt(row.amount) }}</template></el-table-column>
          <el-table-column label="憑證" width="80"><template #default="{ row }">{{ evidenceStatusLabel(String(row.status)) }}</template></el-table-column>
        </template>
        <template v-else-if="active === 'fixed_cost'">
          <el-table-column label="類別" min-width="120"><template #default="{ row }">{{ FIXED_COST_LABEL[String(row.category)] ?? row.category }}</template></el-table-column>
          <el-table-column label="金額" width="110" align="right" class-name="num-cell"><template #default="{ row }">{{ amt(row.amount) }}</template></el-table-column>
          <el-table-column prop="notes" label="備註" min-width="120" />
        </template>
        <template v-else-if="active === 'collection_fee'">
          <el-table-column prop="date" label="顧客繳費日" width="110" />
          <el-table-column prop="channel" label="代收機構" min-width="100" />
          <el-table-column label="帳單金額" width="100" align="right" class-name="num-cell"><template #default="{ row }">{{ amt(row.gross_amount) }}</template></el-table-column>
          <el-table-column label="手續費" width="80" align="right" class-name="num-cell"><template #default="{ row }">{{ amt(row.amount) }}</template></el-table-column>
        </template>
        <template v-else-if="active === 'year_end'">
          <el-table-column prop="employee_name" label="員工" min-width="120" />
          <el-table-column label="金額" width="110" align="right" class-name="num-cell"><template #default="{ row }">{{ amt(row.amount) }}</template></el-table-column>
        </template>
        <template v-else-if="active === 'extra_bonus'">
          <el-table-column prop="employee_name" label="員工" min-width="90" />
          <el-table-column prop="category_label" label="類別" min-width="120" />
          <el-table-column prop="paid_date" label="轉帳日" width="100" />
          <el-table-column label="金額" width="96" align="right" class-name="num-cell"><template #default="{ row }">{{ amt(row.amount) }}</template></el-table-column>
        </template>
      </el-table>
    </template>

    <template #footer>
      <div class="fd__foot">
        <span>{{ visibleRows.length }} / {{ activeRows.length }} 筆</span>
        <el-button :icon="Download" :loading="exporting" data-test="detail-export" @click="exportMonth">匯出本月（含明細）</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.fd__sum { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); margin-bottom: var(--space-3); }
.fd__sum div { background: var(--color-neutral-50); border-radius: var(--radius-sm); padding: 6px 10px; }
.fd__sum small { display: block; font-size: var(--text-xs); color: var(--text-tertiary); }
.fd__sum b { font-size: var(--text-lg); font-variant-numeric: tabular-nums; color: var(--text-primary); }
.fd__state { padding: var(--space-3) 0; }
.fd__chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: var(--space-2); }
.chip {
  font: inherit; font-size: var(--text-xs); cursor: pointer;
  border: 1px solid var(--el-border-color); border-radius: var(--radius-full);
  background: var(--surface-color); color: var(--text-secondary);
  padding: 2px 10px;
}
.chip.is-on { background: var(--el-color-primary-light-9); border-color: var(--el-color-primary-light-5); color: var(--el-color-primary); font-weight: 600; }
.chip:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
.fd__search { margin-bottom: var(--space-2); }
.fd__subtotal { margin: 0 0 var(--space-2); font-size: var(--text-xs); color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.fd__foot { display: flex; justify-content: space-between; align-items: center; font-size: var(--text-xs); color: var(--text-tertiary); }
</style>
