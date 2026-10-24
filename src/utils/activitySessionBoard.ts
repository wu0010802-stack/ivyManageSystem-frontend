/**
 * 課程點名列表的純邏輯（2026-09-14 改版）。
 *
 * 原本列表是整月 36 列平鋪、依日期升冪、沒有「今天」標記也沒有上課時間，老師 90%
 * 的來訪只為了點今天這一堂，卻要自己掃過整個月。這裡把「今天／本週其他日／漏點名」
 * 的判定抽成純函式，元件只負責畫。
 */

/** 後端 ActivitySessionListItemOut 需要用到的欄位（刻意放寬，測試好餵假資料）。 */
export interface BoardSession {
  id: number
  course_id: number
  course_name: string
  session_date?: string | null
  present_count: number
  recorded_count: number
  enrolled_count?: number
  meeting_start_time?: string | null
  meeting_end_time?: string | null
}

/** 一堂課在畫面上的狀態。顏色與文案由元件決定，這裡只給語意。 */
export type SessionStatus =
  | 'unmarked' // 已上過但完全沒點
  | 'partial' // 點到一半
  | 'done' // 點完了
  | 'upcoming' // 還沒上

export interface SessionView extends BoardSession {
  status: SessionStatus
  /** 已記錄人數（分子） */
  markedCount: number
  /** 應到人數（分母）。後端沒回 enrolled_count 時退回已記錄人數。 */
  totalCount: number
  isToday: boolean
  isPast: boolean
}

export interface DayGroup {
  date: string
  /** 例：週三 9/16 */
  label: string
  sessions: SessionView[]
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

/** YYYY-MM-DD → Date（當地零時，避免 UTC 位移把日期跳掉） */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function toISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 台北時區的今天（YYYY-MM-DD）。 */
export function todayInTaipei(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** 一週的起訖（週一到週日）。offset 0=本週、-1=上週、1=下週。 */
export function weekBounds(anchorISO: string, offset = 0): { start: string; end: string } {
  const anchor = parseDay(anchorISO)
  // getDay(): 0=Sun → 轉成 0=Mon
  const dayFromMonday = (anchor.getDay() + 6) % 7
  const start = new Date(anchor)
  start.setDate(anchor.getDate() - dayFromMonday + offset * 7)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start: toISO(start), end: toISO(end) }
}

export function weekLabel(startISO: string, endISO: string, todayISO: string): string {
  const { start } = weekBounds(todayISO, 0)
  const prefix = start === startISO ? '本週 ' : ''
  const s = parseDay(startISO)
  const e = parseDay(endISO)
  return `${prefix}${s.getMonth() + 1}/${s.getDate()} 至 ${e.getMonth() + 1}/${e.getDate()}`
}

export function dayLabel(iso: string): string {
  const d = parseDay(iso)
  return `週${WEEKDAY_LABELS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`
}

/** "16:10:00" → "16:10"；空值回空字串。 */
export function shortTime(value?: string | null): string {
  if (!value) return ''
  return value.slice(0, 5)
}

export function timeRangeLabel(session: BoardSession): string {
  const start = shortTime(session.meeting_start_time)
  const end = shortTime(session.meeting_end_time)
  if (!start) return ''
  return end ? `${start} 至 ${end}` : start
}

/**
 * 決定一堂課的狀態。
 *
 * 分母用 enrolled_count（應到人數）而不是 recorded_count：後者是「已經點了幾個」，
 * 拿它當分母的話「16 / 18」永遠看起來像點完了，分不出這堂還有兩個人沒點。
 * 後端沒回 enrolled_count 時（舊版契約）退回 recorded_count，行為與改版前相同。
 */
export function toSessionView(session: BoardSession, todayISO: string): SessionView {
  const date = session.session_date ?? ''
  const marked = session.recorded_count ?? 0
  const enrolled = session.enrolled_count ?? 0
  const total = enrolled > 0 ? enrolled : marked
  const isToday = date === todayISO
  const isPast = Boolean(date) && date < todayISO
  const isFuture = Boolean(date) && date > todayISO

  let status: SessionStatus
  if (marked === 0) {
    status = isFuture ? 'upcoming' : 'unmarked'
  } else if (total > 0 && marked < total) {
    status = 'partial'
  } else {
    status = 'done'
  }

  return { ...session, status, markedCount: marked, totalCount: total, isToday, isPast }
}

/** 依日期分組（升冪），每組內依上課時刻、再依課名排序。 */
export function groupByDay(sessions: SessionView[]): DayGroup[] {
  const map = new Map<string, SessionView[]>()
  for (const s of sessions) {
    const key = s.session_date ?? ''
    if (!key) continue
    const bucket = map.get(key)
    if (bucket) bucket.push(s)
    else map.set(key, [s])
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      label: dayLabel(date),
      sessions: items.sort(
        (a, b) =>
          shortTime(a.meeting_start_time).localeCompare(shortTime(b.meeting_start_time)) ||
          a.course_name.localeCompare(b.course_name, 'zh-Hant'),
      ),
    }))
}

/**
 * 漏點名：過去的場次裡，完全沒點或只點一半的。
 *
 * 只回看 lookbackDays 天（預設 14）：再往前的資料老師通常不會補了，全部翻出來只會
 * 讓提示變成常駐雜訊。要看更早的走列表自己選日期範圍。
 */
export function findOverdue(
  sessions: SessionView[],
  todayISO: string,
  lookbackDays = 14,
): SessionView[] {
  const floor = new Date(parseDay(todayISO))
  floor.setDate(floor.getDate() - lookbackDays)
  const floorISO = toISO(floor)
  return sessions
    .filter(
      (s) =>
        s.isPast &&
        (s.session_date ?? '') >= floorISO &&
        (s.status === 'unmarked' || s.status === 'partial'),
    )
    .sort((a, b) => (b.session_date ?? '').localeCompare(a.session_date ?? ''))
}

/** 課程篩選 chip 的選項（依課名排序，不重複）。 */
export function courseOptions(sessions: BoardSession[]): Array<{ id: number; name: string }> {
  const map = new Map<number, string>()
  for (const s of sessions) {
    if (s.course_id != null && !map.has(s.course_id)) map.set(s.course_id, s.course_name)
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
}

/** 頁首那句摘要：今天有幾堂、幾堂還沒點。 */
export function todaySummary(todaySessions: SessionView[]): string {
  if (todaySessions.length === 0) return '今天沒有才藝課'
  const pending = todaySessions.filter((s) => s.status !== 'done').length
  if (pending === 0) return `今天 ${todaySessions.length} 堂，都點完了`
  return `今天 ${todaySessions.length} 堂，${pending} 堂還沒點完`
}
