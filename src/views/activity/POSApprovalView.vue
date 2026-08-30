<template>
  <div class="pos-approval">
    <PageHeader :title="PAGE_TERMS.activityPosApproval" subtitle="日結：老闆核對單日流水後簽核；學期對帳：跨學期檢視繳費與簽核狀況">
      <template #actions>
        <el-button
          v-if="canApprove"
          size="small"
          @click="$router.push('/activity/audit/pos-unlock')"
        >
          異常稽核軌跡
        </el-button>
      </template>
    </PageHeader>

    <el-tabs v-model="activeTab" class="pos-approval__tabs">
      <el-tab-pane label="日結簽核" name="daily">
    <div class="pos-approval__body">
      <el-card class="pos-approval__pane" shadow="never" v-loading="loadingPending">
        <template #header>
          <div class="pos-approval__pane-head">
            <span>待簽核日期</span>
            <el-tag v-if="pending.length" type="warning" size="small">
              {{ pending.length }} 日待處理
            </el-tag>
          </div>
        </template>

        <!--
          區間外積壓提示：預設只查近 30 天，更早的未簽核日在畫面上完全消失，
          老闆會誤以為「全部簽完了」。後端另以獨立 aggregate 回傳區間起點之前的
          未簽核天數與最早日期（不受 92 天上限）。
        -->
        <div
          v-if="pendingMeta.older_pending_count > 0"
          class="pos-approval__older-pending"
        >
          <span>
            另有 {{ pendingMeta.older_pending_count }} 天更早的未簽核日（最早
            {{ pendingMeta.oldest_pending_date }}）
          </span>
          <el-button size="small" link type="primary" @click="widenPendingRange">
            放寬查詢區間
          </el-button>
        </div>

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
          <!--
            不用 v-model：切換日期會清空表單，需先過 requestDateChange 的髒值守衛。
            取消時 selectedDate 不變 → el-date-picker 的 modelValue watcher 不會觸發、
            內部顯示會停在使用者剛選的日期；靠 :key 重掛把顯示拉回真正的 selectedDate。
          -->
          <el-date-picker
            :key="`${selectedDate}#${pickerNonce}`"
            :model-value="selectedDate"
            @update:model-value="requestDateChange"
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
            <span class="pos-approval__pane-tags">
              <!-- 一天被解鎖重簽過幾次，原本畫面完全看不出來 -->
              <el-tag v-if="historyCount > 0" type="warning" size="small">
                本日曾解鎖 {{ historyCount }} 次
              </el-tag>
              <el-tag
                v-if="detail"
                :type="detail.status === 'approved' ? 'success' : 'info'"
                size="small"
              >
                {{ detail.status === 'approved' ? '已簽核' : '未簽核' }}
              </el-tag>
            </span>
          </div>
        </template>

        <div v-if="detail" class="pos-approval__detail">
          <StatStrip :items="detailStripItems" />

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
            <template v-else>
              <AdminListToolbar
                v-model:search="txSearch"
                search-placeholder="搜尋學生姓名或收據編號"
                :total="txTotal"
                :shown="txShown"
              />
              <el-table
                :data="filteredTransactions"
                size="small"
                :max-height="260"
              >
                <template #empty>
                  <el-empty description="沒有符合搜尋條件的交易" :image-size="48" />
                </template>
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
            </template>
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
              <el-form-item label="實際現金盤點" :required="cashCountRequired">
                <el-input-number
                  v-model="form.actualCashCount"
                  :min="0"
                  :max="9999999"
                  :step="100"
                  :precision="0"
                  :placeholder="cashCountPlaceholder"
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
                  :disabled="approveDisabled"
                  @click="handleApprove"
                >
                  {{ canApprove ? '確認簽核' : '無簽核權限' }}
                </el-button>
                <el-button @click="resetForm">清除</el-button>
              </el-form-item>
            </el-form>
          </div>
        </div>

        <!--
          本日歷次解鎖前的完整快照（count === 0 時自身不渲染）。
          端點權限與簽核同為 ACTIVITY_PAYMENT_APPROVE，故僅簽核者掛載，
          避免唯讀者每次換日期都打一發必然 403 的請求。
        -->
        <POSCloseHistoryPanel
          v-if="canApprove"
          :close-date="selectedDate"
          :reload-token="historyReloadToken"
          @update:count="historyCount = $event"
        />
      </el-card>
    </div>

    <!-- 近 30 天對帳 -->
    <el-card class="pos-approval__reconciliation" shadow="never" v-loading="loadingRecon">
      <template #header>
        <div class="pos-approval__pane-head">
          <span>近 30 天對帳<em class="pos-approval__pane-hint">（點任一列可切換至該日）</em></span>
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
        class="pos-approval__recon-table"
        @row-click="handleReconRowClick"
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
import { RefreshRight } from '@element-plus/icons-vue'

import PageHeader from '@/components/common/PageHeader.vue'
import { PAGE_TERMS } from '@/constants/moduleTerms'
import POSCloseHistoryPanel from '@/components/activity/POSCloseHistoryPanel.vue'
import POSSemesterReconciliation from '@/components/activity/POSSemesterReconciliation.vue'
import StatStrip, { type StatStripItem } from '@/components/common/StatStrip.vue'
import AdminListToolbar from '@/components/common/AdminListToolbar.vue'
import { useClientTableFilter } from '@/composables'
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
import { todayTaipeiISO, formatDateTimeTW, formatTimeTW } from '@/utils/format'

// 台北基準的「今日 ± n 天」。
// Why: 收銀端與後端的「當日」一律是 Asia/Taipei；utils/format 的 todayISO()/
// offsetISO() 走瀏覽器本地時區，海外或旅行中的裝置會整天位移，對帳區間與
// 「今日簽核」判定就會錯一天。以 todayTaipeiISO() 為錨、用 UTC 曆算推移
// （UTC 無日光節約，純日曆加減不會漂）。
function taipeiOffsetISO(days: number, now: Date = new Date()): string {
  const [y, m, d] = todayTaipeiISO(now).split('-').map(Number)
  const anchor = new Date(Date.UTC(y, m - 1, d))
  anchor.setUTCDate(anchor.getUTCDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${anchor.getUTCFullYear()}-${pad(anchor.getUTCMonth() + 1)}-${pad(anchor.getUTCDate())}`
}

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

const selectedDate = ref(todayTaipeiISO())
const pending = ref<PendingRow[]>([])
const loadingPending = ref(false)
// 待簽核查詢區間（null = 用後端預設近 30 天）；「放寬查詢區間」會把起點推到最早未簽核日
const pendingRange = ref<{ start_date?: string; end_date?: string } | null>(null)
// 區間起點之前的未簽核積壓（後端獨立 aggregate，不受 92 天上限）
const pendingMeta = reactive<{ older_pending_count: number; oldest_pending_date: string | null }>({
  older_pending_count: 0,
  oldest_pending_date: null,
})
// 本日曾被解鎖重簽的次數（由 POSCloseHistoryPanel 回拋）
const historyCount = ref(0)
// 歷史快照面板的重載訊號：面板只 watch closeDate，解鎖後日期沒變就不會重載，
// 於是剛寫下的解鎖原因與解鎖前帳面當場看不到；第一次解鎖時面板更因 count===0
// 自身不渲染，要切走再切回來才會出現（FEAPV-03）。
const historyReloadToken = ref(0)
// 日期選擇器重掛用：取消切換時 selectedDate 沒變，需要靠換 key 把 picker 顯示拉回來
const pickerNonce = ref(0)

const detail = ref<DailyDetail | null>(null)
const loadingDetail = ref(false)
const submitting = ref(false)

const dailyTransactions = ref<Record<string, unknown>[]>([])
const loadingTx = ref(false)

// 客端關鍵字過濾：當日交易明細已全載，學生姓名/收據編號即打即濾。
// 「近 30 天對帳」（reconciliation.items）與「待簽核日期」（pending）皆以日期為
// 彙總維度、無姓名/課程名稱欄，不適用同一套搜尋 recipe，故不納入。
const {
  searchQuery: txSearch,
  filtered: filteredTransactions,
  total: txTotal,
  shown: txShown,
} = useClientTableFilter<Record<string, unknown>>({
  source: () => dailyTransactions.value,
  searchFields: (r) => [
    (r.student_names as string[] | undefined)?.join('、'),
    r.receipt_no as string | undefined,
  ],
})

const reconciliation = reactive<{ items: ReconItem[]; totals: Partial<ReconTotals> }>({ items: [], totals: {} })
const loadingRecon = ref(false)

const form = reactive<{ actualCashCount: number | null; note: string }>({
  actualCashCount: null,
  note: '',
})

// 盤點門檻由後端權威判定（現金毛流量 ≥ 門檻）並以 cash_count_required 回傳。
const cashCountRequired = computed(() => detail.value?.cash_count_required === true)
const cashCountPlaceholder = computed(() =>
  cashCountRequired.value ? '當日現金流量已達門檻，必填' : '可選；不填則不計算差異',
)
// 必填卻沒填 → 直接停用送出鈕，而不是等按下去才被後端 400 擋回。
const cashCountMissing = computed(
  () => cashCountRequired.value && form.actualCashCount == null,
)

// 簽核按鈕停用：無權限 / 送出中 / detail 載入中 / 必填盤點未填皆停用。
// 載入中停用可避免切換日期後、detail 尚未到位時，用舊 context（cashInSystem /
// cash_count_required）誤簽。
const approveDisabled = computed(
  () =>
    !canApprove.value
    || submitting.value
    || loadingDetail.value
    || cashCountMissing.value,
)

// 表單髒值＝主管已經動手填過的盤點金額或備註。切換日期會 resetForm() 把它清掉，
// 因此任何切換路徑都必須先過確認（2026-08-14 審查 P2-08：原本靜默清空）。
const isFormDirty = computed(
  () => form.actualCashCount != null || (form.note || '').trim() !== '',
)

// 與 POS 收銀頁的日結列同一套呈現：退款只在發生時上色，淨額是簽核人核對的錨點
const detailStripItems = computed((): StatStripItem[] => {
  const d = detail.value
  if (!d) return []
  return [
    { label: '收款', value: formatTWD(d.payment_total ?? 0) },
    {
      label: '退款',
      value: formatTWD(d.refund_total ?? 0),
      tone: (d.refund_total ?? 0) > 0 ? 'warning' : undefined,
    },
    { label: '淨額', value: formatTWD(d.net_total ?? 0), emphasis: true },
    { label: '筆數', value: String(d.transaction_count ?? 0) },
  ]
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


// 後端 pending 端點的查詢區間上限（見 api/activity/pos_approval.py 的 92 天守衛），
// 而 oldest_pending_date **不受**該上限。直接送 (oldest, today) 在積壓超過 92 天時
// 必定 400——正好是最需要「放寬查詢區間」的時候（FEAPV-02 / CONTRACT-03）。
// 超過上限時自動分段送出再合併，讓積壓真的看得到、點得到。
const PENDING_RANGE_MAX_DAYS = 92
// 分段數上限（約兩年）。再多就不再往前查，避免一次噴出幾十個請求。
const PENDING_RANGE_MAX_SEGMENTS = 8

/** 以 UTC 曆算推移天數（與 taipeiOffsetISO 同一套做法，避免本地時區偏移）。 */
function isoShiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10)
}

function splitPendingRange(
  start: string,
  end: string,
): Array<{ start_date: string; end_date: string }> {
  const segments: Array<{ start_date: string; end_date: string }> = []
  let cursor = start
  while (cursor <= end && segments.length < PENDING_RANGE_MAX_SEGMENTS) {
    const segEnd = isoShiftDays(cursor, PENDING_RANGE_MAX_DAYS)
    segments.push({ start_date: cursor, end_date: segEnd > end ? end : segEnd })
    cursor = isoShiftDays(cursor, PENDING_RANGE_MAX_DAYS + 1)
  }
  return segments
}

// 亂序回應守衛：放寬區間後若在途的預設區間回應才回來，會把清單縮回去，
// 使用者看起來像按鈕沒作用，而 pendingRange 其實已經是放寬值（CRITIC-04）。
let pendingReqSeq = 0

/** 回傳是否成功，供 widenPendingRange 決定要不要還原區間。 */
async function loadPending(): Promise<boolean> {
  const seq = ++pendingReqSeq
  loadingPending.value = true
  try {
    const range = pendingRange.value
    const segments =
      range?.start_date && range?.end_date
        ? splitPendingRange(range.start_date, range.end_date)
        : null
    const responses = await Promise.all(
      (segments || [range || undefined]).map((seg) => getPOSDailyClosePending(seg)),
    )
    if (seq !== pendingReqSeq) return true // 已有更新的請求發出，此為過時回應 → 丟棄

    type PendingPayload = {
      pending?: PendingRow[]
      older_pending_count?: number
      oldest_pending_date?: string | null
    }
    const first = responses[0]?.data as PendingPayload
    if (!segments || segments.length === 1) {
      // 單段：行為與分段改動前逐字相同（含後端回傳的排序）。
      pending.value = first?.pending || []
    } else {
      const merged = new Map<string, PendingRow>()
      for (const res of responses) {
        for (const row of ((res.data as PendingPayload)?.pending || [])) {
          merged.set(row.date, row)
        }
      }
      pending.value = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date))
    }
    // 「還有更早」的線索只在**最早那一段**才有意義：後段的起點本來就比較晚，
    // 拿它的值會把真正的線索覆蓋掉。
    pendingMeta.older_pending_count = first?.older_pending_count ?? 0
    pendingMeta.oldest_pending_date = first?.oldest_pending_date ?? null
    return true
  } catch (err) {
    if (seq !== pendingReqSeq) return false
    ElMessage.error((err as ApiErr)?.response?.data?.detail || '讀取待簽核日期失敗')
    return false
  } finally {
    if (seq === pendingReqSeq) loadingPending.value = false
  }
}

// 一鍵把查詢起點推到最早的未簽核日，讓區間外的積壓真的看得到、點得到。
async function widenPendingRange() {
  const oldest = pendingMeta.oldest_pending_date
  if (!oldest) return
  const previous = pendingRange.value
  pendingRange.value = { start_date: oldest, end_date: todayTaipeiISO() }
  const ok = await loadPending()
  // 失敗就把區間還原。否則 pendingRange 卡在無效值，之後每次簽核／解鎖後的
  // refreshAll 都再失敗一次，待簽核清單凍結在舊資料還每次多彈一個錯誤 toast，
  // 直到整頁重新整理。
  if (!ok) pendingRange.value = previous
}

// 亂序回應守衛（request sequence guard）：快速切換 selectedDate 時，舊日期的慢回應
// 可能晚於新日期回來，若無守衛會覆蓋新日 detail / cashInSystem，主管遂看到 A 日
// 現金卻把盤點金額送去簽核 B 日（送出用的是當前 selectedDate）。每次載入自增序號，
// 回應到位時僅當序號仍為最新才套用，否則丟棄過時回應。
let detailReqSeq = 0
// 當日交易明細的顯示上限（後端 getPOSRecentTransactions 的 limit）。達到上限時
// 必須提示明細不完整——主管是看著這張表決定要不要凍結日結 snapshot 的。
const DAILY_TX_LIMIT = 100

let txReqSeq = 0

async function loadDetail() {
  if (!selectedDate.value) return
  const seq = ++detailReqSeq
  loadingDetail.value = true
  try {
    const res = await getPOSDailyCloseStatus(selectedDate.value)
    if (seq !== detailReqSeq) return // 已有更新的請求發出，此為過時回應 → 丟棄
    detail.value = res.data as DailyDetail
    if (detail.value?.status === 'approved') {
      resetForm()
    }
  } catch (err) {
    if (seq !== detailReqSeq) return
    detail.value = null
    ElMessage.error((err as ApiErr)?.response?.data?.detail || '讀取簽核狀態失敗')
  } finally {
    // 僅最新請求可解除 loading，避免過時請求提早把 loading 態關掉
    if (seq === detailReqSeq) loadingDetail.value = false
  }
}

async function loadDailyTransactions() {
  if (!selectedDate.value) return
  const seq = ++txReqSeq
  loadingTx.value = true
  try {
    const res = await getPOSRecentTransactions({
      date: selectedDate.value,
      limit: DAILY_TX_LIMIT,
      include_system: true,
    })
    if (seq !== txReqSeq) return
    const list = (res.data as { transactions?: Record<string, unknown>[] })?.transactions || []
    dailyTransactions.value = list
    // 2026-07-31 稽核：明細有硬上限而畫面無任何提示，與同頁「筆數」統計卡對不上時
    // 主管會以為是統計錯了；更糟的是可能只看了部分流水就把日結 snapshot 凍結。
    if (list.length >= DAILY_TX_LIMIT) {
      ElMessage.warning(
        `當日交易筆數已達顯示上限 ${DAILY_TX_LIMIT} 筆，以下明細可能不完整；請以上方「筆數」統計為準`,
      )
    }
  } catch (err) {
    if (seq !== txReqSeq) return
    dailyTransactions.value = []
    ElMessage.error((err as ApiErr)?.response?.data?.detail || '讀取當日交易失敗')
  } finally {
    if (seq === txReqSeq) loadingTx.value = false
  }
}

async function loadReconciliation() {
  loadingRecon.value = true
  try {
    const res = await getPOSReconciliation(taipeiOffsetISO(-29), todayTaipeiISO())
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

/**
 * 所有「切換 selectedDate」的路徑都走這裡。
 *
 * watch(selectedDate) 會 resetForm()，主管已填的盤點金額與備註會被清空；原本
 * 點一下對帳表就靜默清掉，連個提示都沒有（2026-08-14 審查 P2-08）。
 */
async function requestDateChange(next: unknown) {
  const date = typeof next === 'string' ? next : ''
  if (!date || date === selectedDate.value) return
  if (isFormDirty.value) {
    try {
      await ElMessageBox.confirm(
        `切換到 ${date} 會清空已填的盤點金額與備註，確定要切換嗎？`,
        '尚未送出的簽核輸入',
        {
          type: 'warning',
          confirmButtonText: '切換並清空',
          cancelButtonText: '留在原日期',
        },
      )
    } catch {
      // 取消：日期不動，但 el-date-picker 內部已顯示新日期 → 換 key 逼它重掛回舊值
      pickerNonce.value += 1
      return
    }
  }
  selectedDate.value = date
}

function handlePendingSelect(row: PendingRow | null) {
  if (row?.date) requestDateChange(row.date)
}

function handleReconRowClick(row: ReconItem) {
  if (row?.date) requestDateChange(row.date)
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

  // 簽核「當日」的後果比補簽昨日嚴重得多：當下起所有 POS 收款與自動沖帳都會被擋，
  // 且簽核人自己不能解鎖（4-eye）。因此改為明確 opt-in，後端亦要求 confirm_close_today。
  const isToday = selectedDate.value === todayTaipeiISO()
  if (isToday) {
    try {
      await ElMessageBox.confirm(
        `${selectedDate.value} 就是今天。簽核當日將立即擋住後續所有 POS 收款與自動沖帳，`
          + '且你本人無法自行解鎖（須由其他簽核者解鎖）。\n\n'
          + '若今天還會有收款，請改在營業結束後再簽核。',
        '確認要簽核「今天」？',
        {
          type: 'warning',
          confirmButtonText: '我了解，仍要簽核今日',
          cancelButtonText: '取消',
        },
      )
    } catch {
      return
    }
  }

  submitting.value = true
  try {
    const { data } = await approvePOSDailyClose(selectedDate.value, {
      note: form.note || null,
      actual_cash_count: cash == null ? null : Number(cash),
      // 樂觀鎖：把「你送出時看到的帳」一併帶上，帳在檢視期間被改動時後端回 409，
      // 不會讓主管把已經對不上的 snapshot 凍結掉。
      expected_net_total: detail.value?.net_total ?? null,
      expected_transaction_count: detail.value?.transaction_count ?? null,
      confirm_close_today: isToday,
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
    const e = err as ApiErr & { response?: { status?: number } }
    const status = e?.response?.status
    const detailMsg = e?.response?.data?.detail
    // 失敗後畫面原本停在「還可以再按一次送出」的舊表單上（P3-03）；一律重載狀態，
    // 讓主管看到的是最新的帳與簽核狀態。
    await loadDetail()
    if (status === 409) {
      const alreadyApproved = detail.value?.status === 'approved'
      const body = alreadyApproved
        ? `該日已由他人簽核（簽核人 ${detail.value?.approver_username || '—'}），已為你重新載入最新狀態。`
        : '帳目在你檢視期間有變動，本次簽核未送出。\n\n'
          + `${detailMsg || ''}\n\n`
          + '已為你重新載入最新狀態，請重新核對後再簽核。'
      await ElMessageBox.alert(body, '簽核未完成', {
        type: 'warning',
        confirmButtonText: '了解',
      }).catch(() => {})
    } else {
      ElMessage.error(detailMsg || '簽核失敗')
    }
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
    // 解鎖前帳面 snapshot 與剛寫下的原因要立刻看得到，作為重簽前的比對基準。
    historyReloadToken.value += 1
    await refreshAll()
  } catch (err) {
    ElMessage.error((err as ApiErr)?.response?.data?.detail || '解鎖失敗')
    // 解鎖失敗同樣要重載：可能是別人已先解鎖／已重簽，畫面不可停在舊狀態（P3-03）。
    await loadDetail()
  } finally {
    submitting.value = false
  }
}

watch(selectedDate, () => {
  // 先清空表單，避免前一個日期輸入的盤點金額/備註串到新日期送出，
  // 污染日結 snapshot 的 actual_cash_count / cash_variance / note。
  resetForm()
  // 立即清空前一日的 detail / 交易列表，避免新日載入期間仍顯示舊日現金資料
  // （配合 loadDetail / loadDailyTransactions 的序號守衛，杜絕舊日資料誤導簽核）。
  detail.value = null
  dailyTransactions.value = []
  // 前一天的解鎖次數不可掛在新日期上：子元件 load 完成前，卡頭會短暫顯示
  // 「本日曾解鎖 N 次」指著一個根本沒被解鎖過的日期。
  historyCount.value = 0
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

.pos-approval__pane-tags {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pos-approval__pane-hint {
  font-style: normal;
  font-weight: 400;
  font-size: 12px;
  color: var(--text-secondary);
}

.pos-approval__older-pending {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--color-warning);
  background: var(--bg-color-soft);
  border-radius: 6px;
  padding: 6px 10px;
  margin-bottom: 8px;
}

/* 對帳表整列可點（點列＝切換至該日），沒有游標提示時使用者不會知道 */
.pos-approval__recon-table :deep(.el-table__row) {
  cursor: pointer;
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

/* 警示文字一律走 *-darker（a11y.css 的 html.dark 已翻成亮階）。*-hover 是互動態
   token、dark 刻意未覆寫，當文字色用在深色底只有 2.5–3.6:1——這裡承載的是盤點差額
   與退費風險提示，看不清等於簽核放行（P3-10）。守衛見
   components/activity/__tests__/POSDarkContrast.test.ts。 */
.pos-approval__info-row--danger strong {
  color: var(--color-danger-darker);
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
  color: var(--color-danger-darker);
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
  color: var(--color-danger-darker);
  font-weight: 600;
}

@media (max-width: 1000px) {
  .pos-approval__body {
    grid-template-columns: 1fr;
  }
}
</style>
