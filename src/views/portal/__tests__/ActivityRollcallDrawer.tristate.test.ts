import { describe, it, expect } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import ElementPlus from 'element-plus'

import ActivityRollcallDrawer from '../components/activity/ActivityRollcallDrawer.vue'

/**
 * P0 回歸（2026-09-14）：打開一場「尚未點名」的場次，畫面不得把任何學生改寫成缺席。
 *
 * 原本出缺席欄是 `el-switch`，Element Plus 會在掛載時把 null 改寫成 inactive-value
 * （false）。實跑後果：drawer 一開就顯示「缺席 13・未點名 0」、進度 100%，老師什麼
 * 都沒碰按下儲存就送出 13 筆 is_present=false 並提示「點名儲存成功」，而缺席會進
 * 退費堂數。composable 的「只送有異動的列」「未點名不可單獨存備註」等守衛因此全部
 * 失效——名冊上根本不再有 null。
 *
 * 本檔刻意掛真的 Element Plus（不 stub 表格與控制項），否則正是這個 bug 的盲區：
 * 既有測試把 el-table/el-switch 都 stub 掉，所以全綠。
 */
function makeStudents() {
  return reactive([
    { registration_id: 1, student_name: '王小明', class_name: '天堂鳥', is_present: null as boolean | null, attendance_notes: '' },
    { registration_id: 2, student_name: '陳語彤', class_name: '蒲公英', is_present: null as boolean | null, attendance_notes: '' },
    { registration_id: 3, student_name: '林承翰', class_name: '玫瑰', is_present: true as boolean | null, attendance_notes: '' },
  ])
}

function mountDrawer(students: ReturnType<typeof makeStudents>) {
  return mount(ActivityRollcallDrawer, {
    props: {
      modelValue: true,
      drawerTitle: '點名｜跆拳道｜2026-09-16',
      drawerLoading: false,
      drawerSession: { id: 7, course_name: '跆拳道', session_date: '2026-09-16', total: students.length },
      sortedStudents: students,
      saveLoading: false,
      drawerPresentCount: 1,
      drawerAbsentCount: 0,
      drawerUnmarkedCount: 2,
    },
    // el-drawer 會 teleport 到 body：不能 stub teleport（那樣整個 drawer 不渲染，
    // 斷言會全部假綠），要 attachTo body 再從 document 查。
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
}

function query(selector: string): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>(selector))
}

/**
 * 等到渲染真的安定。只 await 一次 nextTick 不夠：el-switch 的改寫是掛載期 emit，
 * 要再放行一輪 macrotask 才會落到父層的 students 上——少等這一輪，這個 P0 的斷言
 * 會通過（假綠）。
 */
async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 50))
  await flushPromises()
}

describe('ActivityRollcallDrawer 出缺席三態', () => {
  it('掛載未點名的名冊後，is_present 必須維持 null', async () => {
    const students = makeStudents()

    const wrapper = mountDrawer(students)
    await settle()

    // 名冊真的渲染出來了才算數（stub 掉表格時這條會假綠）
    expect(query('.el-drawer').length).toBe(1)
    expect(query('[data-test="mark-present"]').length).toBe(students.length)
    expect(students.map((s) => s.is_present)).toEqual([null, null, true])
    void wrapper
  })

  it('未點名的列渲染出「出席／缺席」兩顆皆未選取', async () => {
    const students = makeStudents()

    const wrapper = mountDrawer(students)
    await settle()

    const present = query('[data-test="mark-present"]')
    const absent = query('[data-test="mark-absent"]')
    expect(present.length).toBe(students.length)
    expect(present[0].getAttribute('aria-pressed')).toBe('false')
    expect(absent[0].getAttribute('aria-pressed')).toBe('false')
    // 第三位已標記出席
    expect(present[2].getAttribute('aria-pressed')).toBe('true')
    void wrapper
  })

  it('點下「缺席」才會把該列改成 false，且不影響其他列', async () => {
    const students = makeStudents()

    const wrapper = mountDrawer(students)
    await settle()
    query('[data-test="mark-absent"]')[0].click()
    await settle()
    void wrapper

    expect(students.map((s) => s.is_present)).toEqual([false, null, true])
  })
})
