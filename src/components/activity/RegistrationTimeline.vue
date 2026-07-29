<!--
  RegistrationTimeline.vue

  將單筆才藝報名（建立 → 審核 → 配位 → 繳費 → 完結）以垂直時間軸呈現。
  純展示元件，不發 API；上游須帶入 detail + payments + paymentStatus。

  節點狀態：done / current / pending / cancelled / warning
  分支事件（退費 / voided / 軟刪報名）以子卡片掛在對應主節點下。
-->
<template>
  <div class="reg-timeline">
    <div
      v-for="(node, idx) in nodes"
      :key="node.key"
      class="rt-node"
      :class="[`rt-${node.state}`, { 'rt-last': idx === nodes.length - 1 }]"
    >
      <div class="rt-rail">
        <span class="rt-dot" :class="{ 'rt-dot-pulse': node.state === 'current' }">
          <span class="rt-dot-inner" />
        </span>
        <span v-if="idx < nodes.length - 1" class="rt-line" />
      </div>

      <div class="rt-body">
        <div class="rt-head">
          <span class="rt-title">{{ node.title }}</span>
          <span v-if="node.badge" class="rt-badge" :class="`rt-badge-${node.badgeType || node.state}`">
            {{ node.badge }}
          </span>
          <span v-if="node.datetime" class="rt-datetime">{{ node.datetime }}</span>
        </div>

        <div v-if="node.subtitle" class="rt-subtitle">{{ node.subtitle }}</div>

        <ul v-if="node.meta?.length" class="rt-meta">
          <li v-for="(m, i) in node.meta" :key="i">{{ m }}</li>
        </ul>

        <div v-if="node.events?.length" class="rt-events">
          <div
            v-for="(ev, i) in node.events"
            :key="i"
            class="rt-event"
            :class="[`rt-event-${ev.kind}`, { 'rt-event-voided': ev.voided }]"
          >
            <span class="rt-event-tag">{{ ev.tag }}</span>
            <span class="rt-event-amount">{{ ev.amount }}</span>
            <span class="rt-event-date">{{ ev.date }}</span>
            <span v-if="ev.note" class="rt-event-note">{{ ev.note }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { COURSE_STATUS_LABEL, MATCH_STATUS_LABEL_LONG } from '@/constants/activity'
import { courseBillingLabel } from '@/utils/activityDisplay'

interface TimelineEvent {
  kind?: string
  tag?: string
  amount?: string
  date?: string
  note?: string
  voided?: boolean
}

interface TimelineNode {
  key: string
  title: string
  state: string
  badge?: string | null
  badgeType?: string | null
  datetime?: string
  subtitle?: string
  meta?: (string | null)[]
  events?: TimelineEvent[]
}

interface Payment {
  type?: string
  is_voided?: boolean
  amount?: number | string
  payment_date?: string
  created_at?: string
  payment_method?: string
  operator?: string
  notes?: string
  void_reason?: string
  voided_by?: string
  [key: string]: unknown
}

interface Registration {
  created_at?: string
  parent_phone?: string
  school_year?: number
  semester?: number
  class_name?: string
  match_status?: string
  pending_review?: boolean
  reviewed_at?: string
  reviewed_by?: string
  courses?: { status: string; name: string; price?: number | string; confirm_deadline?: string }[]
  total_amount?: number
  is_active?: boolean
  [key: string]: unknown
}

const props = withDefaults(defineProps<{
  registration: Registration
  payments?: Payment[]
  paidAmount?: number
  paymentStatus?: string
}>(), {
  payments: () => [],
  paidAmount: 0,
  paymentStatus: 'unpaid',
})

const MATCH_LABEL = MATCH_STATUS_LABEL_LONG as Record<string, string>

function fmtDate(s: string | null | undefined) {
  if (!s) return ''
  // 2026-05-12 14:33:00 / ISO 都接受；只取到分
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtMoney(n: number | string | null | undefined) {
  if (n == null) return ''
  return `NT$ ${Number(n).toLocaleString()}`
}

// --- 五大主節點 ---

const createdNode = computed((): TimelineNode => {
  const r = props.registration
  return {
    key: 'created',
    title: '建立報名',
    state: 'done',
    datetime: fmtDate(r.created_at),
    subtitle: r.parent_phone ? `家長手機 ${r.parent_phone}` : '校方代登',
    meta: [
      r.school_year && r.semester ? `${r.school_year} 學年度 第 ${r.semester} 學期` : null,
      r.class_name ? `班級：${r.class_name}` : null,
    ].filter(Boolean),
  }
})

const reviewNode = computed((): TimelineNode => {
  const r = props.registration
  const status = r.match_status || 'unmatched'
  const label = MATCH_LABEL[status] || status

  let state = 'done'
  let badgeType = state
  if (r.pending_review) {
    state = 'current'
    badgeType = 'current'
  } else if (status === 'rejected') {
    state = 'cancelled'
    badgeType = 'cancelled'
  } else if (status === 'forced') {
    state = 'warning'
    badgeType = 'warning'
  } else if (status === 'unmatched' && r.is_active) {
    state = 'pending'
    badgeType = 'pending'
  }

  return {
    key: 'review',
    title: '匹配審核',
    state,
    badge: label,
    badgeType,
    datetime: r.reviewed_at ? fmtDate(r.reviewed_at) : '',
    subtitle: r.reviewed_by ? `審核人：${r.reviewed_by}` : '',
  }
})

const coursesNode = computed((): TimelineNode => {
  const courses = props.registration.courses || []
  if (!courses.length) {
    return {
      key: 'courses',
      title: '課程配位',
      state: 'pending',
      subtitle: '尚未選課',
    }
  }

  const enrolled = courses.filter((c) => c.status === 'enrolled')
  const waiting = courses.filter((c) => c.status === 'waitlist')
  const pendingConfirm = courses.filter((c) => c.status === 'promoted_pending')
  const pendingReview = courses.filter((c) => c.status === 'pending_review')
  const pendingReviewWaitlist = courses.filter(
    (c) => c.status === 'pending_review_waitlist',
  )

  let state = 'done'
  let badge = null
  let badgeType = null
  if (pendingConfirm.length) {
    state = 'warning'
    badge = `${pendingConfirm.length} 門待家長確認`
    badgeType = 'warning'
  } else if (pendingReviewWaitlist.length) {
    state = 'warning'
    badge = [
      pendingReview.length ? `${pendingReview.length} 待審核` : null,
      `${pendingReviewWaitlist.length} 待審核候補`,
    ].filter(Boolean).join('・')
    badgeType = 'warning'
  } else if (pendingReview.length) {
    state = 'current'
    badge = `${pendingReview.length} 門待審核`
    badgeType = 'warning'
  } else if (waiting.length && !enrolled.length) {
    state = 'current'
    badge = `${waiting.length} 門候補中`
    badgeType = 'pending'
  } else if (waiting.length) {
    state = 'current'
    badge = `${enrolled.length} 正式・${waiting.length} 候補`
    badgeType = 'pending'
  }

  const meta = courses.map((c) => {
    const tag = c.status === 'promoted_pending' ? '待確認'
      : (COURSE_STATUS_LABEL as Record<string, string>)[c.status] || c.status
    const billing = courseBillingLabel(c)
    const deadline = c.status === 'promoted_pending' && c.confirm_deadline
      ? `（截止 ${fmtDate(c.confirm_deadline)}）`
      : ''
    return `[${tag}] ${c.name} ${billing}${deadline}`
  })

  return {
    key: 'courses',
    title: '課程配位',
    state,
    badge,
    badgeType,
    meta,
  }
})

const paymentsNode = computed((): TimelineNode => {
  const r = props.registration
  const total = r.total_amount ?? 0
  const paid = props.paidAmount || 0
  const status = props.paymentStatus
  const nonVoided = (props.payments || []).filter((p) => !p.is_voided)
  const payments = nonVoided.filter((p) => p.type === 'payment')

  let state, badge, badgeType
  if (total === 0) {
    state = 'pending'
    badge = '無應繳款'
    badgeType = 'pending'
  } else if (status === 'paid') {
    state = 'done'
    badge = '已繳清'
    badgeType = 'done'
  } else if (status === 'partial') {
    state = 'current'
    badge = `已繳 ${fmtMoney(paid)} / ${fmtMoney(total)}`
    badgeType = 'pending'
  } else if (status === 'overpaid') {
    state = 'warning'
    badge = `超繳 ${fmtMoney(paid - total)}`
    badgeType = 'warning'
  } else {
    state = 'pending'
    badge = `待繳 ${fmtMoney(total)}`
    badgeType = 'pending'
  }

  const events = payments.map((p) => ({
    kind: 'payment',
    tag: '繳費',
    amount: `+${fmtMoney(p.amount)}`,
    date: p.payment_date || fmtDate(p.created_at),
    note: [p.payment_method, p.operator ? `經手：${p.operator}` : null, p.notes].filter(Boolean).join('　'),
  }))

  return {
    key: 'payments',
    title: '繳費進度',
    state,
    badge,
    badgeType,
    subtitle: `應繳 ${fmtMoney(total)}・已繳 ${fmtMoney(paid)}`,
    events,
  }
})

// --- 分支：退費 / voided（只在有資料時插入）---
const refundNode = computed((): TimelineNode | null => {
  const refunds = (props.payments || []).filter((p) => p.type === 'refund' && !p.is_voided)
  if (!refunds.length) return null
  const totalRefund = refunds.reduce((s, r) => s + Number(r.amount || 0), 0)
  return {
    key: 'refunds',
    title: '退費紀錄',
    state: 'warning',
    badge: `共 ${refunds.length} 筆・${fmtMoney(totalRefund)}`,
    badgeType: 'warning',
    events: refunds.map((p) => ({
      kind: 'refund',
      tag: '退費',
      amount: `-${fmtMoney(p.amount)}`,
      date: p.payment_date || fmtDate(p.created_at),
      note: [p.operator ? `經手：${p.operator}` : null, p.notes].filter(Boolean).join('　'),
    })),
  }
})

const voidedNode = computed((): TimelineNode | null => {
  const voided = (props.payments || []).filter((p) => p.is_voided)
  if (!voided.length) return null
  return {
    key: 'voided',
    title: '已軟刪紀錄',
    state: 'cancelled',
    badge: `共 ${voided.length} 筆`,
    badgeType: 'cancelled',
    subtitle: '不計入已繳金額；保留稽核軌跡',
    events: voided.map((p) => ({
      kind: p.type,
      voided: true,
      tag: p.type === 'payment' ? '繳費' : '退費',
      amount: `${p.type === 'payment' ? '+' : '-'}${fmtMoney(p.amount)}`,
      date: p.payment_date || fmtDate(p.created_at),
      note: [p.void_reason ? `刪除原因：${p.void_reason}` : null, p.voided_by ? `操作者：${p.voided_by}` : null].filter(Boolean).join('　'),
    })),
  }
})

// --- 完結節點 ---
// is_active 預設視為 true（後端 detail endpoint 已過濾 is_active=True，response 不含此欄位）；
// 僅在明確傳入 false 時才判定為軟刪。
const finalNode = computed((): TimelineNode => {
  const r = props.registration
  if (r.is_active === false) {
    return {
      key: 'final',
      title: '報名已撤銷',
      state: 'cancelled',
      badge: r.match_status === 'rejected' ? '校方拒絕' : '報名軟刪',
      badgeType: 'cancelled',
    }
  }
  if (props.paymentStatus === 'paid'
      && !(props.payments || []).some((p) => p.type === 'refund' && !p.is_voided)) {
    return { key: 'final', title: '報名完成', state: 'done', badge: '結案' }
  }
  return { key: 'final', title: '進行中', state: 'pending' }
})

const nodes = computed((): TimelineNode[] => {
  const main: TimelineNode[] = [createdNode.value, reviewNode.value]
  // 拒絕後不再顯示後續流程
  if (props.registration.match_status === 'rejected') {
    main.push(finalNode.value)
    return main
  }
  main.push(coursesNode.value, paymentsNode.value)
  if (refundNode.value) main.push(refundNode.value)
  if (voidedNode.value) main.push(voidedNode.value)
  main.push(finalNode.value)
  return main
})
</script>

<style scoped>
.reg-timeline {
  padding: 4px 0 8px;
}

.rt-node {
  display: flex;
  gap: 12px;
  position: relative;
}

.rt-rail {
  flex: 0 0 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 4px;
}

.rt-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid currentColor;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}

.rt-dot-inner {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.rt-line {
  flex: 1;
  width: 2px;
  background: #e4e7ed;
  margin-top: 2px;
  margin-bottom: -2px;
}

.rt-body {
  flex: 1;
  padding-bottom: 18px;
  min-width: 0;
}

.rt-last .rt-body {
  padding-bottom: 4px;
}

.rt-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 4px;
}

.rt-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.rt-datetime {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-left: auto;
}

.rt-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 18px;
  border: 1px solid;
}

.rt-badge-done { color: #67c23a; background: #f0f9eb; border-color: #c2e7b0; }
.rt-badge-current { color: var(--color-info); background: #ecf5ff; border-color: #b3d8ff; }
.rt-badge-pending { color: var(--text-tertiary); background: #f4f4f5; border-color: #d3d4d6; }
.rt-badge-warning { color: #e6a23c; background: #fdf6ec; border-color: #f5dab1; }
.rt-badge-cancelled { color: var(--text-tertiary); background: #f4f4f5; border-color: #d3d4d6; }

.rt-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.rt-meta {
  margin: 0 0 6px;
  padding-left: 16px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.7;
}

/* 節點顏色：套用 currentColor 到圓點 */
.rt-done       { color: #67c23a; }
.rt-current    { color: var(--color-info); }
.rt-pending    { color: var(--neutral-300); }
.rt-warning    { color: #e6a23c; }
.rt-cancelled  { color: var(--text-tertiary); }

.rt-dot-pulse {
  box-shadow: 0 0 0 0 rgba(64, 158, 255, 0.55);
  animation: rt-pulse 1.6s infinite;
}

@keyframes rt-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(64, 158, 255, 0.55); }
  70%  { box-shadow: 0 0 0 8px rgba(64, 158, 255, 0); }
  100% { box-shadow: 0 0 0 0 rgba(64, 158, 255, 0); }
}

/* 事件子卡片（退費 / voided 明細） */
.rt-events {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}

.rt-event {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  background: #fafbfc;
  border-left: 3px solid #d3d4d6;
}

.rt-event-payment { border-left-color: #67c23a; }
.rt-event-refund  { border-left-color: #f56c6c; background: #fef0f0; }

.rt-event-voided {
  opacity: 0.55;
  text-decoration: line-through;
  background: #f4f4f5 !important;
  border-left-color: var(--text-tertiary) !important;
}

.rt-event-tag {
  font-weight: 600;
  color: var(--text-primary);
}

.rt-event-amount {
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.rt-event-date {
  color: var(--text-tertiary);
}

.rt-event-note {
  color: var(--text-secondary);
  flex-basis: 100%;
  font-size: 12px;
}
</style>
