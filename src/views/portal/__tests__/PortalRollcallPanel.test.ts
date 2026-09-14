import { describe, it, expect } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import ElementPlus from 'element-plus'

import PortalRollcallPanel from '../components/activity/PortalRollcallPanel.vue'

/**
 * 點名名冊面板。取代 ActivityRollcallDrawer（2026-09-14 點名改成獨立頁面）。
 *
 * 本檔承接原 drawer 兩棵測試樹的守衛，逐條搬過來而不是跟著元件一起刪：
 *  - 名冊全部渲染
 *  - 搜尋只影響顯示、不改 source（被濾掉的列輸入不能漏存）
 *  - 「只看未點名」（現在是「未點 N」chip）與搜尋可同時生效
 *  - 換名冊時重置搜尋與篩選
 *  - 儲存會往上 emit
 * 另外新增本次改版的守衛：三態不被改寫（P0）、批次只補未點名、沒有「全部缺席」。
 */
type Student = {
  registration_id: number
  student_name: string
  class_name: string
  classroom_id: number | null
  is_present: boolean | null
  attendance_notes: string
}

function makeStudents(): Student[] {
  return reactive([
    { registration_id: 1, student_name: '王小明', class_name: '天堂鳥', classroom_id: 1, is_present: null, attendance_notes: '' },
    { registration_id: 2, student_name: '張詠晴', class_name: '天堂鳥', classroom_id: 1, is_present: true, attendance_notes: '' },
    { registration_id: 3, student_name: '陳語彤', class_name: '蒲公英', classroom_id: 2, is_present: null, attendance_notes: '' },
    { registration_id: 4, student_name: '李柏睿', class_name: '蒲公英', classroom_id: 2, is_present: false, attendance_notes: '遲到' },
  ]) as Student[]
}

function groupsOf(students: Student[]) {
  return [
    { classroom_id: 1, classroom_name: '天堂鳥', students: students.filter((s) => s.classroom_id === 1) },
    { classroom_id: 2, classroom_name: '蒲公英', students: students.filter((s) => s.classroom_id === 2) },
  ]
}

function mountPanel(students: Student[], extra: Record<string, unknown> = {}) {
  return mount(PortalRollcallPanel, {
    props: {
      groups: groupsOf(students),
      students,
      presentCount: students.filter((s) => s.is_present === true).length,
      absentCount: students.filter((s) => s.is_present === false).length,
      unmarkedCount: students.filter((s) => s.is_present === null).length,
      ...extra,
    },
    global: { plugins: [ElementPlus] },
  })
}

async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 20))
  await flushPromises()
}

describe('PortalRollcallPanel 出缺席三態', () => {
  it('掛載未點名的名冊後 is_present 必須維持 null（P0 回歸）', async () => {
    const students = makeStudents()

    const wrapper = mountPanel(students)
    await settle()

    expect(wrapper.findAll('[data-test="rollcall-student"]').length).toBe(4)
    expect(students.map((s) => s.is_present)).toEqual([null, true, null, false])
  })

  it('未點名的列標出「未點」，兩顆皆未選取', async () => {
    const wrapper = mountPanel(makeStudents())
    await settle()

    const rows = wrapper.findAll('[data-test="rollcall-student"]')
    expect(rows[0].text()).toContain('未點')
    expect(rows[0].find('[data-test="mark-present"]').attributes('aria-pressed')).toBe('false')
    expect(rows[0].find('[data-test="mark-absent"]').attributes('aria-pressed')).toBe('false')
    // 已標記出席的那位不該有「未點」
    expect(rows[1].text()).not.toContain('未點')
    expect(rows[1].find('[data-test="mark-present"]').attributes('aria-pressed')).toBe('true')
  })

  it('點「缺席」只改那一列，並自動展開備註欄', async () => {
    const students = makeStudents()
    const wrapper = mountPanel(students)
    await settle()

    const first = wrapper.findAll('[data-test="rollcall-student"]')[0]
    await first.find('[data-test="mark-absent"]').trigger('click')
    await settle()

    expect(students.map((s) => s.is_present)).toEqual([false, true, null, false])
    expect(first.find('input[placeholder="備註（選填）"]').exists()).toBe(true)
  })

  it('備註預設收起，有值的才展開', async () => {
    const wrapper = mountPanel(makeStudents())
    await settle()

    const rows = wrapper.findAll('[data-test="rollcall-student"]')
    // 第 1 位沒備註 → 收起，只有「加備註」
    expect(rows[0].find('input[placeholder="備註（選填）"]').exists()).toBe(false)
    expect(rows[0].text()).toContain('加備註')
    // 第 4 位有備註 → 展開
    expect(rows[3].find('input[placeholder="備註（選填）"]').exists()).toBe(true)
  })
})

describe('PortalRollcallPanel 顯示篩選', () => {
  it('依班分組渲染全部學生', async () => {
    const wrapper = mountPanel(makeStudents())
    await settle()

    const groups = wrapper.findAll('[data-test="rollcall-group"]')
    expect(groups.length).toBe(2)
    expect(groups[0].text()).toContain('天堂鳥')
    expect(groups[1].text()).toContain('蒲公英')
    expect(wrapper.findAll('[data-test="rollcall-student"]').length).toBe(4)
  })

  it('「未點」chip 只顯示未點名的人', async () => {
    const wrapper = mountPanel(makeStudents())
    await settle()

    await wrapper.find('[data-test="filter-unmarked"]').trigger('click')
    await settle()

    const names = wrapper.findAll('[data-test="rollcall-student"]').map((r) => r.text())
    expect(names.length).toBe(2)
    expect(names.join()).toContain('王小明')
    expect(names.join()).toContain('陳語彤')
  })

  it('搜尋姓名只影響顯示', async () => {
    const wrapper = mountPanel(makeStudents())
    await settle()

    await wrapper.find('input[data-test="rollcall-search"]').setValue('語彤')
    await settle()

    expect(wrapper.findAll('[data-test="rollcall-student"]').length).toBe(1)
    expect(wrapper.text()).toContain('陳語彤')
  })

  it('搜尋與 chip 可同時生效', async () => {
    const wrapper = mountPanel(makeStudents())
    await settle()

    await wrapper.find('[data-test="filter-unmarked"]').trigger('click')
    await wrapper.find('input[data-test="rollcall-search"]').setValue('王')
    await settle()

    expect(wrapper.findAll('[data-test="rollcall-student"]').length).toBe(1)
    expect(wrapper.text()).toContain('王小明')
  })

  it('被濾掉的列，值原封不動保留（儲存不漏）', async () => {
    const students = makeStudents()
    const wrapper = mountPanel(students)
    await settle()

    await wrapper.find('input[data-test="rollcall-search"]').setValue('王小明')
    await settle()

    expect(wrapper.findAll('[data-test="rollcall-student"]').length).toBe(1)
    // 沒被顯示的那三位的輸入完全沒動
    expect(students.map((s) => s.is_present)).toEqual([null, true, null, false])
    expect(students[3].attendance_notes).toBe('遲到')
  })

  it('換名冊（換場次）時重置搜尋與篩選', async () => {
    const students = makeStudents()
    const wrapper = mountPanel(students)
    await settle()

    await wrapper.find('[data-test="filter-unmarked"]').trigger('click')
    await wrapper.find('input[data-test="rollcall-search"]').setValue('王')
    await settle()
    expect(wrapper.findAll('[data-test="rollcall-student"]').length).toBe(1)

    const next = makeStudents()
    await wrapper.setProps({ students: next, groups: groupsOf(next) })
    await settle()

    expect(wrapper.findAll('[data-test="rollcall-student"]').length).toBe(4)
  })
})

describe('PortalRollcallPanel 批次與儲存', () => {
  it('批次鈕只補未點名者，並帶出人數', async () => {
    const wrapper = mountPanel(makeStudents())
    await settle()

    const bulk = wrapper.find('[data-test="mark-unmarked-present"]')
    expect(bulk.text()).toContain('未點名者全部出席（2）')

    await bulk.trigger('click')
    expect(wrapper.emitted('set-unmarked-present')).toHaveLength(1)
  })

  it('沒有「全部缺席」按鈕', async () => {
    const wrapper = mountPanel(makeStudents())
    await settle()

    expect(wrapper.text()).not.toContain('全部缺席')
    expect(wrapper.text()).not.toContain('全班缺席')
  })

  it('全部點完時批次鈕停用', async () => {
    const students = makeStudents()
    students.forEach((s) => {
      s.is_present = true
    })
    const wrapper = mountPanel(students)
    await settle()

    expect(
      wrapper.find('[data-test="mark-unmarked-present"]').attributes('disabled'),
    ).toBeDefined()
  })

  it('班級層級「全班出席」只在該班還有未點名時出現', async () => {
    const students = makeStudents()
    const wrapper = mountPanel(students)
    await settle()

    const groups = wrapper.findAll('[data-test="rollcall-group"]')
    expect(groups[0].find('[data-test="group-present"]').exists()).toBe(true)

    await groups[0].find('[data-test="group-present"]').trigger('click')
    expect(wrapper.emitted('set-group-present')).toHaveLength(1)
  })

  it('整班點完的班級改顯示已完成', async () => {
    const students = makeStudents()
    students[0].is_present = true
    const wrapper = mountPanel(students)
    await settle()

    const first = wrapper.findAll('[data-test="rollcall-group"]')[0]
    expect(first.find('[data-test="group-present"]').exists()).toBe(false)
    expect(first.text()).toContain('已完成 2／2')
  })

  it('儲存往上 emit', async () => {
    const wrapper = mountPanel(makeStudents())
    await settle()

    await wrapper.find('[data-test="rollcall-save"]').trigger('click')

    expect(wrapper.emitted('save')).toHaveLength(1)
  })

  it('儲存列講清楚未點名不會被記為缺席', async () => {
    const wrapper = mountPanel(makeStudents())
    await settle()

    const text = wrapper.text()
    expect(text).toContain('還有 2 位未點名')
    expect(text).toContain('不會記為缺席')
  })

  it('全部點完後不再顯示未點名警語', async () => {
    const students = makeStudents()
    students.forEach((s) => {
      s.is_present = true
    })
    const wrapper = mountPanel(students)
    await settle()

    expect(wrapper.text()).toContain('全部 4 位都點完了')
    expect(wrapper.text()).not.toContain('不會記為缺席')
  })

  it('唯讀時不顯示批次與儲存，控制項一併停用', async () => {
    const wrapper = mountPanel(makeStudents(), { canWrite: false })
    await settle()

    expect(wrapper.find('[data-test="mark-unmarked-present"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="rollcall-save"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="group-present"]').exists()).toBe(false)
    const marks = wrapper.findAll('[data-test="mark-present"]')
    expect(marks.length).toBe(4)
    expect(marks.every((m) => m.attributes('disabled') !== undefined)).toBe(true)
  })
})
