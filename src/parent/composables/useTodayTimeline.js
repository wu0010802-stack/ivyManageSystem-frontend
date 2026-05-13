import { computed } from 'vue'

const BUCKET_LABEL = {
  morning: '早上',
  noon: '中午',
  afternoon: '下午',
  later: '晚一些',
}
const BUCKET_ORDER = ['morning', 'noon', 'afternoon', 'later']

function formatTime(iso) {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  } catch {
    return null
  }
}

function hourFrom(iso) {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return d.getHours()
  } catch {
    return null
  }
}

function bucketFromHour(h) {
  if (h == null) return null
  if (h >= 6 && h < 12) return 'morning'
  if (h >= 12 && h < 14) return 'noon'
  if (h >= 14 && h < 18) return 'afternoon'
  return 'later'
}

function formatMoney(n) {
  if (!n) return '0'
  return n.toLocaleString('en-US')
}

function isBirthdayToday(birthday) {
  if (!birthday) return false
  const parts = String(birthday).split('-')
  if (parts.length < 3) return false
  const [, m, day] = parts.map(Number)
  const d = new Date()
  return d.getMonth() + 1 === m && d.getDate() === day
}

function dismissalLabel(status) {
  if (status === 'pending') return '老師處理中'
  if (status === 'acknowledged') return '老師已收到'
  if (status === 'completed') return '已接送'
  return status || '處理中'
}

// 把後端 summary + today-status 攤平成依時段桶分組的事件流。
// 桶子：morning (6-12) / noon (12-14) / afternoon (14-18) / later (其餘)
// 每個 event：{ id, bucket, variant: 'past'|'pending'|'info', time, primary, secondary, tone, path, motif? }
export function useTodayTimeline({ summary, todayChildren }) {
  const events = computed(() => {
    const out = []
    const summaryV = summary.value
    const childrenStatus = todayChildren.value || []

    for (const c of childrenStatus) {
      const crown = isBirthdayToday(c.birthday) ? 'crown' : null

      if (c.attendance) {
        out.push({
          id: `att:${c.student_id}`,
          bucket: 'morning',
          variant: 'past',
          time: null,
          primary: `${c.name} ${c.attendance.status || '已入園'}`,
          secondary: c.classroom_name || null,
          tone: 'success',
          path: '/attendance',
          motif: crown,
        })
      } else if (c.leave) {
        out.push({
          id: `leave:${c.student_id}`,
          bucket: 'morning',
          variant: 'past',
          time: null,
          primary: `${c.name} 請假`,
          secondary: c.leave.type,
          tone: 'leave',
          path: '/leaves',
          motif: crown,
        })
      } else {
        out.push({
          id: `pending:${c.student_id}`,
          bucket: 'morning',
          variant: 'info',
          time: null,
          primary: `${c.name} 尚未到校`,
          secondary: c.classroom_name || null,
          tone: 'muted',
          path: '/attendance',
          motif: crown,
        })
      }

      if (c.medication?.has_order) {
        out.push({
          id: `med:${c.student_id}`,
          bucket: 'noon',
          variant: 'pending',
          time: null,
          primary: `${c.name} 今日用藥`,
          secondary: `${c.medication.order_count} 次`,
          tone: 'violet',
          path: '/medication',
        })
      }

      if (c.dismissal) {
        const completed = c.dismissal.status === 'completed'
        const sourceTs = completed
          ? c.dismissal.completed_at || c.dismissal.requested_at
          : c.dismissal.acknowledged_at || c.dismissal.requested_at
        const hour = hourFrom(sourceTs)
        const inferredBucket = bucketFromHour(hour) || 'afternoon'
        out.push({
          id: `dismissal:${c.student_id}`,
          bucket: inferredBucket,
          variant: completed ? 'past' : 'pending',
          time: formatTime(sourceTs),
          primary: `${c.name} 接送`,
          secondary: dismissalLabel(c.dismissal.status),
          tone: 'info',
          path: '/attendance',
        })
      }
    }

    const fees = summaryV?.fees
    if (fees?.outstanding_count > 0) {
      out.push({
        id: 'fees',
        bucket: 'later',
        variant: 'pending',
        time: null,
        primary: `待繳費 NT$ ${formatMoney(fees.outstanding)}`,
        secondary: fees.overdue > 0
          ? `逾期 NT$ ${formatMoney(fees.overdue)}`
          : `${fees.outstanding_count} 筆`,
        tone: fees.overdue > 0 ? 'danger' : 'money',
        path: '/fees',
      })
    }

    if (summaryV?.pending_event_acks > 0) {
      out.push({
        id: 'acks',
        bucket: 'later',
        variant: 'pending',
        time: null,
        primary: '待簽閱事件',
        secondary: `${summaryV.pending_event_acks} 件`,
        tone: 'event',
        path: '/events',
      })
    }

    if (summaryV?.unread_messages > 0) {
      out.push({
        id: 'messages',
        bucket: 'later',
        variant: 'pending',
        time: null,
        primary: '未讀訊息',
        secondary: `${summaryV.unread_messages} 則`,
        tone: 'message',
        path: '/messages',
      })
    }

    if (summaryV?.pending_activity_promotions > 0) {
      out.push({
        id: 'promotions',
        bucket: 'later',
        variant: 'pending',
        time: null,
        primary: '才藝候補待確認',
        secondary: `${summaryV.pending_activity_promotions} 件`,
        tone: 'activity',
        path: '/activity',
      })
    }

    if (summaryV?.unread_announcements > 0) {
      out.push({
        id: 'announcements',
        bucket: 'later',
        variant: 'info',
        time: null,
        primary: '未讀公告',
        secondary: `${summaryV.unread_announcements} 則`,
        tone: 'announcement',
        path: '/announcements',
      })
    }

    if (summaryV?.recent_leave_reviews > 0) {
      out.push({
        id: 'leaveReviews',
        bucket: 'later',
        variant: 'info',
        time: null,
        primary: '最近請假審核結果',
        secondary: `${summaryV.recent_leave_reviews} 件`,
        tone: 'leave',
        path: '/leaves',
      })
    }

    return out
  })

  // 依 bucket 分組；空桶不渲染。
  // 桶內排序：past → pending → info；有 time 的依時間升冪。
  const buckets = computed(() => {
    const order = { past: 0, pending: 1, info: 2 }
    const sortInBucket = (a, b) => {
      if (order[a.variant] !== order[b.variant]) return order[a.variant] - order[b.variant]
      if (a.time && b.time) return a.time.localeCompare(b.time)
      if (a.time) return -1
      if (b.time) return 1
      return 0
    }
    return BUCKET_ORDER
      .map((key) => {
        const items = events.value.filter((e) => e.bucket === key).sort(sortInBucket)
        return { key, label: BUCKET_LABEL[key], items }
      })
      .filter((b) => b.items.length > 0)
  })

  return { events, buckets }
}
