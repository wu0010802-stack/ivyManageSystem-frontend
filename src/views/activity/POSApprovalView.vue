<template>
  <div class="pos-approval">
    <PageHeader title="POS 收款簽核" subtitle="老闆每日核對 POS 流水後簽核，凍結 snapshot 供稽核" />

    <div class="pos-approval__body">
      <el-card class="pos-approval__pane" shadow="never">
        <template #header>
          <div class="pos-approval__pane-head">
            <span>待簽核日期</span>
            <el-tag v-if="pending.length" type="warning" size="small">
              {{ pending.length }} 日待處理
            </el-tag>
          </div>
        </template>

        <el-empty
          v-if="!loadingPending && pending.length === 0"
          description="區間內沒有待簽核的日期"
          :image-size="60"
        />
        <el-table
          v-else
          :data="pending"
          size="small"
          :max-height="360"
          highlight-current-row
          @current-change="handlePendingSelect"
        >
          <el-table-column label="日期" prop="date" width="110" />
          <el-table-column label="筆數" prop="transaction_count" width="70" align="right" />
          <el-table-column label="收款" width="110" align="right">
            <template #default="{ row }">{{ formatTWD(row.payment_total) }}</template>
          </el-table-column>
          <el-table-column label="退款" width="110" align="right">
            <template #default="{ row }">{{ formatTWD(row.refund_total) }}</template>
          </el-table-column>
          <el-table-column label="淨額" width="110" align="right">
            <template #default="{ row }">
              <strong>{{ formatTWD(row.net_total) }}</strong>
            </template>
          </el-table-column>
        </el-table>

        <el-divider />

        <div class="pos-approval__jump">
          <span class="pos-approval__field-label">指定日期：</span>
          <el-date-picker
            v-model="selectedDate"
            type="date"
            value-format="YYYY-MM-DD"
            :clearable="false"
            :disabled-date="disableFuture"
            size="small"
          />
        </div>
      </el-card>

      <el-card class="pos-approval__pane" shadow="never" v-loading="loadingDetail">
        <template #header>
          <div class="pos-approval__pane-head">
            <span>{{ selectedDate }} 簽核狀態</span>
            <el-tag
              v-if="detail"
              :type="detail.is_approved ? 'success' : 'info'"
              size="small"
            >
              {{ detail.is_approved ? '已簽核' : '未簽核' }}
            </el-tag>
          </div>
        </template>

        <div v-if="detail" class="pos-approval__detail">
          <div class="pos-approval__stat-grid">
            <StatCard
              label="收款"
              :value="formatTWD(detail.payment_total)"
              :icon="Money"
              color="success"
              variant="filled"
            />
            <StatCard
              label="退款"
              :value="formatTWD(detail.refund_total)"
              :icon="RefreshLeft"
              color="warning"
              variant="filled"
            />
            <StatCard
              label="淨額"
              :value="formatTWD(detail.net_total)"
              :icon="Wallet"
              color="primary"
              variant="filled"
            />
            <StatCard
              label="筆數"
              :value="String(detail.transaction_count)"
              :icon="Tickets"
              color="info"
              variant="filled"
            />
          </div>

          <div v-if="methodEntries.length" class="pos-approval__methods">
            <span
              v-for="[method, amount] in methodEntries"
              :key="method"
              class="pos-approval__method-tag"
            >
              {{ method }} · {{ formatTWD(amount) }}
            </span>
          </div>

          <!-- 已簽核：展示結果 + 解鎖按鈕 -->
          <div v-if="detail.is_approved" class="pos-approval__approved">
            <div class="pos-approval__info-row">
              <span>簽核人</span>
              <strong>{{ detail.approver_username || '—' }}</strong>
            </div>
            <div class="pos-approval__info-row">
              <span>簽核時間</span>
              <strong>{{ formatDateTime(detail.approved_at) }}</strong>
            </div>
            <div v-if="detail.actual_cash_count != null" class="pos-approval__info-row">
              <span>實際現金盤點</span>
              <strong>{{ formatTWD(detail.actual_cash_count) }}</strong>
            </div>
            <div
              v-if="detail.cash_variance != null"
              class="pos-approval__info-row"
              :class="{
                'pos-approval__info-row--danger': detail.cash_variance !== 0,
              }"
            >
              <span>現金差異</span>
              <strong>
                {{ detail.cash_variance > 0 ? '+' : '' }}{{ formatTWD(detail.cash_variance) }}
              </strong>
            </div>
            <div v-if="detail.note" class="pos-approval__info-row">
              <span>備註</span>
              <em>{{ detail.note }}</em>
            </div>

            <el-button
              v-if="canApprove"
              type="danger"
              plain
              :loading="submitting"
              class="pos-approval__action"
              @click="handleUnlock"
            >
              解鎖重簽
            </el-button>
            <el-alert
              v-else
              type="info"
              :closable="false"
              title="您沒有簽核權限，僅可檢視"
              show-icon
            />
          </div>

          <!-- 未簽核：簽核表單 -->
          <div v-else class="pos-approval__form">
            <el-form label-width="120px" label-position="left" size="small">
              <el-form-item label="實際現金盤點">
                <el-input-number
                  v-model="form.actualCashCount"
                  :min="0"
                  :max="9999999"
                  :step="100"
                  :precision="0"
                  placeholder="可選；不填則不計算差異"
                  class="pos-approval__num"
                />
                <div v-if="cashVariancePreview !== null" class="pos-approval__hint">
                  預估差異：
                  <strong :class="cashVariancePreview !== 0 ? 'pos-approval__hint--danger' : ''">
                    {{ cashVariancePreview > 0 ? '+' : '' }}{{ formatTWD(cashVariancePreview) }}
                  </strong>
                  （盤點 - 系統現金 {{ formatTWD(cashInSystem) }}）
                </div>
              </el-form-item>
              <el-form-item label="備註">
                <el-input
                  v-model="form.note"
                  type="textarea"
                  :rows="3"
                  :maxlength="500"
                  show-word-limit
                  placeholder="例：現金差異 -50 係找零誤差"
                />
              </el-form-item>
              <el-form-item>
                <el-button
                  type="primary"
                  :loading="submitting"
                  :disabled="!canApprove"
                  @click="handleApprove"
                >
                  {{ canApprove ? '確認簽核' : '無簽核權限' }}
                </el-button>
                <el-button @click="resetForm">清除</el-button>
              </el-form-item>
            </el-form>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 近 30 天對帳 -->
    <el-card class="pos-approval__reconciliation" shadow="never" v-loading="loadingRecon">
      <template #header>
        <div class="pos-approval__pane-head">
          <span>近 30 天對帳</span>
          <div>
            <el-button size="small" :icon="RefreshRight" @click="loadReconciliation">
              重新整理
            </el-button>
          </div>
        </div>
      </template>
      <el-empty
        v-if="!loadingRecon && reconciliation.items.length === 0"
        description="區間內無交易"
        :image-size="60"
      />
      <el-table
        v-else
        :data="reconciliation.items"
        size="small"
        :max-height="320"
        @row-click="(row) => (selectedDate = row.date)"
      >
        <el-table-column label="日期" prop="date" width="110" />
        <el-table-column label="狀態" width="90">
          <template #default="{ row }">
            <el-tag :type="row.is_approved ? 'success' : 'info'" size="small">
              {{ row.is_approved ? '已簽核' : '未簽核' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="筆數" prop="transaction_count" width="70" align="right" />
        <el-table-column label="收款" width="110" align="right">
          <template #default="{ row }">{{ formatTWD(row.payment_total) }}</template>
        </el-table-column>
        <el-table-column label="退款" width="110" align="right">
          <template #default="{ row }">{{ formatTWD(row.refund_total) }}</template>
        </el-table-column>
        <el-table-column label="淨額" width="110" align="right">
          <template #default="{ row }">
            <strong>{{ formatTWD(row.net_total) }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="系統現金" width="110" align="right">
          <template #default="{ row }">{{ formatTWD(row.expected_cash) }}</template>
        </el-table-column>
        <el-table-column label="實際盤點" width="110" align="right">
          <template #default="{ row }">
            {{ row.actual_cash == null ? '—' : formatTWD(row.actual_cash) }}
          </template>
        </el-table-column>
        <el-table-column label="差異" width="110" align="right">
          <template #default="{ row }">
            <span
              v-if="row.variance != null"
              :class="row.variance !== 0 ? 'pos-approval__variance' : ''"
            >
              {{ row.variance > 0 ? '+' : '' }}{{ formatTWD(row.variance) }}
            </span>
            <span v-else>—</span>
          </template>
        </el-table-column>
      </el-table>
      <div
        v-if="reconciliation.items.length"
        class="pos-approval__recon-totals"
      >
        <span>區間收款：<strong>{{ formatTWD(reconciliation.totals.payment_total) }}</strong></span>
        <span>區間退款：<strong>{{ formatTWD(reconciliation.totals.refund_total) }}</strong></span>
        <span>區間淨額：<strong>{{ formatTWD(reconciliation.totals.net_total) }}</strong></span>
        <span v-if="reconciliation.totals.variance_total != null">
          累計差異：<strong>{{ formatTWD(reconciliation.totals.variance_total) }}</strong>
        </span>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Money,
  RefreshLeft,
  RefreshRight,
  Tickets,
  Wallet,
} from '@element-plus/icons-vue'

import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'
import { CASH_METHOD, formatTWD } from '@/constants/pos'
import {
  approvePOSDailyClose,
  getPOSDailyClosePending,
  getPOSDailyCloseStatus,
  getPOSReconciliation,
  unlockPOSDailyClose,
} from '@/api/activity'
import { hasPermission } from '@/utils/auth'

const canApprove = computed(() => hasPermission('ACTIVITY_PAYMENT_APPROVE'))

function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function offsetISO(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const selectedDate = ref(todayISO())
const pending = ref([])
const loadingPending = ref(false)

const detail = ref(null)
const loadingDetail = ref(false)
const submitting = ref(false)

const reconciliation = reactive({ items: [], totals: {} })
const loadingRecon = ref(false)

const form = reactive({
  actualCashCount: null,
  note: '',
})

const methodEntries = computed(() => {
  if (!detail.value || !detail.value.by_method) return []
  return Object.entries(detail.value.by_method).sort((a, b) => a[0].localeCompare(b[0]))
})

const cashInSystem = computed(() => detail.value?.by_method?.[CASH_METHOD] ?? 0)

const cashVariancePreview = computed(() => {
  const v = form.actualCashCount
  if (v === null || v === undefined || v === '') return null
  return Number(v) - cashInSystem.value
})

function disableFuture(d) {
  return d.getTime() > Date.now()
}

function resetForm() {
  form.actualCashCount = null
  form.note = ''
}

function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-Hant', { hour12: false, timeZone: 'Asia/Taipei' })
}

async function loadPending() {
  loadingPending.value = true
  try {
    const res = await getPOSDailyClosePending()
    pending.value = res.data?.pending || []
  } catch (err) {
    ElMessage.error(err?.response?.data?.detail || '讀取待簽核日期失敗')
  } finally {
    loadingPending.value = false
  }
}

async function loadDetail() {
  if (!selectedDate.value) return
  loadingDetail.value = true
  try {
    const res = await getPOSDailyCloseStatus(selectedDate.value)
    detail.value = res.data
    if (detail.value.is_approved) {
      resetForm()
    }
  } catch (err) {
    detail.value = null
    ElMessage.error(err?.response?.data?.detail || '讀取簽核狀態失敗')
  } finally {
    loadingDetail.value = false
  }
}

async function loadReconciliation() {
  loadingRecon.value = true
  try {
    const res = await getPOSReconciliation(offsetISO(-29), todayISO())
    reconciliation.items = res.data?.items || []
    reconciliation.totals = res.data?.totals || {}
  } catch (err) {
    ElMessage.error(err?.response?.data?.detail || '讀取對帳資料失敗')
  } finally {
    loadingRecon.value = false
  }
}

async function refreshAll() {
  await Promise.all([loadPending(), loadDetail(), loadReconciliation()])
}

function handlePendingSelect(row) {
  if (row?.date) selectedDate.value = row.date
}

async function handleApprove() {
  if (!canApprove.value) return
  const cash = form.actualCashCount
  const variance = cash == null ? null : cash - cashInSystem.value
  const warnMsg =
    variance != null && variance !== 0
      ? `偵測到現金差異 ${variance > 0 ? '+' : ''}${formatTWD(variance)}，仍要簽核嗎？`
      : `確認簽核 ${selectedDate.value} 的 POS 流水？簽核後 snapshot 將被凍結。`
  try {
    await ElMessageBox.confirm(warnMsg, '簽核確認', {
      type: variance != null && variance !== 0 ? 'warning' : 'info',
      confirmButtonText: '確認簽核',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  submitting.value = true
  try {
    await approvePOSDailyClose(selectedDate.value, {
      note: form.note || null,
      actual_cash_count: cash == null ? null : Number(cash),
    })
    ElMessage.success('簽核完成')
    resetForm()
    await refreshAll()
  } catch (err) {
    ElMessage.error(err?.response?.data?.detail || '簽核失敗')
  } finally {
    submitting.value = false
  }
}

async function handleUnlock() {
  if (!canApprove.value) return
  try {
    await ElMessageBox.confirm(
      `確認解鎖 ${selectedDate.value} 的簽核？解鎖後原 snapshot 會失效，需重新簽核。`,
      '解鎖確認',
      { type: 'warning', confirmButtonText: '確認解鎖', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  submitting.value = true
  try {
    await unlockPOSDailyClose(selectedDate.value)
    ElMessage.success('已解鎖')
    await refreshAll()
  } catch (err) {
    ElMessage.error(err?.response?.data?.detail || '解鎖失敗')
  } finally {
    submitting.value = false
  }
}

watch(selectedDate, loadDetail)

onMounted(refreshAll)
</script>

<style scoped>
.pos-approval {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pos-approval__body {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 12px;
  align-items: start;
}

.pos-approval__pane-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.pos-approval__jump {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pos-approval__field-label {
  font-size: 13px;
  color: #64748b;
}

.pos-approval__detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pos-approval__stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.pos-approval__methods {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #64748b;
}

.pos-approval__method-tag {
  background: #f1f5f9;
  padding: 4px 10px;
  border-radius: 999px;
}

.pos-approval__approved,
.pos-approval__form {
  background: #f8fafc;
  padding: 12px 16px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pos-approval__info-row {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: #475569;
}

.pos-approval__info-row em {
  font-style: normal;
  color: #64748b;
}

.pos-approval__info-row--danger strong {
  color: #dc2626;
}

.pos-approval__action {
  align-self: flex-start;
  margin-top: 8px;
}

.pos-approval__num {
  width: 220px;
}

.pos-approval__hint {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
}

.pos-approval__hint--danger {
  color: #dc2626;
}

.pos-approval__reconciliation {
  margin-top: 4px;
}

.pos-approval__recon-totals {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  font-size: 13px;
  color: #475569;
  padding: 10px 4px 0;
  border-top: 1px dashed #e2e8f0;
  margin-top: 8px;
}

.pos-approval__variance {
  color: #dc2626;
  font-weight: 600;
}

@media (max-width: 1000px) {
  .pos-approval__body {
    grid-template-columns: 1fr;
  }
  .pos-approval__stat-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
