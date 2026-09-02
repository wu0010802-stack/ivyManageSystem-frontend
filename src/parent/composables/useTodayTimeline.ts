import { computed } from 'vue'
// 接送時間是後端台北 naive 字串；統一走零依賴的 taipeiTime 工具顯式錨定 +08:00
// 並以 Asia/Taipei 取時/格式化，避免非台灣裝置差 8 小時導致時段桶分錯、時間顯示錯
// （與 admin 歷史表格 / portal 同源）。
import { formatTaipeiClock, taipeiHour } from '@/utils/taipeiTime'

const BUCKET_LABEL = {
  morning: '早上',
  noon: '中午',
  afternoon: '下午',
  later: '傍晚',
}
const BUCKET_ORDER = ['morning', 'noon', 'afternoon', 'later']

function bucketFromHour(h: number | null) {
  if (h == null) return null
  if (h >= 6 && h < 12) return 'morning'
  if (h >= 12 && h < 14) return 'noon'
  if (h >= 14 && h < 18) return 'afternoon'
  return 'later'
}

function isBirthdayToday(birthday: string | null | undefined) {
  if (!birthday) return false
  const parts = String(birthday).split('-')
  if (parts.length < 3) return false
  const [, m, day] = parts.map(Number)
  const d = new Date()
  return d.getMonth() + 1 === m && d.getDate() === day
}

function dismissalLabel(status: string | null | undefined) {
  if (status === 'pending') return '老師處理中'
  if (status === 'acknowledged') return '老師已收到'
  // 2026-09-02：與首頁狀態 pill 統一為「已離園」（原為「已接送」，同一狀態兩種用詞）
  if (status === 'completed') return '已離園'
  return status || '處理中'
}

export interface TimelineDismissal {
  status?: string
  completed_at?: string
  requested_at?: string
  acknowledged_at?: string
  /** pnotice01：家長預告接送新欄位（today-status 已回傳） */
  request_source?: string
  expected_arrival_at?: string
  arrived_at?: string
}

/**
 * dismissal 事件的時間軸語意（pnotice01，純函式可測）：
 * - 家長預告未抵達：時間=預計抵達、secondary=「已預告 · 預計抵達 · 老師狀態」
 * - 已到門口未完成：時間=arrived_at、secondary=「已到門口 · 老師狀態」
 * - 完成/其他（含 staff 舊流程）：行為與改造前一致
 * 家長預告的事件導向 /pickup-notice（追蹤卡同源，避免兩張矛盾接送卡）。
 */
export function dismissalTimelineParts(d: TimelineDismissal): {
  sourceTs: string | undefined
  secondary: string
  path: string
} {
  const completed = d.status === 'completed'
  const isParentNotice = d.request_source === 'parent'
  const path = isParentNotice && !completed ? '/pickup-notice' : '/attendance'
  if (completed) {
    return {
      sourceTs: d.completed_at || d.requested_at,
      secondary: dismissalLabel(d.status),
      path,
    }
  }
  if (isParentNotice && !d.arrived_at) {
    const clock = formatTaipeiClock(d.expected_arrival_at)
    return {
      sourceTs: d.expected_arrival_at || d.requested_at,
      secondary: [clock ? `已預告 · 預計 ${clock} 抵達` : '已預告接送', dismissalLabel(d.status)]
        .filter(Boolean)
        .join(' · '),
      path,
    }
  }
  if (isParentNotice && d.arrived_at) {
    return {
      sourceTs: d.arrived_at,
      secondary: `已到門口 · ${dismissalLabel(d.status)}`,
      path,
    }
  }
  return {
    sourceTs: d.acknowledged_at || d.requested_at,
    secondary: dismissalLabel(d.status),
    path,
  }
}

// 把 today-status 攤平成依時段桶分組的事件流。
// 桶子：morning (6-12) / noon (12-14) / afternoon (14-18) / later (其餘)
// 每個 event：{ id, bucket, variant: 'past'|'pending'|'info', time, primary, secondary, tone, path, motif? }
//
// 2026-09-02 瘦身後 `summary` 已不再被讀取（五種 summary 衍生待辦事件移交
// HomeTodoList），但呼叫端仍會傳入，簽章刻意保留以免擴大影響面。
export function useTodayTimeline({ summary: _summary, todayChildren }: { summary: { value: Record<string, unknown> | null | undefined }; todayChildren: { value: Record<string, unknown>[] | null | undefined } }) {
  const events = computed(() => {
    const out = []
    const childrenStatus = todayChildren.value || []

    for (const _c of childrenStatus) {
      const c = _c as {
        student_id: unknown; name: string; birthday?: string; classroom_name?: string;
        attendance?: { status?: string }; leave?: { type?: string };
        medication?: { has_order?: boolean; order_count?: number };
        dismissal?: TimelineDismissal
      }
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
      }
      // 2026-09-02：原本這裡有「尚未到校」占位事件。首頁頂部聯絡簿按鈕的
      // 狀態 pill 已經寫著同一句，時間軸再推一列等於同屏重複。

      if (c.medication?.has_order) {
        out.push({
          id: `med:${c.student_id}`,
          bucket: 'noon',
          variant: 'pending',
          time: null,
          primary: `${c.name} 今日用藥`,
          secondary: `${c.medication.order_count} 次`,
          tone: 'violet',
          path: '/medications',
        })
      }

      if (c.dismissal) {
        const completed = c.dismissal.status === 'completed'
        const { sourceTs, secondary, path } = dismissalTimelineParts(c.dismissal)
        const hour = taipeiHour(sourceTs)
        const inferredBucket = bucketFromHour(hour) || 'afternoon'
        out.push({
          id: `dismissal:${c.student_id}`,
          bucket: inferredBucket,
          variant: completed ? 'past' : 'pending',
          time: formatTaipeiClock(sourceTs),
          primary: `${c.name} 接送`,
          secondary,
          tone: 'info',
          path,
        })
      }
    }

    // 2026-09-02：原本這裡有五種 summary 衍生事件（待繳費／待簽閱／才藝候補／
    // 未讀公告／請假審核結果），全部硬編碼塞進 later 桶——它們沒有時間點，
    // 塞進時間軸讓「今日動態」變成第二份待辦清單，且與首頁 bento、頂部橫幅
    // 三處重複。改由 HomeTodoList（useParentTodos）單一承載。
    // 本 composable 從此只處理「今天真的發生了什麼」。

    return out
  })

  // 依 bucket 分組；空桶不渲染。
  // 桶內排序：past → pending → info；有 time 的依時間升冪。
  const buckets = computed(() => {
    const order: Record<string, number> = { past: 0, pending: 1, info: 2 }
    const sortInBucket = (a: { variant: string; time?: string | null }, b: { variant: string; time?: string | null }) => {
      if (order[a.variant] !== order[b.variant]) return (order[a.variant] ?? 99) - (order[b.variant] ?? 99)
      if (a.time && b.time) return a.time.localeCompare(b.time)
      if (a.time) return -1
      if (b.time) return 1
      return 0
    }
    const bucketLabel = BUCKET_LABEL as Record<string, string>
    return BUCKET_ORDER
      .map((key) => {
        const items = events.value.filter((e) => (e as { bucket: string }).bucket === key).sort(sortInBucket)
        return { key, label: bucketLabel[key], items }
      })
      .filter((b) => b.items.length > 0)
  })

  return { events, buckets }
}
