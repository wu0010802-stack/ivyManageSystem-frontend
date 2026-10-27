import { describe, it, expect } from 'vitest'
import { buildParentPushConfirm } from '../announcementPushConfirm'

const NOW = new Date('2026-10-27T10:00:00')
const base = {
  isEdit: false,
  visibility: 'all',
  classroomIds: [] as number[],
  studentIds: [] as number[],
  initial: null,
  publishAt: null as string | null,
  now: NOW,
}

describe('buildParentPushConfirm', () => {
  it('不對家長公開或讀取失敗（unchanged）時不需確認', () => {
    expect(buildParentPushConfirm({ ...base, visibility: 'off' })).toBeNull()
    expect(buildParentPushConfirm({ ...base, visibility: 'unchanged' })).toBeNull()
  })

  it('新增公告給全部家長：立即通知、說明無法收回', () => {
    const c = buildParentPushConfirm(base)!
    expect(c.message).toContain('全部家長')
    expect(c.message).toContain('立即')
    expect(c.message).toContain('無法收回')
    expect(c.confirmButtonText).toBe('發佈並通知家長')
  })

  it('指定班級／指定學生帶出數量', () => {
    expect(buildParentPushConfirm({ ...base, visibility: 'classroom', classroomIds: [1, 2, 3] })!.message)
      .toContain('3 個班級的家長')
    expect(buildParentPushConfirm({ ...base, visibility: 'custom', studentIds: [5, 6] })!.message)
      .toContain('2 位學生的家長')
  })

  it('排程發佈（publish_at 在未來）改說明通知時間，不說立即', () => {
    const c = buildParentPushConfirm({ ...base, publishAt: '2026-10-30T08:00:00' })!
    expect(c.message).toContain('10/30 08:00')
    expect(c.message).not.toContain('立即')
  })

  it('publish_at 已過去仍視為立即通知', () => {
    expect(buildParentPushConfirm({ ...base, publishAt: '2026-10-01T08:00:00' })!.message).toContain('立即')
  })

  it('編輯且家長對象未變更時不需確認（不會有人收到新通知）', () => {
    const initial = { visibility: 'classroom', classroomIds: [2, 1], studentIds: [] }
    expect(buildParentPushConfirm({
      ...base, isEdit: true, visibility: 'classroom', classroomIds: [1, 2], initial,
    })).toBeNull()
  })

  it('編輯且家長對象有變更時要確認，並說明已通知者不重複收到', () => {
    const initial = { visibility: 'classroom', classroomIds: [1], studentIds: [] }
    const c = buildParentPushConfirm({
      ...base, isEdit: true, visibility: 'classroom', classroomIds: [1, 2], initial,
    })!
    expect(c.message).toContain('不會重複收到')
    expect(c.confirmButtonText).toBe('儲存並通知家長')
  })

  it('編輯但原本不對家長公開、現在改公開，視為變更', () => {
    const initial = { visibility: 'off', classroomIds: [], studentIds: [] }
    expect(buildParentPushConfirm({ ...base, isEdit: true, initial })).not.toBeNull()
  })
})
