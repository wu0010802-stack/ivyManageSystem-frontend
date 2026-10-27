// 公告送出前的「通知家長」確認。
// 後端 PUT /announcements/{id}/parent-recipients 只要有對象且 publish_at 未在未來，
// 就會立即背景推播 LINE；同一則公告已通知過的家長會被去重、不會重複收到。
// 所以只有「新增」或「編輯時家長對象有變更」才可能有人收到新通知，需要確認。

import { pad2 } from '@/utils/format'

export interface ParentScopeSnapshot {
  visibility: string
  classroomIds: number[]
  studentIds: number[]
}

export interface ParentPushConfirmInput extends ParentScopeSnapshot {
  isEdit: boolean
  /** 編輯時開啟對話框讀到的原始對象；讀取失敗或新增時為 null */
  initial: ParentScopeSnapshot | null
  publishAt: string | null
  now?: Date
}

export interface ParentPushConfirm {
  title: string
  message: string
  confirmButtonText: string
}

const sameIds = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort((x, y) => x - y).every((v, i) => v === [...b].sort((x, y) => x - y)[i])

function audienceLabel(input: ParentScopeSnapshot): string {
  if (input.visibility === 'all') return '全部家長'
  if (input.visibility === 'classroom') return `${input.classroomIds.length} 個班級的家長`
  // custom 只剩保留的進階 rows（監護人層級）時沒有學生數可報
  return input.studentIds.length > 0 ? `${input.studentIds.length} 位學生的家長` : '指定的家長'
}

function formatSchedule(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function buildParentPushConfirm(input: ParentPushConfirmInput): ParentPushConfirm | null {
  if (!['all', 'classroom', 'custom'].includes(input.visibility)) return null

  const { initial } = input
  if (
    input.isEdit
    && initial
    && initial.visibility === input.visibility
    && sameIds(initial.classroomIds, input.classroomIds)
    && sameIds(initial.studentIds, input.studentIds)
  ) {
    return null
  }

  const now = input.now ?? new Date()
  const scheduled = input.publishAt ? new Date(input.publishAt) : null
  const timing = scheduled && !Number.isNaN(scheduled.getTime()) && scheduled > now
    ? `將於 ${formatSchedule(scheduled)} 自動以 LINE 通知`
    : '儲存後會立即以 LINE 通知'

  const dedupe = input.isEdit ? '已通知過的家長不會重複收到。' : ''
  return {
    title: '確認通知家長',
    message: `${timing}${audienceLabel(input)}，送出後無法收回。${dedupe}`,
    confirmButtonText: input.isEdit ? '儲存並通知家長' : '發佈並通知家長',
  }
}
