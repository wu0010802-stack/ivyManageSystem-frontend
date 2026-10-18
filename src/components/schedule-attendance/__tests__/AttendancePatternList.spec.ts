import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import AttendancePatternList from '../AttendancePatternList.vue'
import type { AttendancePattern } from '@/utils/attendancePatterns'

const perms = vi.hoisted(() => ({ set: new Set<string>() }))
vi.mock('@/utils/auth', () => ({ hasPermission: (code: string) => perms.set.has(code) }))

const notInImport: AttendancePattern = {
  kind: 'no_punches', employeeId: 7, name: '陳瑞玲', roleLabel: '副班導', issueCount: 20, matchCount: 20, expectedDays: 20, punchedDays: 0, firstDate: '2026-09-01', notInImport: true,
}
const fewPunches: AttendancePattern = {
  kind: 'no_punches', employeeId: 8, name: '林佳穎', roleLabel: '班導', issueCount: 20, matchCount: 20, expectedDays: 20, punchedDays: 1, firstDate: '2026-09-01', notInImport: false,
}
const halfDay: AttendancePattern = {
  kind: 'fixed_offset', employeeId: 9, name: '簡鳳儀', roleLabel: '美語老師', issueCount: 20, matchCount: 17, expectedDays: 20, punchedDays: 20, firstDate: '2026-09-01',
  bothDays: 20, lateDays: 20, earlyDays: 20, typicalLate: 55, typicalEarly: 315, typicalIn: '08:55', typicalOut: '11:45', planWindow: '08:00–17:00',
}

function mountList(patterns: AttendancePattern[]) {
  return mount(AttendancePatternList, {
    props: { patterns },
    global: { plugins: [ElementPlus], stubs: { RouterLink: RouterLinkStub } },
  })
}

beforeEach(() => {
  perms.set = new Set(['ATTENDANCE_READ', 'ATTENDANCE_WRITE', 'EMPLOYEES_READ'])
})

describe('AttendancePatternList', () => {
  it('依型態分段，寫出人、待處理格數、型態與該怎麼修', () => {
    const wrapper = mountList([notInImport, fewPunches, halfDay])
    const noPunch = wrapper.get('[data-test="pattern-section-no_punches"]')
    expect(noPunch.text()).toContain('本月幾乎沒有打卡（2 人）')
    // 沒打卡對薪資的後果要寫出來（正職會被算曠職）
    expect(noPunch.text()).toContain('算曠職扣款')
    const first = wrapper.get('[data-test="pattern-7"]')
    expect(first.text()).toContain('陳瑞玲')
    expect(first.text()).toContain('待處理 20 格')
    expect(first.text()).toContain('匯入的打卡檔裡沒有這位員工')
    expect(first.text()).toContain('卡號對照')
    expect(wrapper.get('[data-test="pattern-8"]').text()).toContain('只有 1 天有打卡')

    const offset = wrapper.get('[data-test="pattern-section-fixed_offset"]')
    expect(offset.text()).toContain('每天固定遲到或早退（1 人）')
    // 改了設定要重匯才會重算扣款（存檔的遲到早退不會自己變）
    expect(offset.text()).toContain('重新匯入本月打卡')
    const item = wrapper.get('[data-test="pattern-9"]')
    // 這個人還有 3 格是別的待處理：分開寫
    expect(item.text()).toContain('17 格是這個型態（共待處理 20 格）')
    expect(item.text()).toContain('20 天遲到（多為 55 分）、20 天早退（多為 315 分）')
    expect(item.text()).toContain('實際多在 08:55 上班、11:45 下班')
    expect(item.text()).toContain('08:00–17:00')
  })

  it('看他整月帶人與第一個應上班日；匯入打卡只給不在匯入檔的人；員工資料連到該員工', async () => {
    const wrapper = mountList([notInImport, fewPunches, halfDay])
    await wrapper.get('[data-test="pattern-records-9"]').trigger('click')
    expect(wrapper.emitted('records')).toEqual([[9, '2026-09-01']])
    await wrapper.get('[data-test="pattern-import-7"]').trigger('click')
    expect(wrapper.emitted('import')).toHaveLength(1)
    expect(wrapper.find('[data-test="pattern-import-8"]').exists()).toBe(false)
    const link = wrapper.findAllComponents(RouterLinkStub).find((l) => l.attributes('data-test') === 'pattern-employee-9')
    expect(link?.props('to')).toBe('/employees/9')
  })

  it('沒有匯入或員工讀取權限就不給那兩個入口', () => {
    perms.set = new Set(['ATTENDANCE_READ'])
    const wrapper = mountList([notInImport, halfDay])
    expect(wrapper.find('[data-test="pattern-import-7"]').exists()).toBe(false)
    expect(wrapper.findAllComponents(RouterLinkStub)).toHaveLength(0)
    expect(wrapper.find('[data-test="pattern-records-7"]').exists()).toBe(true)
  })

  it('只有一種型態時不顯示另一段', () => {
    const wrapper = mountList([halfDay])
    expect(wrapper.find('[data-test="pattern-section-no_punches"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="pattern-section-fixed_offset"]').exists()).toBe(true)
  })
})
