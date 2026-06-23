<template>
  <div class="pos-approval">
    <PageHeader title="POS 收款簽核" subtitle="日結：老闆核對單日流水後簽核；學期對帳：跨學期檢視繳費與簽核狀況" />

    <div class="pos-approval__audit-link">
      <el-button
        v-if="canApprove"
        size="small"
        :icon="Warning"
        @click="$router.push('/activity/audit/pos-unlock')"
      >
        異常稽核軌跡
      </el-button>
    </div>

    <el-tabs v-model="activeTab" class="pos-approval__tabs">
      <el-tab-pane label="日結簽核" name="daily">
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
              :type="detail.status === 'approved' ? 'success' : 'info'"
              size="small"
            >
              {{ detail.status === 'approved' ? '已簽核' : '未簽核' }}
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

          <div class="pos-approval__tx-block" v-loading="loadingTx">
            <div class="pos-approval__tx-head">
              <span>當日交易明細 ({{ dailyTransactions.length }})</span>
              <el-button size="small" :icon="RefreshRight" link @click="loadDailyTransactions">
                重新整理
              </el-button>
            </div>
            <el-empty
              v-if="!loadingTx && dailyTransactions.length === 0"
              description="當日無交易"
              :image-size="48"
            />
            <el-table
              v-else
              :data="dailyTransactions"
              size="small"
              :max-height="260"
            >
              <el-table-column type="expand">
                <template #default="{ row }">
                  <div class="pos-approval__tx-items">
                    <div
                      v-for="(item, idx) in row.items || []"
                      :key="idx"
                      class="pos-approval__tx-item"
                    >
                      <span>
                        {{ item.student_name }}
                        <em v-if="item.class_name">（{{ item.class_name }}）</em>
                      </span>
                      <strong>{{ formatTWD(item.amount_applied) }}</strong>
                    </div>
                    <div v-if="row.notes" class="pos-approval__tx-note">
                      備註：{{ row.notes }}
                    </div>
                    <div v-if="row.operator" class="pos-approval__tx-note">
                      經手人：{{ row.operator }}
                    </div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="時間" width="72">
                <template #default="{ row }">{{ formatTimeTW(row.created_at) }}</template>
              </el-table-column>
              <el-table-column label="收據編號" min-width="200">
                <template #default="{ row }">
                  <code v-if="row.source !== 'system'">{{ row.receipt_no }}</code>
                  <el-tag v-else type="info" size="small" effect="plain">
                    系統沖帳
                  </el-tag>
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
            </el-table>
          </div>

          <!-- 已簽核：展示結果 + 解鎖按鈕 -->
          <div v-if="detail.status === 'approved'" class="pos-approval__approved">
            <div class="pos-approval__info-row">
              <span>簽核人</span>
              <strong>{{ detail.approver_username || '—' }}</strong>
            </div>
            <div class="pos-approval__info-row">
              <span>簽核時間</span>
              <strong>{{ formatDateTimeTW(detail.approved_at) }}</strong>
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
              :disabled="submitting"
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
                  :disabled="!canApprove || submitting"
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
            <el-tag :type="row.status === 'approved' ? 'success' : 'info'" size="small">
              {{ row.status === 'approved' ? '已簽核' : '未簽核' }}
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
      </el-tab-pane>

      <el-tab-pane label="學期對帳" name="semester" lazy>
        <POSSemesterReconciliation />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Money,
  RefreshLeft,
  RefreshRight,
  Tickets,
  Wallet,
  Warning,
} from '@element-plus/icons-vue'

import PageHeader from '@/components/common/PageHeader.vue'
import POSSemesterReconciliation from '@/components/activity/POSSemesterReconciliation.vue'
import StatCard from '@/components/common/StatCard.vue'
import { CASH_METHOD, formatTWD } from '@/constants/pos'
import {
  approvePOSDailyClose,
  getPOSDailyClosePending,
  getPOSDailyCloseStatus,
  getPOSReconciliation,
  getPOSRecentTransactions,
  unlockPOSDailyClose,
} from '@/api/activity'
import { getUserInfo, hasPermission } from '@/utils/auth'
import { todayISO, offsetISO, formatDateTimeTW, formatTimeTW } from '@/utils/format'

type ApiErr = { response?: { data?: { detail?: string } } }

type PosApprovalStatus = 'approved' | 'pending'
interface DailyDetail {
  status?: PosApprovalStatus; approver_username?: string; approved_at?: string
  actual_cash_count?: number | null; cash_variance?: number | null; note?: string
  payment_total?: number; refund_total?: number; net_total?: number; transaction_count?: number
  by_method?: Record<string, number>
  // 後端權威的盤點門檻判定（現金毛流量 ≥ 門檻）；前端據此決定 actual_cash_count 是否必填
  cash_count_required?: boolean
}
interface PendingRow { date: string; transaction_count?: number; payment_total?: number; refund_total?: number; net_total?: number }
interface ReconItem { date: string; status?: PosApprovalStatus; transaction_count?: number; payment_total?: number; refund_total?: number; net_total?: number; expected_cash?: number; actual_cash?: number | null; variance?: number | null }
interface ReconTotals { payment_total?: number; refund_total?: number; net_total?: number; variance_total?: number | null }

const canApprove = computed(() => hasPermission('ACTIVITY_PAYMENT_APPROVE'))

const activeTab = ref('daily')

const selectedDate = ref(todayISO())
const pending = ref<PendingRow[]>([])
const loadingPending = ref(false)

const detail = ref<DailyDetail | null>(null)
const loadingDetail = ref(false)
const submitting = ref(false)

const dailyTransactions = ref<Record<string, unknown>[]>([])
const loadingTx = ref(false)

const reconciliation = reactive<{ items: ReconItem[]; totals: Partial<ReconTotals> }>({ items: [], totals: {} })
const loadingRecon = ref(false)

const form = reactive<{ actualCashCount: number | null; note: string }>({
  actualCashCount: null,
  note: '',
})

const methodEntries = computed((): [string, number][] => {
  if (!detail.value || !detail.value.by_method) return []
  return (Object.entries(detail.value.by_method) as [string, number][]).sort((a, b) => a[0].localeCompare(b[0]))
})

const cashInSystem = computed(() => detail.value?.by_method?.[CASH_METHOD] ?? 0)

const cashVariancePreview = computed(() => {
  const v = form.actualCashCount
  if (v === null || v === undefined) return null
  return Number(v) - cashInSystem.value
})

function disableFuture(d: Date) {
  return d.getTime() > Date.now()
}

function resetForm() {
  form.actualCashCount = null
  form.note = ''
}


async function loadPending() {
  loadingPending.value = true
  try {
    const res = await getPOSDailyClosePending()
    pending.value = (res.data as { pending?: PendingRow[] })?.pending || []
  } catch (err) {
    ElMessage.error((err as ApiErr)?.response?.data?.detail || '讀取待簽核日期失敗')
  } finally {
    loadingPending.value = false
  }
}

async function loadDetail() {
  if (!selectedDate.value) return
  loadingDetail.value = true
  try {
    const res = await getPOSDailyCloseStatus(selectedDate.value)
    detail.value = res.data as DailyDetail
    if (detail.value?.status === 'approved') {
      resetForm()
    }
  } catch (err) {
    detail.value = null
    ElMessage.error((err as ApiErr)?.response?.data?.detail || '讀取簽核狀態失敗')
  } finally {
    loadingDetail.value = false
  }
}

async function loadDailyTransactions() {
  if (!selectedDate.value) return
  loadingTx.value = true
  try {
    const res = await getPOSRecentTransactions({
      date: selectedDate.value,
      limit: 100,
      include_system: true,
    })
    dailyTransactions.value = (res.data as { transactions?: Record<string, unknown>[] })?.transactions || []
  } catch (err) {
    dailyTransactions.value = []
    ElMessage.error((err as ApiErr)?.response?.data?.detail || '讀取當日交易失敗')
  } finally {
    loadingTx.value = false
  }
}

async function loadReconciliation() {
  loadingRecon.value = true
  try {
    const res = await getPOSReconciliation(offsetISO(-29), todayISO())
    reconciliation.items = (res.data as { items?: ReconItem[] })?.items || []
    reconciliation.totals = (res.data as { totals?: Partial<ReconTotals> })?.totals || {}
  } catch (err) {
    ElMessage.error((err as ApiErr)?.response?.data?.detail || '讀取對帳資料失敗')
  } finally {
    loadingRecon.value = false
  }
}

async function refreshAll() {
  await Promise.all([
    loadPending(),
    loadDetail(),
    loadDailyTransactions(),
    loadReconciliation(),
  ])
}

function handlePendingSelect(row: PendingRow | null) {
  if (row?.date) selectedDate.value = row.date
}

async function handleApprove() {
  if (!canApprove.value) return
  const cash = form.actualCashCount
  // 盤點門檻由後端權威判定（現金毛流量 ≥ 門檻）並透過 cash_count_required 回傳，
  // 前端據此決定是否必填，不再用淨額自行推算 — 否則退款壓低淨額時前端放行、
  // 後端用毛流量擋，老闆會在確認後才被 400。
  if (detail.value?.cash_count_required && cash == null) {
    ElMessage.warning('當日現金流量已達盤點門檻，必須填寫實際現金盤點金額')
    return
  }
  const variance = cash == null ? null : Number(cash) - cashInSystem.value
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
    const { data } = await approvePOSDailyClose(selectedDate.value, {
      note: form.note || null,
      actual_cash_count: cash == null ? null : Number(cash),
    })
    const approveData = data as { warnings?: string[] }
    const warnings = approveData?.warnings || []
    warnings.forEach((w) => {
      ElMessage.warning({ message: w, duration: 6000, showClose: true })
    })
    ElMessage.success('簽核完成')
    resetForm()
    await refreshAll()
  } catch (err) {
    ElMessage.error((err as ApiErr)?.response?.data?.detail || '簽核失敗')
  } finally {
    submitting.value = false
  }
}

async function handleUnlock() {
  if (!canApprove.value) return

  const userInfo = getUserInfo() as { username?: string; role?: string } | null
  const myUsername = userInfo?.username || ''
  const myRole = userInfo?.role || ''
  const originalApprover = detail.value?.approver_username || ''

  const isOriginal = myUsername && myUsername === originalApprover
  const isAdmin = myRole === 'admin'

  // 分支 1：非原簽核人 → 一般 4-eye 路徑
  if (!isOriginal) {
    return doUnlock({ isOverride: false, minLen: 10 })
  }

  // 分支 2：原簽核人但非 admin → 擋下並提示
  if (!isAdmin) {
    ElMessageBox.alert(
      `您是原簽核人 ${originalApprover}；解鎖必須由其他簽核者執行。\n\n` +
        '若情況緊急且具備管理員身分，請聯繫系統管理員協助 override。',
      '無法解鎖',
      { type: 'warning', confirmButtonText: '了解' }
    ).catch(() => {})
    return
  }

  // 分支 3：原簽核人 + admin → override 路徑（雙確認 + 30 字 reason）
  try {
    await ElMessageBox.confirm(
      '⚠️ 您是原簽核人；以管理員身分 override 解鎖會寫入特殊稽核紀錄並 LINE 通知您自己。\n\n' +
        '建議優先請其他簽核者解鎖；override 應僅用於對方不在的緊急情況。',
      'Admin Override 解鎖',
      {
        confirmButtonText: '我了解，繼續 override',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
  } catch {
    return
  }

  return doUnlock({ isOverride: true, minLen: 30 })
}

async function doUnlock({ isOverride, minLen }: { isOverride: boolean; minLen: number }) {
  let reason: string
  try {
    const res = (await ElMessageBox.prompt(
      `請輸入解鎖原因（≥ ${minLen} 字）：`,
      isOverride ? 'Override 原因' : '解鎖原因',
      {
        inputType: 'textarea',
        confirmButtonText: '確認解鎖',
        cancelButtonText: '取消',
        inputValidator: (v: string) =>
          (v || '').trim().length >= minLen || `至少 ${minLen} 字`,
      }
    )) as { value: string }
    reason = (res.value || '').trim()
  } catch {
    return
  }

  submitting.value = true
  try {
    const { data } = await unlockPOSDailyClose(selectedDate.value, {
      reason,
      is_admin_override: isOverride,
    })
    const unlockData = data as { notification_delivered?: boolean; live_diff?: Record<string, number> }
    ElMessage.success(isOverride ? '已 override 解鎖；通知已發送' : '已解鎖')
    if (unlockData && unlockData.notification_delivered === false) {
      ElMessage.warning({
        message: '原簽核人未綁定 LINE，未收到自動通知；請私下告知對方。',
        duration: 6000,
      })
    }
    // spec H2: 顯示實況 vs 簽核當下 snapshot 差異，幫解鎖人理解「為什麼帳變了」
    const diff = unlockData?.live_diff
    if (diff) {
      const hasDelta =
        diff.payment_total_diff !== 0 ||
        diff.refund_total_diff !== 0 ||
        diff.transaction_count_diff !== 0
      if (hasDelta) {
        const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`)
        const lines = [
          `📊 簽核當下 snapshot vs 解鎖當下實況差異：`,
          `• 收款 NT$${diff.original_payment_total} → NT$${diff.live_payment_total}（${sign(diff.payment_total_diff)}）`,
          `• 退款 NT$${diff.original_refund_total} → NT$${diff.live_refund_total}（${sign(diff.refund_total_diff)}）`,
          `• 淨額 NT$${diff.original_net_total} → NT$${diff.live_net_total}（${sign(diff.net_total_diff)}）`,
          `• 筆數 ${diff.original_transaction_count} → ${diff.live_transaction_count}（${sign(diff.transaction_count_diff)}）`,
        ]
        ElMessageBox.alert(lines.join('\n'), '解鎖後實況差異', {
          confirmButtonText: '了解',
          type: 'info',
          customClass: 'pos-approval__diff-alert',
        }).catch(() => {})
      }
    }
    await refreshAll()
  } catch (err) {
    ElMessage.error((err as ApiErr)?.response?.data?.detail || '解鎖失敗')
  } finally {
    submitting.value = false
  }
}

watch(selectedDate, () => {
  loadDetail()
  loadDailyTransactions()
})

onMounted(refreshAll)
</script>

<style scoped>
.pos-approval {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pos-approval__audit-link {
  margin-bottom: 4px;
  display: flex;
  justify-content: flex-end;
}

.pos-approval__tabs :deep(.el-tabs__content) {
  padding-top: 4px;
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
  color: var(--text-secondary);
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
  color: var(--text-secondary);
}

.pos-approval__method-tag {
  background: var(--bg-color-soft);
  padding: 4px 10px;
  border-radius: 999px;
}

.pos-approval__approved,
.pos-approval__form {
  background: var(--bg-color);
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
  color: var(--neutral-600);
}

.pos-approval__info-row em {
  font-style: normal;
  color: var(--text-secondary);
}

.pos-approval__info-row--danger strong {
  color: var(--color-danger-hover);
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
  color: var(--text-secondary);
}

.pos-approval__hint--danger {
  color: var(--color-danger-hover);
}

.pos-approval__tx-block {
  background: var(--neutral-0);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px 12px;
}

.pos-approval__tx-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  font-size: 13px;
  color: var(--neutral-600);
  margin-bottom: 8px;
}

.pos-approval__tx-items {
  padding: 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--neutral-600);
}

.pos-approval__tx-item {
  display: flex;
  justify-content: space-between;
}

.pos-approval__tx-item em {
  font-style: normal;
  color: var(--text-tertiary);
  font-size: 12px;
}

.pos-approval__tx-note {
  font-size: 12px;
  color: var(--text-secondary);
  border-top: 1px dashed var(--border-color);
  padding-top: 4px;
  margin-top: 4px;
}

.pos-approval__reconciliation {
  margin-top: 4px;
}

.pos-approval__recon-totals {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--neutral-600);
  padding: 10px 4px 0;
  border-top: 1px dashed var(--border-color);
  margin-top: 8px;
}

.pos-approval__variance {
  color: var(--color-danger-hover);
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
