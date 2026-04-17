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
        class="pos-panel-wrap__col"
        @search="triggerSearch"
        @toggle="handleToggle"
      />

      <POSCartPanel
        :cart="cart"
        :cart-total="cartTotal"
        :is-refund-mode="isRefundMode"
        class="pos-panel-wrap__col"
        @remove="removeFromCart"
        @edit-amount="handleEditAmount"
      />

      <POSPaymentPanel
        v-model:payment-method="paymentMethod"
        v-model:tendered-input="tenderedInput"
        v-model:notes="notes"
        v-model:checkout-type="checkoutType"
        :payment-method-options="paymentMethodOptions"
        :is-cash="isCash"
        :is-refund-mode="isRefundMode"
        :change="change"
        :cart-total="cartTotal"
        :can-submit="canSubmit"
        :submitting="submitting"
        class="pos-panel-wrap__col"
        @clear="resetCart"
        @submit="submit"
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
        <el-table-column label="方式" width="70" align="center">
          <template #default="{ row }">{{ row.payment_method }}</template>
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
            v-for="item in lastReceipt.items || []"
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

    <POSReceipt :receipt="lastReceipt" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Printer, RefreshRight } from '@element-plus/icons-vue'

import POSCartPanel from '@/components/activity/POSCartPanel.vue'
import POSDailySummaryBar from '@/components/activity/POSDailySummaryBar.vue'
import POSPaymentPanel from '@/components/activity/POSPaymentPanel.vue'
import POSReceipt from '@/components/activity/POSReceipt.vue'
import POSSearchPanel from '@/components/activity/POSSearchPanel.vue'
import { getClassrooms } from '@/api/classrooms'
import { usePOSCheckout } from '@/composables/usePOSCheckout'
import { formatTWD, toChineseAmount } from '@/constants/pos'
import { useAcademicTermStore } from '@/stores/academicTerm'

const props = defineProps({
  onAfterCheckout: { type: Function, default: null },
})

const {
  mode,
  searchQuery,
  classroomFilter,
  overdueOnly,
  searching,
  searchGroups,
  searchRegistrations,
  triggerSearch,
  runSearch,
  checkoutType,
  isRefundMode,
  cart,
  cartTotal,
  removeFromCart,
  toggleCart,
  resetCart,
  paymentMethod,
  paymentMethodOptions,
  isCash,
  tenderedInput,
  notes,
  change,
  canSubmit,
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

const selectedIds = computed(() => cart.value.map((r) => r.id))

function handleToggle(row, studentName) {
  toggleCart(row, studentName)
}

function handleEditAmount({ id, amount }) {
  const target = cart.value.find((r) => r.id === id)
  if (target) target.amount_applied = Number(amount) || 0
}

async function submit() {
  await doSubmit(() => props.onAfterCheckout?.())
}

function formatTime(iso) {
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

const classroomOptions = ref([])
async function loadClassroomOptions() {
  try {
    const res = await getClassrooms({
      school_year: termStore.school_year,
      semester: termStore.semester,
      is_active: true,
    })
    const rows = res.data?.items || res.data || []
    classroomOptions.value = rows.map((c) => c.name).filter(Boolean)
  } catch {
    classroomOptions.value = []
  }
}

// 切學期時重新整理搜尋結果與日結（交易記錄本就按日期不按學期過濾）
watch(
  () => [termStore.school_year, termStore.semester],
  () => {
    cart.value = []
    classroomFilter.value = ''
    loadClassroomOptions()
    runSearch()
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
  grid-template-columns: 1.2fr 1fr 1fr;
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
  color: #475569;
}

.pos-panel-wrap__receipt-row--lg {
  font-size: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 4px;
}

.pos-panel-wrap__receipt-row--small {
  font-size: 12px;
  font-style: italic;
  color: #94a3b8;
  margin-top: -6px;
}

.pos-panel-wrap__receipt-row--small em {
  font-style: normal;
}

.pos-panel-wrap__receipt-row strong {
  color: #1e293b;
  font-size: 16px;
}

.pos-panel-wrap__change {
  color: #059669 !important;
  font-size: 18px !important;
}

.pos-panel-wrap__receipt-items {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed #e2e8f0;
  font-size: 13px;
  color: #475569;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

@media (max-width: 1200px) {
  .pos-panel-wrap__body {
    grid-template-columns: 1fr;
  }
  .pos-panel-wrap__col {
    min-height: 420px;
  }
}
</style>
