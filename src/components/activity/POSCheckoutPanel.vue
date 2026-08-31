<template>
  <div class="pos-panel-wrap">
    <POSDailySummaryBar
      :data="dailySummary.data"
      :error="dailySummary.error"
      @retry="handleDailySummaryRetry"
    />

    <div class="pos-panel-wrap__body">
      <POSSearchPanel
        v-model:mode="mode"
        v-model:search-query="searchQuery"
        v-model:classroom-filter="classroomFilter"
        :searching="searching"
        :load-error="searchError"
        :groups="searchGroups"
        :registrations="searchRegistrations"
        :selected-ids="selectedIds"
        :is-refund-mode="isRefundMode"
        :classroom-options="classroomOptions"
        :truncated="searchTruncation.truncated"
        :truncated-total="searchTruncation.total"
        class="pos-panel-wrap__col"
        @search="triggerSearch"
        @toggle="handleToggle"
      />

      <POSPaymentPanel
        v-model:notes="notes"
        v-model:checkout-type="checkoutType"
        :is-refund-mode="isRefundMode"
        :item-total="itemTotal"
        :selected-item="selectedItem"
        :can-submit="canSubmit"
        :refund-approval-blocked="refundApprovalBlocked"
        :refund-suggestion-loading="refundSuggestionLoading"
        :submitting="submitting"
        class="pos-panel-wrap__col pos-panel-wrap__col--pay"
        @update:applied-amount="(v) => updateSelectedAmount(v ?? 0)"
        @clear-selection="clearSelection"
        @clear="resetTransactionInputs"
        @submit="handleSubmit"
      />
    </div>

    <!-- 今日交易明細（可展開，可重印） -->
    <el-card class="pos-panel-wrap__recent" shadow="never">
      <div class="pos-panel-wrap__recent-head">
        <div class="pos-panel-wrap__recent-head-main">
          <!-- 「顯示 N／共 M 張」：列表有取回上限，旺季一天上百張時，只寫顯示筆數會被
               當成當日總張數拿去對帳（P2-07）。 -->
          <span class="pos-panel-wrap__recent-title">
            今日交易（顯示 {{ recentTransactions.items.length }}／共 {{ recentTotal }} 張）
          </span>
          <el-tag
            v-if="recentTransactions.truncated"
            type="warning"
            size="small"
            class="pos-panel-wrap__recent-truncated"
          >
            僅顯示最新 {{ recentTransactions.items.length }} 筆，完整清單請至「POS 日結簽核」查看
          </el-tag>
        </div>
        <!-- 送出期間停用（CONC-03）：這顆刷新與結帳後的刷新是同一把 dedupe key，
             在途時會把結帳後的刷新吞成「結帳前」的快照，彙總條就少算本筆。 -->
        <el-button
          size="small"
          :icon="RefreshRight"
          :loading="recentTransactions.loading"
          :disabled="submitting"
          @click="refreshRecentTransactions()"
        >
          重新整理
        </el-button>
      </div>
      <!-- 刷新失敗必須看得見（P3-05）：櫃台可能剛結完帳、正要在這裡確認那筆收據，
           清單靜默維持舊內容會被誤讀成「這筆沒收到」。 -->
      <el-alert
        v-if="recentTransactions.error"
        type="error"
        :closable="false"
        show-icon
        class="pos-panel-wrap__recent-error"
      >
        <template #title>
          今日交易清單載入失敗，以下內容可能不是最新，請按「重新整理」再試。
        </template>
      </el-alert>
      <!-- 空狀態壓成一行：el-empty 的插圖與留白在收銀頁佔掉三百多 px，而開店到
           第一筆入帳之間這塊一直是空的，等於把收款區推出畫面。 -->
      <p
        v-if="!recentTransactions.loading && recentTransactions.items.length === 0"
        class="pos-panel-wrap__recent-empty"
      >
        今日尚無交易，完成第一筆收款後會列在這裡。
      </p>
      <el-table
        v-else
        :data="recentTransactions.items"
        size="small"
        :max-height="260"
      >
        <el-table-column label="時間" width="80">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="收據編號" width="200">
          <template #default="{ row }">
            <code>{{ row.receipt_no }}</code>
          </template>
        </el-table-column>
        <el-table-column label="類型" width="60">
          <template #default="{ row }">
            <el-tag :type="row.type === 'refund' ? 'danger' : 'success'" size="small">
              {{ row.type === 'refund' ? '退費' : '繳費' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="學生" min-width="140">
          <template #default="{ row }">
            {{ (row.student_names || []).join('、') }}
          </template>
        </el-table-column>
        <el-table-column label="金額" width="100" align="right">
          <template #default="{ row }">{{ formatTWD(row.total) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="center" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link @click="reprintTransaction(row)">
              <el-icon><Printer /></el-icon> 重印
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="receiptDialogVisible"
      :title="lastReceipt?.is_reprint ? '重印收據' : (lastReceipt?.type === 'refund' ? '退費成功' : '結帳成功')"
      width="420px"
      align-center
    >
      <div v-if="lastReceipt" class="pos-panel-wrap__receipt">
        <!-- 核對區（②收款改造，2026-08-16）：主角改成「這筆錢有沒有收對」，
             收據編號／國字大寫降級為次要資訊移到下方。 -->
        <div class="pos-panel-wrap__verify">
          <div class="pos-panel-wrap__verify-row pos-panel-wrap__verify-row--main">
            <span>{{ lastReceipt.type === 'refund' ? '本次退費' : '本次收取' }}</span>
            <strong>{{ formatTWD(lastReceipt.total) }}</strong>
          </div>
          <div v-if="primaryReceiptItem" class="pos-panel-wrap__verify-row">
            <span>該生累計已繳</span>
            <span>{{ formatTWD(receiptPaidAfter) }}</span>
          </div>
          <div v-if="primaryReceiptItem" class="pos-panel-wrap__verify-row">
            <span>應繳合計</span>
            <span>{{ formatTWD(receiptTotalAmount) }}</span>
          </div>
          <div
            v-if="primaryReceiptItem"
            class="pos-panel-wrap__verify-row pos-panel-wrap__verify-row--remaining"
            :class="receiptRemaining > 0 ? 'is-danger' : 'is-success'"
          >
            <span>剩餘欠款</span>
            <strong>{{ formatTWD(receiptRemaining) }}</strong>
          </div>
          <el-alert
            v-if="lastReceipt.type !== 'refund' && primaryReceiptItem && receiptRemaining === 0"
            type="success"
            :closable="false"
            show-icon
            title="✓ 已繳清——實收與報名應繳相符"
            class="pos-panel-wrap__verify-alert"
          />
        </div>

        <div v-if="lastReceipt.tendered != null" class="pos-panel-wrap__receipt-row">
          <span>實收</span>
          <strong>{{ formatTWD(lastReceipt.tendered) }}</strong>
        </div>
        <div v-if="lastReceipt.change != null" class="pos-panel-wrap__receipt-row">
          <span>找零</span>
          <strong class="pos-panel-wrap__change">{{ formatTWD(lastReceipt.change) }}</strong>
        </div>
        <div class="pos-panel-wrap__receipt-items">
          <div
            v-for="item in receiptItems"
            :key="item.registration_id"
          >
            {{ item.student_name }}（{{ item.class_name || '—' }}） ×
            {{ formatTWD(item.amount_applied) }}
          </div>
        </div>

        <div class="pos-panel-wrap__receipt-meta">
          <span>{{ lastReceipt.payment_method }} · 收據編號 {{ lastReceipt.receipt_no }}</span>
          <em>{{ toChineseAmount(lastReceipt.total) }}</em>
        </div>
      </div>
      <template #footer>
        <el-button @click="receiptDialogVisible = false">關閉</el-button>
        <!-- 明確傳 reprint：is_reprint 為真（來自 reprintTransaction）代表這顆按鈕
             是再印一次、標補印；一般結帳成功後首次點擊視為本收據的正本列印
             （②收款改造起不再自動列印，改由此按鈕手動觸發）。第二次以後改標補印
             （FECASH-06）。不可寫成 @click="printReceipt"——那會把 MouseEvent
             當 options 傳進去。 -->
        <el-button
          type="primary"
          @click="handlePrintReceipt"
        >
          {{ printButtonLabel }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Printer, RefreshRight } from '@element-plus/icons-vue'

import POSDailySummaryBar from '@/components/activity/POSDailySummaryBar.vue'
import POSPaymentPanel from '@/components/activity/POSPaymentPanel.vue'
import POSSearchPanel from '@/components/activity/POSSearchPanel.vue'
import { getClassrooms } from '@/api/classrooms'
import { usePOSCheckout } from '@/composables/usePOSCheckout'
import { formatTWD, toChineseAmount } from '@/constants/pos'
import { useAcademicTermStore } from '@/stores/academicTerm'

const props = withDefaults(defineProps<{
  onAfterCheckout?: ((...args: unknown[]) => unknown) | null
}>(), {
  onAfterCheckout: null,
})

const {
  mode,
  searchQuery,
  classroomFilter,
  searching,
  searchGroups,
  searchRegistrations,
  searchError,
  searchTruncation,
  triggerSearch,
  runSearch,
  checkoutType,
  isRefundMode,
  refundSuggestionLoading,
  selectedItem,
  itemTotal,
  selectItem,
  clearSelection,
  updateSelectedAmount,
  resetTransactionInputs,
  notes,
  canSubmit,
  refundApprovalBlocked,
  submitting,
  submit: doSubmit,
  lastReceipt,
  receiptDialogVisible,
  printReceipt,
  reprintTransaction,
  dailySummary,
  refreshDailySummary,
  recentTransactions,
  refreshRecentTransactions,
} = usePOSCheckout()

// 當日收據總張數（截斷前）。後端未回 total 時退回顯示筆數，避免標題寫「共 0 張」。
const recentTotal = computed((): number =>
  recentTransactions.total || recentTransactions.items.length
)

// 搜尋面板的 selected-ids 仍以陣列接口呈現，單筆模式下至多一個元素
const selectedIds = computed((): (number | string)[] => (selectedItem.value ? [selectedItem.value.id as number | string] : []))

interface ReceiptItem {
  registration_id?: string | number
  student_name?: string
  class_name?: string
  amount_applied?: number
  new_paid_amount?: number
  total_amount?: number
}
// 收據明細：將 lastReceipt.items (unknown) cast 為具名型別，供模板安全存取
const receiptItems = computed((): ReceiptItem[] =>
  ((lastReceipt.value?.items as ReceiptItem[]) ?? [])
)

// 核對區（②收款改造，2026-08-16）：POS 目前每筆交易恆為單一報名，取第一筆即可。
// new_paid_amount/total_amount 兩欄後端 checkout 與 recent-transactions 回應皆帶，
// 重印歷史交易（reprintTransaction）走同一 lastReceipt.items 形狀，邏輯共用不需分支。
const primaryReceiptItem = computed((): ReceiptItem | null => receiptItems.value[0] ?? null)
const receiptPaidAfter = computed(() => primaryReceiptItem.value?.new_paid_amount ?? 0)
const receiptTotalAmount = computed(() => primaryReceiptItem.value?.total_amount ?? 0)
const receiptRemaining = computed(() =>
  Math.max(0, receiptTotalAmount.value - receiptPaidAfter.value)
)

// FECASH-06（2026-08-24）：同一張收據在對話框裡被連按兩次「列印收據」時，第二次
// 以後仍送 reprint=false，於是市面上出現兩張外觀完全相同的正本，後端稽核也記成兩次
// 「列印」而非「補印」。用一個「這張收據已經印過」旗標分流。
// ⚠ 2026-08-15 才修好反向的 bug（首印被誤標補印）：**首次列印必須是 reprint=false**，
// 旗標只在列印成功後才立起來（printReceipt 回 false 代表 PDF 沒印出來，不算首印）。
const receiptPrinted = ref(false)
// 換一張收據（結帳成功、或從交易列表重印）就重置，避免下一張收據一開始就被當補印。
watch(lastReceipt, () => {
  receiptPrinted.value = false
})

// 從交易列表重印進來的收據（is_reprint）本來就是補印，維持既有「重印收據」文案。
const isReprintSource = computed((): boolean => !!lastReceipt.value?.is_reprint)
const printAsReprint = computed((): boolean => isReprintSource.value || receiptPrinted.value)
const printButtonLabel = computed((): string => {
  if (isReprintSource.value) return '重印收據'
  return receiptPrinted.value ? '補印收據' : '列印收據'
})

// 列印在途旗標：連點兩次時第二次不再送出（避免同時開兩個 PDF 分頁）。
const printing = ref(false)

async function handlePrintReceipt() {
  if (printing.value) return
  printing.value = true
  const asReprint = printAsReprint.value
  // 樂觀立旗標：即使使用者在 await 期間再點一次，第二次也已經是補印而非正本。
  receiptPrinted.value = true
  try {
    const ok = await printReceipt({ reprint: asReprint })
    // 首印失敗（沒真的印出正本）就把旗標放回去，否則補救的那次會被誤標補印，
    // 家長手上永遠拿不到未標補印的正本。
    if (ok === false && !asReprint) receiptPrinted.value = false
  } finally {
    printing.value = false
  }
}

// 送出期間不重整日結（CONC-03）：與「重新整理」按鈕同理，在途的刷新會把結帳後的
// 刷新吞成結帳前的快照。POSDailySummaryBar 沒有 disabled 介面，故在此擋下。
function handleDailySummaryRetry() {
  if (submitting.value) return
  refreshDailySummary()
}

function handleToggle(row: Record<string, unknown>, studentName: string) {
  selectItem(row, studentName)
}

async function handleSubmit() {
  await doSubmit({
    onSubmitted: () => props.onAfterCheckout?.(),
  })
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(11, 16)
  return d.toLocaleTimeString('zh-Hant', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Taipei',
  })
}

const termStore = useAcademicTermStore()

const classroomOptions = ref<string[]>([])
// review P3（2026-07-12）：加請求序號守衛。切學期時 watch 會重載班級選項，較慢的舊學期回應
// 可最後覆寫 → POS 班級篩選顯示舊學期班級。過期回應丟棄不覆寫。
let classroomOptionsSeq = 0
async function loadClassroomOptions() {
  const seq = ++classroomOptionsSeq
  try {
    const res = await getClassrooms({
      school_year: termStore.school_year,
      semester: termStore.semester,
    } as Parameters<typeof getClassrooms>[0])
    if (seq !== classroomOptionsSeq) return
    const rows = (res.data as { items?: { name?: string }[] } | { name?: string }[] | null)
    const list = (rows as { items?: { name?: string }[] })?.items ?? (rows as { name?: string }[]) ?? []
    classroomOptions.value = list.map((c: { name?: string }) => c.name).filter((n): n is string => !!n)
  } catch {
    if (seq !== classroomOptionsSeq) return
    classroomOptions.value = []
  }
}

// 切學期時重新整理搜尋結果與日結（交易記錄本就按日期不按學期過濾）
// 主動清舊學期的日結 / 當日交易快照，避免 nextTick 前短暫顯示上一學期數字
watch(
  () => [termStore.school_year, termStore.semester],
  () => {
    clearSelection()
    classroomFilter.value = ''
    dailySummary.data = null
    dailySummary.error = false
    recentTransactions.items = []
    recentTransactions.total = 0
    recentTransactions.truncated = false
    recentTransactions.error = false
    loadClassroomOptions()
    runSearch()
    refreshDailySummary()
    refreshRecentTransactions()
  }
)

onMounted(() => {
  refreshDailySummary()
  refreshRecentTransactions()
  loadClassroomOptions()
  runSearch() // 首次進頁面即列出全部未結清，搜尋框變過濾器而非啟動條件
})

defineExpose({ refreshDailySummary, refreshRecentTransactions })
</script>

<style scoped>
.pos-panel-wrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 600px;
}

.pos-panel-wrap__body {
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  gap: 12px;
  min-height: 0;
  /* start 而非 stretch：依學生收款時左欄清單可長達數十筆，stretch 會把付款欄
     一起拉到同高，加上付款卡按鈕組的 margin-top:auto，結帳鈕會被推到整份清單
     的最底下。改 start 後付款欄縮回內容高度，才有空間讓下面的 sticky 生效。 */
  align-items: start;
}

.pos-panel-wrap__col {
  min-height: 560px;
  overflow: hidden;
  display: flex;
}

/* 付款欄吸附：收銀員捲動長清單挑學生時，金額與結帳鈕一直留在視線內。
   吸附座標系是 AdminLayout 那個 overflow-y:auto 的主內容區，與
   YearPlanWorkspaceView `.side-panel` 同一套慣例。 */
.pos-panel-wrap__col--pay {
  position: sticky;
  top: var(--space-3);
  /* 覆蓋通用欄位的 560px：空狀態就該是一張矮卡，不是一大片白 */
  min-height: 0;
  /* 選了含多門課程的報名時面板可能比視窗高，讓它自己捲，別把按鈕頂出畫面 */
  max-height: calc(100vh - 140px);
  overflow-y: auto;
}

.pos-panel-wrap__col > :deep(.pos-panel),
.pos-panel-wrap__col > :deep(.el-card) {
  flex: 1;
}

.pos-panel-wrap__recent {
  margin-top: 4px;
}

.pos-panel-wrap__recent-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.pos-panel-wrap__recent-head-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.pos-panel-wrap__recent-title {
  font-size: 15px;
  font-weight: 600;
}

.pos-panel-wrap__recent-error {
  margin-bottom: 10px;
}

.pos-panel-wrap__recent-empty {
  margin: 0;
  padding: 4px 0 8px;
  font-size: 13px;
  color: var(--text-tertiary);
}

.pos-panel-wrap__receipt {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pos-panel-wrap__receipt-row {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: var(--neutral-600);
}

.pos-panel-wrap__receipt-row strong {
  color: var(--text-primary);
  font-size: 16px;
}

/* 找零金額：文字色走 *-darker（a11y.css 的 html.dark 已翻成亮階）。*-hover 是互動態
   token、dark 刻意未覆寫，深色底下讀不到找零＝當場找錯錢（P3-10）。守衛見
   __tests__/POSDarkContrast.test.ts。 */
.pos-panel-wrap__change {
  color: var(--color-success-darker) !important;
  font-size: 18px !important;
}

.pos-panel-wrap__receipt-items {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-color);
  font-size: 13px;
  color: var(--neutral-600);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 核對區（②收款改造，2026-08-16）：對帳導向的主要視覺焦點 */
.pos-panel-wrap__verify {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  background: var(--bg-color);
  border-radius: 10px;
  border: 1px solid var(--border-color);
}

.pos-panel-wrap__verify-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 14px;
  color: var(--neutral-600);
}

.pos-panel-wrap__verify-row--main {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.pos-panel-wrap__verify-row--remaining {
  padding-top: 6px;
  border-top: 1px dashed var(--border-color);
  font-size: 16px;
}

.pos-panel-wrap__verify-row--remaining.is-danger strong {
  color: var(--color-danger-darker);
}

.pos-panel-wrap__verify-row--remaining.is-success strong {
  color: var(--color-success-darker);
}

.pos-panel-wrap__verify-alert {
  margin-top: 4px;
}

.pos-panel-wrap__receipt-meta {
  margin-top: 8px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 12px;
  color: var(--text-tertiary);
}

.pos-panel-wrap__receipt-meta em {
  font-style: italic;
}

@media (max-width: 1000px) {
  .pos-panel-wrap__body {
    grid-template-columns: 1fr;
  }
  .pos-panel-wrap__col {
    min-height: 420px;
  }
  /* 單欄堆疊時付款卡排在清單「上方」，繼續吸附會蓋住正要挑選的清單 */
  .pos-panel-wrap__col--pay {
    position: static;
    max-height: none;
    overflow-y: visible;
  }
}
</style>
