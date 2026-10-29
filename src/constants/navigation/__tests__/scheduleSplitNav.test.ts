/**
 * 排班獨立成側欄項目「排班」（/schedule），原「排班與出勤」改名「出勤核對」只留核對
 *（後台 IA 重整 批次 3 / S3，2026-10-29；SPEC-027 合併的反轉）。
 *
 * 權限語意：SCHEDULE 主屬 /schedule、ATTENDANCE_READ 主屬 /attendance，兩者互不借道。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { NAVIGATION_MANIFEST, ROUTE_PERMISSION_RULES, SIDEBAR_TREE } from '@/constants/navigation'
import { canAccessRoute, setUserInfo } from '@/utils/auth'

const leavePages = NAVIGATION_MANIFEST.groups.find((g) => g.key === 'leave')!.pages
const page = (key: string) => leavePages.find((p) => p.key === key)!
const rulesAt = (path: string) => ROUTE_PERMISSION_RULES.filter((r) => r.path === path).map((r) => r.permission)

describe('排班 / 出勤核對 manifest', () => {
  it('兩個頁面都在人事薪資群，排班在出勤核對之前', () => {
    const keys = leavePages.map((p) => p.key)
    expect(keys.indexOf('schedule')).toBeGreaterThan(-1)
    expect(keys.indexOf('attendance')).toBeGreaterThan(keys.indexOf('schedule'))
    expect(page('schedule').title).toBe('排班')
    expect(page('attendance').title).toBe('出勤核對')
  })

  it('SCHEDULE 主屬 /schedule；/attendance 只吃 ATTENDANCE_READ（不再借道 SCHEDULE）', () => {
    expect(page('schedule').routePath).toBe('/schedule')
    expect(page('schedule').views.map((v) => v.code)).toEqual(['SCHEDULE'])
    expect(page('attendance').routePath).toBe('/attendance')
    expect(page('attendance').views.map((v) => v.code)).toEqual(['ATTENDANCE_READ'])
    expect((page('attendance').actions ?? []).map((a) => a.code)).toEqual(['ATTENDANCE_WRITE'])
    expect(rulesAt('/schedule')).toEqual(['SCHEDULE'])
    expect(rulesAt('/attendance')).toEqual(['ATTENDANCE_READ'])
  })

  it('側欄兩項圖示不同（同群組不重複）', () => {
    const leave = SIDEBAR_TREE.groups.find((g) => g.index === 'group-leave')!
    const schedule = leave.items.find((i) => i.index === '/schedule')
    const attendance = leave.items.find((i) => i.index === '/attendance')
    expect(schedule && attendance).toBeTruthy()
    expect(schedule!.icon).not.toBe(attendance!.icon)
  })
})

describe('權限不放寬、不縮水', () => {
  beforeEach(() => localStorage.clear())

  it.each([
    [['SCHEDULE'], '/schedule', true],
    [['SCHEDULE'], '/attendance', false],
    [['ATTENDANCE_READ'], '/attendance', true],
    [['ATTENDANCE_READ'], '/schedule', false],
    [['ATTENDANCE_READ', 'SCHEDULE'], '/schedule', true],
    [['ATTENDANCE_READ', 'SCHEDULE'], '/attendance', true],
    [['ATTENDANCE_WRITE'], '/attendance', false],
  ] as const)('%j 進 %s → %s', (perms, path, ok) => {
    setUserInfo({ role: 'admin', permission_names: [...perms] })
    expect(canAccessRoute(path)).toBe(ok)
  })
})
