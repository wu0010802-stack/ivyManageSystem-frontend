<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import {
  previewAppraisalPayout, generateAppraisalPayout,
  listAppraisalPayouts, voidAppraisalPayouts,
  exportYearEndTransferRosterXlsxUrl,
} from '@/api/yearEnd'
import { formatCurrency } from '@/utils/currency'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'

interface PreviewRow {
  employee_id: number
  employee_name: string
  role_group: string
  earlier_summary_id: number | null
  earlier_amount: string
  earlier_cycle_finalized: boolean
  later_summary_id: number | null
  later_amount: string
  later_cycle_finalized: boolean
  total_amount: string
  is_inactive: boolean
  warnings: string[]
}

interface PayoutItem {
  id: number
  employee_id: number
  employee_name: string
  bonus_type: string
  period_label: string
  amount: string
  source_ref?: string | null
  calc_meta: Record<string, unknown>
}

// 批次 A②：generate 成功後的「收據」——後端 PayoutGenerateResult 本就回傳人數/筆數/
// 總額/略過數，原本全被丟掉只彈一個 toast。收據卡常駐「已生成」分頁頂部，並附
// 轉帳名冊下載連結（cycle_id 來自 generate response）。included_inactive_count 是
// 送出當下的前端狀態（後端 response 無此欄），與 skipped_inactive_count 互補。
interface GenerateReceipt {
  cycle_id: number
  generated_count: number
  affected_employee_count: number
  total_amount: string
  skipped_inactive_count: number
  warnings: string[]
  included_inactive_count: number
  created_at: Date
}

// 預覽列 warnings 是後端英文代碼（SPEC-006 §4.5），UI 一律轉中文；未知代碼原樣顯示。
// 「上/下學期」對齊本頁 earlierLabel/laterLabel 的語意（earlier=上學期）。
const WARNING_LABELS: Record<string, string> = {
  inactive_employee: '已離職',
  not_participated_in_earlier: '未參與上學期考核',
  not_participated_in_later: '未參與下學期考核',
  earlier_summary_not_finalized: '上學期考核未核定',
  later_summary_not_finalized: '下學期考核未核定',
  cycle_not_finalized: '考核週期未核定',
}
function warningLabel(code: string): string {
  return WARNING_LABELS[code] ?? code
}

const route = useRoute()
const router = useRouter()
// year 持久化進 URL query，F5 / 分享連結可保留篩選狀態（比照 CycleListView 慣例）。
const year = ref<number>(Number(route.query.year) || new Date().getFullYear())
const loading = ref(false)
const rows = ref<PreviewRow[]>([])
const selected = ref<Set<number>>(new Set())
const tab = ref<'preview' | 'generated'>('preview')
const generatedRows = ref<PayoutItem[]>([])
const generatedLoading = ref(false)
const receipt = ref<GenerateReceipt | null>(null)

// 考核年終 payout 兩分量 = 前一學年的上/下學期。後端 resolve_target_cycles：
// source_academic_year = civil_year_to_target_academic_year(year) - 1 = year - 1913
// （civil_year_to_target_academic_year(N) = N - 1912）。動態計算避免寫死
// （原寫死 113下/114上 兩者皆錯，正確為 113上/113下）。
const sourceAcademicYear = computed(() => year.value - 1913)
const earlierLabel = computed(() => `${sourceAcademicYear.value}上`)
const laterLabel = computed(() => `${sourceAcademicYear.value}下`)

const anyCycleNotFinalized = computed(() =>
  rows.value.some((r) => !r.earlier_cycle_finalized || !r.later_cycle_finalized)
)
// 422 = 該學年來源考核 cycle 尚未建立，不是系統錯誤（發放年 N 對應前一個已完整結束
// 的學年，年份換算是刻意設計）。前端不可把後端內部訊息（如「appraisal_cycle
// academic_year=113 FIRST 不存在」）當紅色 toast 丟給使用者，改顯示友善空狀態
// （提示切換年份或前往考核管理建立週期）。其他狀態碼（500 等）維持既有 toast
// （2026-07-31 QA 缺陷）。
const notReady = ref(false)
// 後端 generate 契約：一律發放「全部在職員工」，只額外接受 included_inactive_employee_ids
// 對「非在職」員工做 opt-in（後端不支援排除在職員工）。因此前端必須誠實化：
//   payoutRows = 全部在職 + 已勾選的非在職
// 不可用 selectedRows（含對在職列的取消勾選）來算 confirm 筆數/合計，
// 否則畫面顯示與實際寫入金流不一致（bug #27）。
// 若日後業主需要逐人排除在職員工，需後端 generate 增加 excluded ids 支援，
// 本次先讓前端與後端實際行為一致。
const activeRows = computed(() => rows.value.filter((r) => !r.is_inactive))
const selectedInactiveRows = computed(() =>
  rows.value.filter((r) => r.is_inactive && selected.value.has(r.employee_id))
)
const payoutRows = computed(() => [...activeRows.value, ...selectedInactiveRows.value])
const payoutTotal = computed(() =>
  payoutRows.value.reduce((s, r) => s + Number(r.total_amount), 0)
)
const payoutTotalDisplay = computed(() => formatCurrency(payoutTotal.value))
const includedInactiveIds = computed(() =>
  selectedInactiveRows.value.map((r) => r.employee_id)
)

async function loadPreview() {
  loading.value = true
  notReady.value = false
  try {
    const res = await previewAppraisalPayout(year.value)
    rows.value = res.data as PreviewRow[]
    selected.value = new Set(rows.value.filter((r) => !r.is_inactive).map((r) => r.employee_id))
  } catch (e) {
    const status = (e as { response?: { status?: number } } | null)?.response?.status
    if (status === 422) {
      rows.value = []
      selected.value = new Set()
      notReady.value = true
    } else {
      ElMessage.error(friendlyError('載入發放預覽失敗', e))
    }
  } finally {
    loading.value = false
  }
}

async function loadGenerated() {
  generatedLoading.value = true
  try {
    const res = await listAppraisalPayouts(year.value)
    generatedRows.value = res.data as PayoutItem[]
  } catch (e) {
    ElMessage.error(friendlyError('載入已生成列表失敗', e))
  } finally {
    generatedLoading.value = false
  }
}

function toggleSelect(employeeId: number, checked: boolean) {
  // 在職員工一律納入發放（後端契約），不可被排除——對在職列的取消勾選視為 no-op，
  // 避免畫面顯示「已排除」但實際仍會發放（bug #27）。只允許切換非在職員工的 opt-in。
  const row = rows.value.find((r) => r.employee_id === employeeId)
  if (row && !row.is_inactive) return
  if (checked) selected.value.add(employeeId)
  else selected.value.delete(employeeId)
}

async function onGenerate() {
  if (payoutRows.value.length === 0) {
    ElMessage.warning('沒有可發放的員工')
    return
  }
  try {
    await ElMessageBox.confirm(
      `將為 ${payoutRows.value.length} 名員工建立考核年終發放資料（全部在職員工＋已勾選的離職員工），合計 ${payoutTotalDisplay.value}。此動作只會在系統內建立發放資料，不會執行匯款。`,
      '確認建立發放資料',
      { confirmButtonText: '確認建立', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  try {
    const res = await generateAppraisalPayout({
      year: year.value,
      included_inactive_employee_ids: includedInactiveIds.value,
    })
    const data = res.data
    receipt.value = {
      cycle_id: data.cycle_id,
      generated_count: data.generated_count,
      affected_employee_count: data.affected_employee_count,
      total_amount: data.total_amount,
      skipped_inactive_count: data.skipped_inactive_count,
      warnings: data.warnings ?? [],
      included_inactive_count: includedInactiveIds.value.length,
      created_at: new Date(),
    }
    ElMessage.success('發放資料已建立')
    tab.value = 'generated'
  } catch (e) {
    ElMessage.error(friendlyError('建立發放資料失敗', e))
  }
}

async function onVoid() {
  try {
    await ElMessageBox.confirm('將清空本年所有考核年終發放資料（不可復原）', '確認清空', { type: 'warning' })
    await ElMessageBox.confirm('再次確認：清空後須重新建立發放資料', '最終確認', { type: 'warning' })
  } catch {
    return
  }
  try {
    const res = await voidAppraisalPayouts(year.value)
    const data = res.data as { deleted_count: number }
    ElMessage.success(`已刪除 ${data.deleted_count} 筆發放資料`)
    receipt.value = null
    await loadGenerated()
  } catch (e) {
    ElMessage.error(friendlyError('清空發放資料失敗', e))
  }
}

// 收據時間戳（本地時間，僅供畫面回顧；權威軌跡在後端 audit log）
function formatReceiptTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

defineExpose({
  selected, anyCycleNotFinalized, onGenerate, onVoid, loadPreview, rows, year,
  toggleSelect, payoutRows, payoutTotal, payoutTotalDisplay,
  tab, generatedRows, generatedLoading, loadGenerated, notReady, receipt,
})

onMounted(loadPreview)
watch(year, (v) => {
  loadPreview()
  receipt.value = null // 收據屬於送出當下的年份，切年後顯示會誤導
  if (tab.value === 'generated') loadGenerated()
  // year 同步進 URL query（F5 / 分享連結可保留），保留其餘既有 query 欄位。
  router.replace({ query: { ...route.query, year: String(v) } })
})
watch(tab, (t) => {
  if (t === 'generated') loadGenerated()
})
</script>

<template>
  <div class="appraisal-payout-view">
    <PageHeader title="考核年終獎金管理">
      <template #actions>
        <el-input-number v-model="year" :min="2024" :max="2099" />
        <el-button type="primary" @click="loadPreview">重新載入</el-button>
      </template>
    </PageHeader>

    <el-alert
      v-if="anyCycleNotFinalized"
      type="warning"
      :closable="false"
      title="來源考核週期尚未全數核定，可能無法建立發放資料；請先完成考核簽核。"
      data-test="not-finalized-warning"
      style="margin: var(--space-3) 0;"
    />

    <el-tabs v-model="tab">
      <el-tab-pane label="預覽" name="preview">
        <EmptyState
          v-if="notReady"
          data-test="preview-not-ready"
          title="本年度尚無可發放的考核年終資料"
          description="來源學年的考核週期尚未建立。可切換上方年份，或前往考核管理建立該學年的考核週期後再回來發放。"
        >
          <template #action>
            <router-link :to="{ path: '/appraisal-year-end/appraisal', query: { stage: 'sign' } }">
              <el-button type="primary" plain>前往考核管理</el-button>
            </router-link>
          </template>
        </EmptyState>

        <template v-else>
          <el-table v-loading="loading" :data="rows" border>
            <el-table-column label="發放" width="80">
              <template #default="{ row }">
                <!-- 在職員工一律發放、不可排除（後端契約），checkbox 唯讀全勾；
                     只有非在職員工可 opt-in 切換。bug #27：避免顯示與實際發放不一致 -->
                <el-checkbox
                  :model-value="selected.has(row.employee_id)"
                  :disabled="!row.is_inactive"
                  :data-test="`row-checkbox-${row.employee_id}`"
                  @update:model-value="(v) => toggleSelect(row.employee_id, Boolean(v))"
                />
              </template>
            </el-table-column>
            <el-table-column prop="employee_name" label="員工" />
            <el-table-column prop="earlier_amount" :label="earlierLabel" />
            <el-table-column prop="later_amount" :label="laterLabel" />
            <el-table-column prop="total_amount" label="合計" />
            <el-table-column label="在職?" width="100">
              <template #default="{ row }">
                <el-tag :type="row.is_inactive ? 'danger' : 'success'" size="small">
                  {{ row.is_inactive ? '已離職' : '在職' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="警告">
              <template #default="{ row }">
                <span v-for="w in row.warnings" :key="w" class="warning-tag">{{ warningLabel(w) }}</span>
              </template>
            </el-table-column>
          </el-table>

          <footer class="footer">
            <el-button type="primary" size="large" data-test="generate-button" @click="onGenerate">
              建立發放資料（{{ payoutRows.length }} 人，合計 {{ payoutTotalDisplay }}）
            </el-button>
          </footer>
        </template>
      </el-tab-pane>

      <el-tab-pane label="已生成" name="generated">
        <!-- 批次 A②：收據卡——建立成功後常駐回顧（原本只彈一次 toast，看過就沒了） -->
        <div v-if="receipt" class="receipt-card" data-test="generate-receipt">
          <div class="receipt-card__title">✅ 發放資料已建立（{{ formatReceiptTime(receipt.created_at) }}）</div>
          <ul class="receipt-card__list">
            <li>員工 {{ receipt.affected_employee_count }} 人，共 {{ receipt.generated_count }} 筆發放資料（每人上、下學期各一筆）</li>
            <li>合計 {{ formatCurrency(receipt.total_amount) }}</li>
            <li>納入離職員工 {{ receipt.included_inactive_count }} 位；未納入 {{ receipt.skipped_inactive_count }} 位</li>
            <li v-for="w in receipt.warnings" :key="w" class="receipt-card__warning">{{ warningLabel(w) }}</li>
          </ul>
          <div class="receipt-card__note">
            此動作僅在系統內建立發放資料，不會執行匯款。下一步：下載轉帳名冊交付銀行作業
            （名冊涵蓋整個年終週期，含本次考核獎金與其他年終項目）。
          </div>
          <a
            :href="exportYearEndTransferRosterXlsxUrl(receipt.cycle_id)"
            target="_blank"
            class="receipt-card__link"
            data-test="receipt-roster-link"
          >
            <el-button type="primary" plain>下載轉帳名冊 Excel</el-button>
          </a>
        </div>
        <div class="generated-toolbar">
          <el-button type="danger" plain data-test="void-button" @click="onVoid">清空本年發放資料</el-button>
        </div>
        <el-table v-loading="generatedLoading" :data="generatedRows" border>
          <template #empty>
            <EmptyState title="本年尚未生成" />
          </template>
          <el-table-column label="員工">
            <template #default="{ row }">{{ row.employee_name }}</template>
          </el-table-column>
          <el-table-column label="期別">
            <template #default="{ row }">{{ row.period_label }}</template>
          </el-table-column>
          <el-table-column label="金額" align="right">
            <template #default="{ row }">{{ formatCurrency(row.amount) }}</template>
          </el-table-column>
          <el-table-column label="來源">
            <template #default="{ row }">{{ row.source_ref ?? '—' }}</template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.appraisal-payout-view { padding: var(--space-4); }
.footer { margin-top: var(--space-4); text-align: right; }
.generated-toolbar { margin-bottom: var(--space-3); text-align: right; }
.warning-tag {
  display: inline-block; margin-right: var(--space-1); padding: 2px 6px;
  background: var(--color-warning-soft); color: var(--color-warning-darker);
  border-radius: 4px; font-size: 12px;
}
.receipt-card {
  margin-bottom: var(--space-3); padding: var(--space-3);
  border: 1px solid var(--el-color-success-light-5, #b3e19d);
  background: var(--el-color-success-light-9, #f0f9eb);
  border-radius: var(--radius-md, 6px);
}
.receipt-card__title { font-weight: 600; margin-bottom: var(--space-2); }
.receipt-card__list { margin: 0 0 var(--space-2); padding-left: 1.4em; }
.receipt-card__warning { color: var(--color-warning-darker); }
.receipt-card__note { font-size: 13px; color: var(--text-secondary); margin-bottom: var(--space-2); }
.receipt-card__link { text-decoration: none; display: inline-block; }
</style>
