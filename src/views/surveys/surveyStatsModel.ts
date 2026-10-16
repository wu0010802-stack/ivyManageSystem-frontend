/**
 * 調查詳情「統計」頁籤的純函式模型（可測，不依賴 Vue）。
 * 把後端 `SurveyStatsOut` 轉成畫面要的分段長條、班級列與各題統計列。
 */

export interface StatsClassroom {
  classroom_id: number | null
  classroom_name: string
  replied: number
  total: number
  attending: number
}

export interface StatsQuestion {
  question_id: number
  question_text: string
  question_type: string
  option_counts?: Record<string, unknown> | null
  sum?: number | null
  avg?: number | null
  texts?: { student_name?: unknown; value?: unknown }[] | null
}

export interface SurveyStats {
  denominator: number
  replied_count: number
  attending_count: number
  reply_rate: number
  attend_rate: number
  by_classroom: StatsClassroom[]
  questions: StatsQuestion[]
}

export interface OverviewSegment {
  key: 'attending' | 'not_attending' | 'not_replied'
  label: string
  count: number
  /** 佔對象總數的百分比（0–100，整數） */
  percent: number
}

export interface Overview {
  denominator: number
  replied: number
  attending: number
  notAttending: number
  notReplied: number
  repliedPercent: number
  attendingPercent: number
  segments: OverviewSegment[]
}

function pct(part: number, whole: number): number {
  if (!whole) return 0
  return Math.round((part / whole) * 100)
}

/**
 * 回覆總覽：把「對象」拆成參加／不參加／未回覆三段，三段相加恆等於分母。
 * 後端不回「不參加」數，用 replied - attending 推得；資料異常（負數）夾到 0。
 */
export function buildOverview(stats: Pick<SurveyStats, 'denominator' | 'replied_count' | 'attending_count'>): Overview {
  const denominator = Math.max(0, stats.denominator)
  const replied = Math.min(Math.max(0, stats.replied_count), denominator)
  const attending = Math.min(Math.max(0, stats.attending_count), replied)
  const notAttending = replied - attending
  const notReplied = denominator - replied
  return {
    denominator,
    replied,
    attending,
    notAttending,
    notReplied,
    repliedPercent: pct(replied, denominator),
    attendingPercent: pct(attending, denominator),
    segments: [
      { key: 'attending', label: '參加', count: attending, percent: pct(attending, denominator) },
      { key: 'not_attending', label: '不參加', count: notAttending, percent: pct(notAttending, denominator) },
      { key: 'not_replied', label: '未回覆', count: notReplied, percent: pct(notReplied, denominator) },
    ],
  }
}

export interface ClassroomRow extends StatsClassroom {
  notReplied: number
  repliedPercent: number
}

/** 各班列：補上未回覆數與回覆率；未回覆多的班排前面，方便追。 */
export function buildClassroomRows(rows: StatsClassroom[]): ClassroomRow[] {
  return rows
    .map((c) => ({
      ...c,
      notReplied: Math.max(0, c.total - c.replied),
      repliedPercent: pct(c.replied, c.total),
    }))
    .sort((a, b) => b.notReplied - a.notReplied || a.classroom_name.localeCompare(b.classroom_name, 'zh-Hant'))
}

export interface OptionRow {
  label: string
  count: number
  /** 佔「回覆參加者」的百分比；多選題各列可加總超過 100 */
  percent: number
}

/**
 * 選擇題每個選項的票數與佔比。分母＝回覆且參加的人數（後端附加題統計口徑，
 * 見 spec §8），不是全體對象。保留後端給的選項順序（即題目定義順序）。
 */
export function buildOptionRows(question: StatsQuestion, attendingCount: number): OptionRow[] {
  const counts = question.option_counts ?? {}
  return Object.entries(counts).map(([label, raw]) => {
    const count = typeof raw === 'number' ? raw : Number(raw) || 0
    return { label, count, percent: pct(count, attendingCount) }
  })
}

export interface TextRow {
  student_name: string
  value: string
}

export function buildTextRows(question: StatsQuestion): TextRow[] {
  return (question.texts ?? [])
    .map((t) => ({ student_name: String(t.student_name ?? ''), value: String(t.value ?? '') }))
    .filter((t) => t.value !== '')
}
