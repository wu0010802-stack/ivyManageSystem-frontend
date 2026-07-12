<template>
  <div class="pos-panel-wrap">
    <POSDailySummaryBar :data="dailySummary.data" />

    <div class="pos-panel-wrap__body">
      <POSSearchPanel
        v-model:mode="mode"
        v-model:search-query="searchQuery"
        v-model:classroom-filter="classroomFilter"
        v-model:overdue-only="overdueOnly"
        :searching="searching"
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
        :submitting="submitting"
        class="pos-panel-wrap__col"
        @update:applied-amount="(v) => updateSelectedAmount(v ?? 0)"
        @clear-selection="clearSelection"
        @clear="resetTransactionInputs"
        @submit="handleSubmit"
      />
    </div>

    <!-- 今日交易明細（可展開，可重印） -->
    <el-card class="pos-panel-wrap__recent" shadow="never">
      <div class="pos-panel-wrap__recent-head">
        <span class="pos-panel-wrap__recent-title">今日交易 ({{ recentTransactions.items.length }})</span>
        <el-button
          size="small"
          :icon="RefreshRight"
          :loading="recentTransactions.loading"
          @click="refreshRecentTransactions"
        >
          重新整理
        </el-button>
      </div>
      <el-empty
        v-if="!recentTransactions.loading && recentTransactions.items.length === 0"
        description="今日尚無交易"
        :image-size="60"
      />
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
        <div class="pos-panel-wrap__receipt-row pos-panel-wrap__receipt-row--lg">
          <span>收據編號</span>
          <strong>{{ lastReceipt.receipt_no }}</strong>
        </div>
        <div class="pos-panel-wrap__receipt-row">
          <span>{{ lastReceipt.type === 'refund' ? '退款合計' : '應收' }}</span>
          <strong>{{ formatTWD(lastReceipt.total) }}</strong>
        </div>
        <div class="pos-panel-wrap__receipt-row pos-panel-wrap__receipt-row--small">
          <span></span>
          <em>{{ toChineseAmount(lastReceipt.total) }}</em>
        </div>
        <div v-if="lastReceipt.tendered != null" class="pos-panel-wrap__receipt-row">
          <span>實收</span>
          <strong>{{ formatTWD(lastReceipt.tendered) }}</strong>
        </div>
        <div v-if="lastReceipt.change != null" class="pos-panel-wrap__receipt-row">
          <span>找零</span>
          <strong class="pos-panel-wrap__change">{{ formatTWD(lastReceipt.change) }}</strong>
        </div>
        <div class="pos-panel-wrap__receipt-row">
          <span>方式</span>
          <strong>{{ lastReceipt.payment_method }}</strong>
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
      </div>
      <template #footer>
        <el-button @click="receiptDialogVisible = false">關閉</el-button>
        <el-button type="primary" @click="printReceipt">重印收據</el-button>
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
  overdueOnly,
  searching,
  searchGroups,
  searchRegistrations,
  searchTruncation,
  triggerSearch,
  runSearch,
  checkoutType,
  isRefundMode,
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

// 搜尋面板的 selected-ids 仍以陣列接口呈現，單筆模式下至多一個元素
const selectedIds = computed((): (number | string)[] => (selectedItem.value ? [selectedItem.value.id as number | string] : []))

interface ReceiptItem {
  registration_id?: string | number
  student_name?: string
  class_name?: string
  amount_applied?: number
}
// 收據明細：將 lastReceipt.items (unknown) cast 為具名型別，供模板安全存取
const receiptItems = computed((): ReceiptItem[] =>
  ((lastReceipt.value?.items as ReceiptItem[]) ?? [])
)

function handleToggle(row: Record<string, unknown>, studentName: string) {
  selectItem(row, studentName)
}

async function handleSubmit(payload: { print?: boolean } = {}) {
  const { print = true } = payload
  await doSubmit({
    print,
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
    recentTransactions.items = []
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
  align-items: stretch;
}

.pos-panel-wrap__col {
  min-height: 560px;
  overflow: hidden;
  display: flex;
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

.pos-panel-wrap__recent-title {
  font-size: 15px;
  font-weight: 600;
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

.pos-panel-wrap__receipt-row--lg {
  font-size: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 4px;
}

.pos-panel-wrap__receipt-row--small {
  font-size: 12px;
  font-style: italic;
  color: var(--text-tertiary);
  margin-top: -6px;
}

.pos-panel-wrap__receipt-row--small em {
  font-style: normal;
}

.pos-panel-wrap__receipt-row strong {
  color: var(--text-primary);
  font-size: 16px;
}

.pos-panel-wrap__change {
  color: var(--color-success-hover) !important;
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

@media (max-width: 1000px) {
  .pos-panel-wrap__body {
    grid-template-columns: 1fr;
  }
  .pos-panel-wrap__col {
    min-height: 420px;
  }
}
</style>
