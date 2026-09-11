<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="min(820px, 94vw)"
    append-to-body
    data-test="coll-dialog"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <el-skeleton v-if="loading" :rows="4" animated />
    <div v-else-if="loadError" class="state" data-test="coll-error" role="alert">
      <p>載入收款明細失敗</p>
      <el-button size="small" data-test="coll-retry" @click="fetchDetail">重試</el-button>
    </div>
    <template v-else>
      <div v-if="records.length" class="summary" data-test="coll-summary">
        <span>應繳 <strong>{{ formatCurrency(totalDue) }}</strong></span>
        <span>已收 <strong>{{ formatCurrency(totalPaid) }}</strong></span>
        <span :class="{ 'summary__owe': totalDue - totalPaid > 0 }">
          未收 <strong>{{ formatCurrency(Math.max(totalDue - totalPaid, 0)) }}</strong>
        </span>
      </div>
      <p v-else class="state" data-test="coll-none">查無帳款</p>

      <section
        v-for="rec in records"
        :key="rec.record_id"
        class="record"
        data-test="coll-record"
        :data-record="rec.record_id"
      >
        <header class="record__head">
          <span class="record__name">{{ rec.fee_item_name || '費用項目' }}</span>
          <el-tag :type="statusTagType(rec.status)" size="small">
            {{ statusLabel(rec.status) }}
          </el-tag>
          <span class="record__amounts">
            應繳 {{ formatAmount(rec.amount_due) }}・已繳 {{ formatAmount(rec.amount_paid) }}
          </span>
        </header>

        <p v-if="rec.events.length === 0" class="empty" data-test="coll-empty">尚無收款紀錄</p>
        <table v-else class="events">
          <thead>
            <tr>
              <th class="col-when">時間</th>
              <th class="col-what">事件</th>
              <th class="col-amount">金額</th>
              <th class="col-who">經手人</th>
              <th class="col-confirm">確認狀態</th>
              <th class="col-note">備註</th>
              <th v-if="canWrite" class="col-action">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(ev, idx) in rec.events"
              :key="`${rec.record_id}-${idx}`"
              class="event"
              :class="{ 'event--reversal': ev.is_reversal, 'event--negative': ev.amount < 0 }"
              data-test="coll-event"
              :data-kind="ev.kind"
              :data-reversal="ev.is_reversal ? '1' : '0'"
            >
              <td class="col-when" data-label="時間" data-test="coll-when">
                <div>{{ fmtDateTime(ev.occurred_at) }}</div>
                <small v-if="showReceivedDate(ev)" class="muted">收款日 {{ ev.received_date }}</small>
              </td>
              <td class="col-what" data-label="事件" data-test="coll-what">
                <el-tag :type="kindTagType(ev)" size="small" effect="plain">
                  {{ kindLabel(ev) }}
                </el-tag>
              </td>
              <td class="col-amount num" data-label="金額" data-test="coll-amount">
                {{ signedAmount(ev.amount) }}
              </td>
              <td class="col-who" data-label="經手人" data-test="coll-who">
                {{ ev.operator_name || ev.received_by_name || '—' }}
              </td>
              <td class="col-confirm" data-label="確認狀態" data-test="coll-confirm">
                <span v-if="confirmLine(ev).main">{{ confirmLine(ev).main }}</span>
                <span v-else class="muted">—</span>
                <small v-if="confirmLine(ev).sub" class="muted">{{ confirmLine(ev).sub }}</small>
              </td>
              <td class="col-note" data-label="備註" data-test="coll-note">
                <template v-if="noteText(ev)">{{ noteText(ev) }}</template>
                <span v-else class="muted">—</span>
              </td>
              <td v-if="canWrite" class="col-action" data-label="操作" data-test="coll-action">
                <template v-if="reverseTarget(ev)">
                  <el-button
                    size="small"
                    type="danger"
                    text
                    :disabled="handoverLocked(ev)"
                    :loading="reversingKey === reverseKeyOf(ev)"
                    data-test="coll-reverse"
                    @click="reverseEvent(ev)"
                  >
                    沖銷
                  </el-button>
                  <small v-if="handoverLocked(ev)" class="muted">
                    交接已送出，請老闆先 reopen 交接批
                  </small>
                </template>
                <small v-else-if="ev.kind === 'legacy_payment'" class="muted">
                  無收據，請到逐筆明細走退款
                </small>
                <span v-else class="muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">關閉</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 月繳總表「檢視」彈窗（2026-09-05）：一位學生本月所有帳款的資金軌跡。
 *
 * 資料來自 GET /fees/records/collections（一次帶該生本月全部 record_id），
 * 後端已沿 帳款→FeeAllocation→FeeReceipt→（交接批｜銀行交易｜代收明細）鏈攤平成
 * 時間序事件，另附改版前存量繳費流水與真實退款。本元件只負責「事件 → 一列」
 * 的顯示對照：誰收的（經手人）、什麼時候（登錄／媒合時間＋收款日）、走到哪一層
 * 確認（現金：交接批 Maker-Checker 進度；網銀：銀行入帳日／交易時間／摘要）。
 *
 * 寫入動作只有「沖銷」：誤收的更正一律在這裡做，因為這是唯一看得到「是哪一筆」
 * 的地方。依事件來源分派到三條既有端點（現金收據／存摺交易／代收明細），
 * 三者都是 append-only 補正——寫負值分配列並把收據轉 reversed，當日交接批與
 * 關帳金額因此同步退掉。存量未立據流水沒有收據可沖，仍須走逐筆明細的退款。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getFeeRecordCollections,
  reverseCashReceipt,
  reverseCollectionPayment,
  reverseTransaction,
} from '@/api/fees'
import { formatAmount, formatCurrency } from '@/utils/currency'
import { friendlyError } from '@/utils/errorMessages'

type CollectionsOut = Awaited<ReturnType<typeof getFeeRecordCollections>>
type RecordOut = CollectionsOut['records'][number]
type EventOut = RecordOut['events'][number]

const props = defineProps<{
  modelValue: boolean
  recordIds: number[]
  studentName: string
  /** YYYY-MM（月表當前月份，只用於標題） */
  month: string
  /** FEES_WRITE；無權限時整個操作欄不出現 */
  canWrite?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  /** 沖銷成功：父層應重載月表（該生金額與狀態都變了） */
  reversed: []
}>()

const records = ref<RecordOut[]>([])
const loading = ref(false)
const loadError = ref(false)
let requestSeq = 0

const monthLabel = computed(() => {
  const [y, m] = props.month.split('-').map(Number)
  if (!y || !m) return props.month
  return `${y - 1911} 年 ${m} 月`
})

const title = computed(() => `收款明細：${props.studentName || ''}・${monthLabel.value}`)

const totalDue = computed(() => records.value.reduce((a, r) => a + r.amount_due, 0))
const totalPaid = computed(() => records.value.reduce((a, r) => a + r.amount_paid, 0))

async function fetchDetail() {
  const seq = ++requestSeq
  loading.value = true
  loadError.value = false
  try {
    const data = await getFeeRecordCollections(props.recordIds)
    if (seq !== requestSeq) return
    records.value = data.records ?? []
  } catch {
    if (seq !== requestSeq) return
    loadError.value = true
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

// 每次開啟都重抓：同一位學生在對話框關閉期間可能剛被收款／媒合
watch(
  () => [props.modelValue, props.recordIds] as const,
  ([open]) => {
    if (open) fetchDetail()
  },
  { immediate: true },
)

// ─── 沖銷（誤收更正）───────────────────────────────────────────────────────
/** 交接批一旦送出／簽收，後端一律 409；先在畫面停用，並講清楚要老闆做什麼 */
const LOCKED_HANDOVER = new Set(['submitted', 'confirmed'])

const reversingKey = ref('')

/** 這筆事件可沖銷的話，回傳要打哪個端點與對象 id；否則 null */
function reverseTarget(ev: EventOut): { api: 'cash' | 'bank' | 'collection'; id: number } | null {
  if (ev.is_reversal) return null
  if (ev.kind === 'cash') {
    // 已沖銷過的收據再打會 409；沒有 receipt_id 的是存量流水，沒東西可沖
    if (!ev.receipt_id || ev.receipt_status !== 'confirmed') return null
    return { api: 'cash', id: ev.receipt_id }
  }
  if (ev.kind === 'bank' && ev.bank_transaction) {
    return { api: 'bank', id: ev.bank_transaction.id }
  }
  if (ev.kind === 'collection' && ev.collection_payment) {
    return { api: 'collection', id: ev.collection_payment.id }
  }
  return null
}

/** 沖銷中的識別：同一筆來源在畫面上只會有一列可沖，用 端點+id 足以唯一 */
function reverseKeyOf(ev: EventOut): string {
  const t = reverseTarget(ev)
  return t ? `${t.api}-${t.id}` : ''
}

function handoverLocked(ev: EventOut): boolean {
  return !!ev.handover && LOCKED_HANDOVER.has(ev.handover.status)
}

async function reverseEvent(ev: EventOut) {
  const target = reverseTarget(ev)
  if (!target || handoverLocked(ev)) return

  let reason = ''
  try {
    const result = await ElMessageBox.prompt('請輸入沖銷原因（至少 5 字）', '沖銷收款', {
      inputValidator: (v: string) => (v && v.trim().length >= 5 ? true : '原因至少 5 個字'),
    })
    reason = typeof result === 'object' ? result.value : ''
  } catch {
    return // 使用者取消
  }

  reversingKey.value = `${target.api}-${target.id}`
  try {
    const payload = { reason } as never
    if (target.api === 'cash') await reverseCashReceipt(target.id, payload)
    else if (target.api === 'bank') await reverseTransaction(target.id, payload)
    else await reverseCollectionPayment(target.id, payload)
    ElMessage.success('已沖銷這筆收款')
    await fetchDetail()
    emit('reversed')
  } catch (e) {
    ElMessage.error(friendlyError('沖銷失敗', e))
  } finally {
    reversingKey.value = ''
  }
}

// ─── 顯示對照 ───────────────────────────────────────────────────────────────
const KIND_LABELS: Record<string, string> = {
  cash: '現金收款',
  bank: '網銀銷帳',
  collection: '代收入帳',
  other: '其他收款',
  legacy_payment: '繳費流水（未立據）',
  refund: '退款',
}

const HANDOVER_LABELS: Record<string, string> = {
  draft: '現金已登錄',
  reopened: '現金已登錄',
  submitted: '待老闆簽收',
  confirmed: '老闆已簽收',
}

function kindLabel(ev: EventOut): string {
  const base = KIND_LABELS[ev.kind] ?? ev.kind
  return ev.is_reversal ? `沖銷：${base}` : base
}

function kindTagType(ev: EventOut): 'success' | 'primary' | 'warning' | 'danger' | 'info' {
  if (ev.is_reversal || ev.kind === 'refund') return 'danger'
  if (ev.kind === 'cash') return 'success'
  if (ev.kind === 'bank' || ev.kind === 'collection') return 'primary'
  if (ev.kind === 'legacy_payment') return 'warning'
  return 'info'
}

/** 「YYYY-MM-DDTHH:mm:ss」→「YYYY-MM-DD HH:mm」；缺值回 '—' */
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return iso.replace('T', ' ').slice(0, 16)
}

/** 收款日與登錄日不同天才另列（補登昨天的現金、月初媒合月底入帳） */
function showReceivedDate(ev: EventOut): boolean {
  if (!ev.received_date) return false
  return (ev.occurred_at ?? '').slice(0, 10) !== ev.received_date
}

function signedAmount(amount: number): string {
  return amount < 0 ? `-${formatAmount(Math.abs(amount))}` : formatAmount(amount)
}

function confirmLine(ev: EventOut): { main: string; sub: string } {
  if (ev.handover) {
    const h = ev.handover
    const main = HANDOVER_LABELS[h.status] ?? h.status
    if (h.status === 'confirmed') {
      const who = h.confirmed_by_name ? `${h.confirmed_by_name}・` : ''
      return { main, sub: `${who}${fmtDateTime(h.confirmed_at)}` }
    }
    if (h.status === 'submitted') {
      return { main, sub: `送出 ${fmtDateTime(h.submitted_at)}` }
    }
    return { main, sub: h.business_date ? `交接日 ${h.business_date}` : '' }
  }
  if (ev.bank_transaction) {
    const t = ev.bank_transaction
    const time = t.transaction_at ? `・交易 ${fmtDateTime(t.transaction_at)}` : ''
    return {
      main: `銀行入帳 ${t.posting_date ?? '—'}${time}`,
      sub: t.summary ?? '',
    }
  }
  if (ev.collection_payment) {
    const c = ev.collection_payment
    return {
      main: `客戶繳費 ${c.customer_paid_date ?? '—'}・入帳 ${c.posting_date ?? '—'}`,
      sub: c.channel ? `通路 ${c.channel}` : '',
    }
  }
  if (ev.kind === 'legacy_payment') {
    return { main: ev.payment_method ? `方式 ${ev.payment_method}` : '', sub: '無收據' }
  }
  if (ev.kind === 'refund') {
    return { main: '已退款', sub: '' }
  }
  return { main: '', sub: '' }
}

function noteText(ev: EventOut): string {
  return [ev.reason, ev.notes, ev.payer_note].filter(Boolean).join('；')
}

function statusLabel(status: string | null | undefined): string {
  if (status === 'paid') return '已繳清'
  if (status === 'partial') return '部分繳費'
  return '未繳'
}

function statusTagType(status: string | null | undefined): 'success' | 'warning' | 'danger' {
  if (status === 'paid') return 'success'
  if (status === 'partial') return 'warning'
  return 'danger'
}
</script>

<style scoped>
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4) 0;
  color: var(--el-text-color-secondary);
}

.summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  margin-bottom: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md, 8px);
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.summary strong {
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}

.summary__owe strong {
  color: var(--el-color-danger);
}

.record + .record {
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px solid var(--el-border-color-lighter);
}

.record__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.record__name {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.record__amounts {
  margin-left: auto;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.empty {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border: 1px dashed var(--el-border-color-lighter);
  border-radius: var(--radius-md, 8px);
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}

.events {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.events th,
.events td {
  padding: 6px 8px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.events th {
  font-weight: 500;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.events td.num,
.events th.col-amount {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.col-when {
  width: 150px;
  white-space: nowrap;
}

.col-what {
  width: 140px;
  white-space: nowrap;
}

.col-who {
  width: 90px;
}

.col-action {
  width: 92px;
  white-space: nowrap;
}

.event--negative .num {
  color: var(--el-color-danger);
}

.event--reversal td {
  color: var(--el-text-color-secondary);
}

.muted {
  display: block;
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}

.col-confirm > span + .muted,
.col-when > div + .muted {
  margin-top: 2px;
}

/* 手機：六欄表格塞不進 94vw，改成每個事件一張堆疊卡，欄名由 data-label 帶出 */
@media (max-width: 640px) {
  .events thead {
    display: none;
  }

  .events,
  .events tbody,
  .events tr,
  .events td {
    display: block;
    width: auto;
  }

  .events tr {
    padding: 8px 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .events td {
    display: grid;
    grid-template-columns: 64px 1fr;
    gap: 8px;
    padding: 3px 0;
    border-bottom: 0;
    white-space: normal;
  }

  .events td::before {
    content: attr(data-label);
    color: var(--el-text-color-placeholder);
    font-size: 12px;
    line-height: 20px;
  }

  /* 主文字與副行（收款日／簽收人）都留在值欄，不掉進 64px 的標籤欄；tag 不撐滿 */
  .events td > * {
    grid-column: 2;
    justify-self: start;
  }

  .col-confirm > span + .muted,
  .col-when > div + .muted {
    margin-top: 0;
  }

  .events td.num {
    text-align: left;
  }

  .summary {
    gap: var(--space-2) var(--space-3);
  }

  .record__head {
    flex-wrap: wrap;
  }

  .record__amounts {
    margin-left: 0;
    flex-basis: 100%;
  }
}
</style>
