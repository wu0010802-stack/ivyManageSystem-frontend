/**
 * 月底出勤確認的顯示與表單純函式（SPEC-026 §3.6）。
 * 推測文案範例：「10/3 你打卡 08:31–18:02，原班早車 07:00–16:30。推測：與 張副導（晚車）對調」。
 */
import type { ApiResponse } from '@/api/_generated/typed'
import { dateToLocalISO } from '@/utils/format'
import { LEAVE_TYPE_MAP } from '@/utils/leaves'

export type ConfirmationItem = ApiResponse<'/attendance/confirmation-rounds/{round_id}', 'get'>['items'][number]
export type PortalConfirmationItem = ApiResponse<'/portal/attendance-confirmations', 'get'>['items'][number]
type Suggestion = ConfirmationItem['suggestion']
type Party = Suggestion['parties'][string]
type Shift = NonNullable<Party['original']>
export type AmendKind = 'swap_with' | 'cover_for' | 'leave' | 'forgot_punch' | 'other'
export interface PartnerChoice {
  id: number
  name: string
  kind: 'swap' | 'cover'
}

export const KIND_LABELS: Record<ConfirmationItem['kind'], string> = {
  swap: '對調',
  cover: '代班',
  shift_changed: '時段變更',
}

export const STATUS_LABELS: Record<ConfirmationItem['status'], string> = {
  pending: '待回覆',
  agreed: '雙方已確認',
  disputed: '轉行政',
  applied: '已套用',
  superseded: '已失效',
  dismissed: '行政已結案',
}

export const AMEND_LABELS: Record<AmendKind, string> = {
  swap_with: '我跟某人對調',
  cover_for: '我代某人的班',
  leave: '我那天請假',
  forgot_punch: '我忘了打卡',
  other: '其他（請說明）',
}

/** 老師修正類型（行政端顯示用；AMEND_LABELS 是老師第一人稱的選項文字）。 */
export const RESOLUTION_LABELS: Record<AmendKind, string> = {
  swap_with: '改為與他人對調',
  cover_for: '改為代他人上班',
  leave: '補請假',
  forgot_punch: '忘了打卡（補卡）',
  other: '其他',
}

function isAmendKind(value: unknown): value is AmendKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(RESOLUTION_LABELS, value)
}

function textField(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 行政端：老師的修正內容（最終審查 I-4）——誰修正、修正類型、假別、說明，以及流程
 * 建立的請假／補卡申請編號。沒有任何可顯示內容時回空字串。
 */
export function describeResolution(item: ConfirmationItem): string {
  const r = item.resolution ?? {}
  const parts: string[] = []
  if (isAmendKind(r.kind)) {
    const who = r.by_role === 'partner' ? item.partner_name : r.by_role === 'employee' ? item.employee_name : null
    const leaveCode = textField(r, 'leave_type')
    const leave = leaveCode ? `（${LEAVE_TYPE_MAP[leaveCode]?.label ?? leaveCode}）` : ''
    parts.push(`${who ? `${who}的修正` : '老師修正'}：${RESOLUTION_LABELS[r.kind]}${leave}`)
  }
  const note = textField(r, 'note')
  if (note) parts.push(`說明：${note}`)
  if (item.linked_leave_id != null) parts.push(`已建立請假申請 #${item.linked_leave_id}`)
  if (item.linked_punch_correction_id != null) parts.push(`已建立補卡申請 #${item.linked_punch_correction_id}`)
  // 行政結案（Q4）：說明與申請編號之後才加行政段落，維持「老師修正在前、行政結案在後」的閱讀順序。
  const adminNote = textField(r, 'admin_note')
  if (adminNote) parts.push(`行政結案：${adminNote}`)
  else if (textField(r, 'admin_by')) parts.push('行政已結案')
  return parts.join('；')
}

/** 核對列「老師確認」tag 的 tooltip：只在轉行政且老師有寫說明時顯示，其餘回空字串。 */
export function resolutionTooltip(item: ConfirmationItem | undefined): string {
  if (!item || item.status !== 'disputed' || !textField(item.resolution ?? {}, 'note')) return ''
  return describeResolution(item)
}

export function formatMonthDay(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

export function shiftText(shift: Shift | null | undefined): string {
  if (!shift) return '（無原班）'
  const range = shift.work_start && shift.work_end ? ` ${shift.work_start}–${shift.work_end}` : ''
  return `${shift.name}${range}`
}

function hhmm(value: string | null | undefined): string {
  if (!value) return '—'
  const time = value.includes('T') ? value.split('T')[1] : value
  return time.slice(0, 5)
}

export function punchText(party: Party | undefined): string {
  if (!party || (!party.punch_in && !party.punch_out)) return '沒有打卡'
  return `${hhmm(party.punch_in)}–${hhmm(party.punch_out)}`
}

function partyName(s: Suggestion, id: number | null | undefined): string {
  if (id == null) return ''
  return s.parties[String(id)]?.employee_name ?? `#${id}`
}

/** 推測文案；viewerId 為 null 時以第三人稱描述項目當事人（行政端）。 */
export function describeSuggestion(item: ConfirmationItem, viewerId: number | null = null): string {
  const s = item.suggestion
  const subjectId = viewerId ?? item.employee_id
  const subject = s.parties[String(subjectId)]
  const who = viewerId === null ? (subject?.employee_name ?? '') : '你'
  const head = `${formatMonthDay(item.date)} ${who}打卡 ${punchText(subject)}，原班${shiftText(subject?.original)}。`
  const otherId = subjectId === item.employee_id ? item.partner_employee_id : item.employee_id
  const other = otherId != null ? s.parties[String(otherId)] : undefined
  // swap／cover 一定有對象（otherId 保證非 null）；suggestion.parties 缺對方那筆時
  // （例如打卡匯入順序或版本落差）不可落到「找不到對調或代班的同事」，姓名退回
  // item.partner_name／item.employee_name。
  if ((item.kind === 'swap' || item.kind === 'cover') && otherId != null) {
    const otherDisplayName =
      other?.employee_name ?? (otherId === item.employee_id ? item.employee_name : item.partner_name) ?? `#${otherId}`
    if (item.kind === 'swap') {
      return `${head}推測：與 ${otherDisplayName}（${other?.original?.name ?? '無原班'}）對調`
    }
    if (subjectId === item.employee_id) {
      return `${head}推測：代 ${otherDisplayName} 上${other?.original?.name ?? '班'}`
    }
    const tail = s.leave_missing ? '（你當天沒有請假紀錄，可在下方補請假）' : ''
    return `${head}推測：${otherDisplayName} 代你上${subject?.original?.name ?? '班'}${tail}`
  }
  if (s.partner_options.length) {
    const options = s.partner_options.map((o) =>
      o.kind === 'swap'
        ? `與 ${partyName(s, o.partner_employee_id)} 對調`
        : `代 ${partyName(s, o.partner_employee_id)} 的班`,
    )
    return `${head}可能是：${options.join('、')}，請選實際情況`
  }
  const near = s.shift_candidates.map((c) => c.name).join('、')
  return `${head}打卡時間接近${near || '其他班別'}，但找不到對調或代班的同事，請選實際情況`
}

/** 只有項目當事人能重新指定對象；對象只能補請假、補卡或說明。 */
export function amendKindsFor(item: PortalConfirmationItem): AmendKind[] {
  return item.can_repair
    ? ['swap_with', 'cover_for', 'leave', 'forgot_punch', 'other']
    : ['leave', 'forgot_punch', 'other']
}

/** 修正時可選的對象：以系統推測的候選為限（後端也要求兩人打卡互相吻合）。 */
export function partnerChoices(item: ConfirmationItem, kind: 'swap_with' | 'cover_for'): PartnerChoice[] {
  const want: 'swap' | 'cover' = kind === 'swap_with' ? 'swap' : 'cover'
  const s = item.suggestion
  const fromOptions = s.partner_options
    .filter((o) => o.kind === want)
    .map((o) => ({ id: o.partner_employee_id, name: partyName(s, o.partner_employee_id), kind: want }))
  if (fromOptions.length) return fromOptions
  if (item.kind === want && item.partner_employee_id != null) {
    return [{ id: item.partner_employee_id, name: partyName(s, item.partner_employee_id), kind: want }]
  }
  return []
}

/** 從 todayISO 起算第 n 個工作天（週一至週五）；D3 建議 3 個工作天。 */
export function addWorkdays(todayISO: string, n = 3): string {
  const d = new Date(`${todayISO}T12:00:00`)
  let left = n
  while (left > 0) {
    d.setDate(d.getDate() + 1)
    const weekday = d.getDay()
    if (weekday !== 0 && weekday !== 6) left -= 1
  }
  return dateToLocalISO(d)
}

export function yesterdayISO(todayISO: string): string {
  const d = new Date(`${todayISO}T12:00:00`)
  d.setDate(d.getDate() - 1)
  return dateToLocalISO(d)
}

/** 行政端：`${employee_id}|${date}` → 項目（當事人與對象各一筆索引），已失效者不列。 */
export function itemsByPersonDay(items: ConfirmationItem[]): Map<string, ConfirmationItem> {
  const map = new Map<string, ConfirmationItem>()
  for (const item of items) {
    if (item.status === 'superseded') continue
    for (const id of [item.employee_id, item.partner_employee_id]) {
      if (id != null) map.set(`${id}|${item.date}`, item)
    }
  }
  return map
}
