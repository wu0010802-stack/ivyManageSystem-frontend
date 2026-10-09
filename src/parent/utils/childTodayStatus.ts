/**
 * 首頁孩子狀態卡的「今天狀態」判斷（純函式，可測）。
 *
 * 輸入是 GET /parent/home/today-status 的單一孩子物件（attendance / leave /
 * dismissal / medication），輸出狀態卡要顯示的大字標籤、色調、說明，以及
 * 「到校 → 接送 → 離園」三步驟進度。只用 today-status 既有欄位，不推測即時
 * 動態（例如午睡中）——那些要等老師寫聯絡簿才知道，不能在首頁捏造。
 *
 * 判斷順序沿用改版前 TodayView.childStatusLabel：已離園 > 在園 > 請假 >
 * 尚未到校（週末改為今天放假）。
 */
import { formatTaipeiClock } from '@/utils/taipeiTime'

export type ChildStatusTone = 'ok' | 'info' | 'neutral'
export type StepState = 'done' | 'current' | 'todo'

export interface ChildTodayStep {
  key: 'arrive' | 'pickup' | 'leave'
  label: string
  caption: string
  state: StepState
}

export interface ChildTodayStatus {
  /** 大字標籤：在園中／已離園／請假／尚未到校／今天放假 */
  label: string
  tone: ChildStatusTone
  icon: string
  detail: string
  /** 請假或放假日不顯示進度 */
  steps: ChildTodayStep[] | null
  /** 聯絡簿是否不會有紀錄（請假／放假），決定聯絡簿列的文案 */
  noRecordReason: '請假' | '放假' | null
}

interface TodayDismissal {
  status?: string
  completed_at?: string
  requested_at?: string
  request_source?: string
  expected_arrival_at?: string
  arrived_at?: string
}

export interface TodayChildLike {
  attendance?: { status?: string } | null
  leave?: { type?: string } | null
  dismissal?: TodayDismissal | null
}

/** 後端出席狀態裡代表「正常到校」的字樣；其餘（如遲到）要照實顯示 */
const PLAIN_PRESENT = new Set(['已入園', '在園中', '出席'])

export function isOffDay(now: Date = new Date()): boolean {
  const d = now.getDay()
  return d === 0 || d === 6
}

function pickupStep(d: TodayDismissal | null | undefined): ChildTodayStep {
  const base = { key: 'pickup' as const, label: '接送' }
  if (!d) return { ...base, caption: '未預告', state: 'todo' }
  if (d.status === 'completed') return { ...base, caption: '已接到', state: 'done' }
  if (d.arrived_at) return { ...base, caption: '已到門口', state: 'current' }
  const clock = formatTaipeiClock(d.expected_arrival_at)
  if (d.request_source === 'parent') {
    return { ...base, caption: clock ? `預計 ${clock}` : '已預告', state: 'current' }
  }
  return { ...base, caption: '老師處理中', state: 'current' }
}

export function childTodayStatus(
  today: TodayChildLike | null | undefined,
  now: Date = new Date(),
): ChildTodayStatus {
  const dismissal = today?.dismissal ?? null

  if (dismissal?.status === 'completed') {
    const clock = formatTaipeiClock(dismissal.completed_at)
    return {
      label: '已離園',
      tone: 'ok',
      icon: 'home',
      detail: clock ? `${clock} 已接回家` : '已接回家',
      steps: [
        { key: 'arrive', label: '到校', caption: '已到校', state: 'done' },
        pickupStep(dismissal),
        { key: 'leave', label: '離園', caption: clock ?? '已離園', state: 'done' },
      ],
      noRecordReason: null,
    }
  }

  if (today?.attendance) {
    const raw = today.attendance.status || ''
    const arriveCaption = raw && !PLAIN_PRESENT.has(raw) ? raw : '已到校'
    return {
      label: '在園中',
      tone: 'ok',
      icon: 'check_circle',
      detail: raw && !PLAIN_PRESENT.has(raw) ? `今天${raw}` : '今天已到校',
      steps: [
        { key: 'arrive', label: '到校', caption: arriveCaption, state: 'done' },
        pickupStep(dismissal),
        { key: 'leave', label: '離園', caption: '還沒離園', state: 'todo' },
      ],
      noRecordReason: null,
    }
  }

  if (today?.leave) {
    return {
      label: '請假',
      tone: 'info',
      icon: 'event_busy',
      detail: today.leave.type ? `今天請${today.leave.type.replace(/^請/, '')}` : '今天請假',
      steps: null,
      noRecordReason: '請假',
    }
  }

  if (isOffDay(now)) {
    return {
      label: '今天放假',
      tone: 'neutral',
      icon: 'sunny',
      detail: '好好休息，下次上學見',
      steps: null,
      noRecordReason: '放假',
    }
  }

  return {
    label: '尚未到校',
    tone: 'neutral',
    icon: 'schedule',
    detail: '到校後這裡會更新',
    steps: [
      { key: 'arrive', label: '到校', caption: '還沒到校', state: 'current' },
      pickupStep(dismissal),
      { key: 'leave', label: '離園', caption: '', state: 'todo' },
    ],
    noRecordReason: null,
  }
}
