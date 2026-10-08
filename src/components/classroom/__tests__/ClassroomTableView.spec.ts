import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, inject, provide } from 'vue'
import ClassroomTableView from '../ClassroomTableView.vue'
import type { ClassroomRow } from '../types'

// 年級分組密集表（班級管理主頁預設檢視）：分組/排序/彙總/狀態文字/停用防呆/emit 契約。

const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('@/composables/useIsMobile', async () => {
  const { ref } = await import('vue')
  return { useIsMobile: () => ({ isMobile: ref(mobile.value), cleanup: () => {} }) }
})

// Element Plus dropdown 的最小替身：保留「點選項 → 父層 command 事件、disabled 不觸發」的語意，
// 並把 dropdown slot 直接渲染出來（真 EP 要點開才 teleport，測試無法斷言內容）。
const ElDropdownStub = defineComponent({
  emits: ['command'],
  setup(_, { slots, emit }) {
    provide('dropdown-command', (cmd: string) => emit('command', cmd))
    return () => h('div', { class: 'el-dropdown-stub' }, [slots.default?.(), slots.dropdown?.()])
  },
})
const ElDropdownItemStub = defineComponent({
  props: { command: { type: String, default: '' }, disabled: Boolean, divided: Boolean, icon: { type: null, default: null } },
  setup(props, { slots }) {
    const run = inject<(cmd: string) => void>('dropdown-command')
    return () => h('div', {
      role: 'menuitem',
      'data-command': props.command,
      'aria-disabled': props.disabled ? 'true' : undefined,
      onClick: () => { if (!props.disabled) run?.(props.command) },
    }, slots.default?.())
  },
})

const stubs = {
  'el-dropdown': ElDropdownStub,
  'el-dropdown-menu': { template: '<div role="menu"><slot /></div>' },
  'el-dropdown-item': ElDropdownItemStub,
  'el-button': { template: '<button type="button"><slot /></button>' },
  'el-icon': { template: '<i><slot /></i>' },
}

const GRADES = [
  { id: 1, name: '幼幼班', sort_order: 1 },
  { id: 2, name: '小班', sort_order: 2 },
  { id: 3, name: '中班', sort_order: 3 },
  { id: 4, name: '大班', sort_order: 4 },
]

let nextId = 1
const mk = (o: Partial<ClassroomRow> = {}): ClassroomRow => ({
  id: nextId++,
  name: `班${nextId}`,
  school_year: 115,
  semester: 1,
  is_active: true,
  grade_id: 4,
  grade_name: '大班',
  capacity: 30,
  current_count: 10,
  head_teacher_name: '王老師',
  ...o,
})

type Props = InstanceType<typeof ClassroomTableView>['$props']
const mountTable = (classrooms: ClassroomRow[], props: Partial<Props> = {}) => mount(ClassroomTableView, {
  props: {
    classrooms,
    grades: GRADES,
    canWrite: true,
    canReadStudents: true,
    reservedByGrade: {},
    ...props,
  },
  global: { stubs },
})

const rowTexts = (wrapper: ReturnType<typeof mountTable>) => (
  wrapper.findAll('[data-test="classroom-row"]').map((r) => r.find('.class-name-btn, .m-row__name').text())
)

beforeEach(() => {
  nextId = 1
  mobile.value = false
})

describe('ClassroomTableView 結構', () => {
  it('用真正的 table：thead 七欄、每組一個 tbody、組標頭是 th[scope=rowgroup][colspan=7]', () => {
    const wrapper = mountTable([
      mk({ name: '甲', grade_name: '大班' }),
      mk({ name: '乙', grade_name: '小班', grade_id: 2 }),
    ])

    expect(wrapper.find('[data-test="classroom-table"]').exists()).toBe(true)
    expect(wrapper.find('table').exists()).toBe(true)
    const heads = wrapper.findAll('thead th').map((th) => th.text())
    expect(heads).toEqual(['班級', '在籍 / 容量', '尚餘', '班導', '副班導', '美語老師', '操作'])
    expect(wrapper.findAll('tbody').length).toBe(2)
    const groupTh = wrapper.find('tbody tr.group-row th')
    expect(groupTh.attributes('scope')).toBe('rowgroup')
    expect(groupTh.attributes('colspan')).toBe('7')
  })
})

describe('ClassroomTableView 分組與排序', () => {
  it('組序依 grades.sort_order；不在 grades 的年級排其後；未設定年級排最後', () => {
    const wrapper = mountTable([
      mk({ name: '無年級班', grade_name: undefined, grade_id: null }),
      mk({ name: '大A', grade_name: '大班', grade_id: 4 }),
      mk({ name: '特殊A', grade_name: '特殊班', grade_id: 9 }),
      mk({ name: '幼A', grade_name: '幼幼班', grade_id: 1 }),
      mk({ name: '中A', grade_name: '中班', grade_id: 3 }),
      mk({ name: '小A', grade_name: '小班', grade_id: 2 }),
    ])

    const order = wrapper.findAll('[data-test="group-row"]').map((g) => g.find('.group-name').text())
    expect(order).toEqual(['幼幼班', '小班', '中班', '大班', '特殊班', '未設定年級'])
  })

  it('組內依班級代號自然排序（大2 在 大10 前）、無代號排最後、再依名稱', () => {
    const wrapper = mountTable([
      mk({ name: '丙', class_code: '大10' }),
      mk({ name: '無碼B', class_code: null }),
      mk({ name: '乙', class_code: '大2' }),
      mk({ name: '無碼A', class_code: undefined }),
      mk({ name: '甲', class_code: '大1' }),
    ])

    expect(rowTexts(wrapper)).toEqual(['甲', '乙', '丙', '無碼A', '無碼B'])
  })
})

describe('ClassroomTableView 組標頭與表尾彙總', () => {
  it('組標頭：N 班 · 在籍 X / Y · 尚餘 Z（停用班不計入）', () => {
    const wrapper = mountTable([
      mk({ capacity: 30, current_count: 10 }),
      mk({ capacity: 30, current_count: 20 }),
      mk({ capacity: 30, current_count: 0, is_active: false }),
    ])

    const header = wrapper.find('[data-test="group-row"]').text()
    expect(header).toContain('大班')
    expect(header).toContain('2 班 · 在籍 30 / 60 · 尚餘 30')
  })

  it('保留數是年級口徑，只出現在組標頭，且僅 reserved > 0 的年級才有', () => {
    const wrapper = mountTable(
      [
        mk({ grade_name: '大班', grade_id: 4 }),
        mk({ grade_name: '大班', grade_id: 4 }),
        mk({ grade_name: '小班', grade_id: 2 }),
      ],
      { reservedByGrade: { 4: 5 } },
    )

    const groups = wrapper.findAll('[data-test="group-row"]')
    const small = groups.find((g) => g.text().includes('小班'))!
    const big = groups.find((g) => g.text().includes('大班'))!
    expect(big.text()).toContain('保留 5')
    expect(small.text()).not.toContain('保留')
    // 全表只出現一次：班級列不重複顯示年級口徑的保留數
    expect(wrapper.text().match(/保留/g)?.length).toBe(1)
  })

  it('表尾：合計 N 班 · 在籍 X / Y · 尚餘 Z（以傳入清單中啟用的班計算）', () => {
    const wrapper = mountTable([
      mk({ grade_name: '大班', capacity: 30, current_count: 27 }),
      mk({ grade_name: '小班', grade_id: 2, capacity: 25, current_count: 25 }),
      mk({ grade_name: '小班', grade_id: 2, capacity: 25, current_count: 3, is_active: false }),
    ])

    expect(wrapper.find('tfoot').text()).toContain('合計 2 班 · 在籍 52 / 55 · 尚餘 3')
  })
})

describe('ClassroomTableView 容量與師資顯示', () => {
  it('接近額滿與已滿有文字（不只靠顏色），正常不附文字；尚餘靠右', () => {
    const wrapper = mountTable([
      mk({ name: '甲', class_code: '大1', capacity: 30, current_count: 27 }),
      mk({ name: '乙', class_code: '大2', capacity: 30, current_count: 30 }),
      mk({ name: '丙', class_code: '大3', capacity: 30, current_count: 10 }),
    ])

    const [near, full, normal] = wrapper.findAll('[data-test="classroom-row"]')
    expect(near.text()).toContain('27 / 30')
    expect(near.text()).toContain('接近額滿')
    expect(near.find('.col-remain').text()).toBe('3')
    expect(full.text()).toContain('已滿')
    expect(full.find('.col-remain').text()).toBe('0')
    expect(normal.text()).not.toContain('接近額滿')
    expect(normal.text()).not.toContain('已滿')
    expect(normal.find('.col-remain').text()).toBe('20')
  })

  it('進度條自繪且 aria-hidden（狀態以文字為準）', () => {
    const wrapper = mountTable([mk({ capacity: 30, current_count: 15 })])

    const bar = wrapper.find('[data-test="classroom-row"] .bar')
    expect(bar.exists()).toBe(true)
    expect(bar.attributes('aria-hidden')).toBe('true')
  })

  it('班導未指派顯示「未指派」；副班導空值「—」；美語老師 fallback art_teacher_name', () => {
    const wrapper = mountTable([
      mk({ name: '甲', class_code: '大1', head_teacher_name: null, assistant_teacher_name: null, english_teacher_name: null, art_teacher_name: '藝老師' }),
      mk({ name: '乙', class_code: '大2', head_teacher_name: '張老師', assistant_teacher_name: '李老師', english_teacher_name: '陳老師' }),
    ])

    const [a, b] = wrapper.findAll('[data-test="classroom-row"]')
    expect(a.find('.col-head').text()).toBe('未指派')
    expect(a.find('.col-head').classes()).toContain('is-missing')
    expect(a.find('.col-assistant').text()).toBe('—')
    expect(a.find('.col-english').text()).toBe('藝老師')
    expect(b.find('.col-head').text()).toBe('張老師')
    expect(b.find('.col-assistant').text()).toBe('李老師')
    expect(b.find('.col-english').text()).toBe('陳老師')
  })

  it('停用班：帶「已停用」tag，且班導空值不亮「未指派」警示', () => {
    const wrapper = mountTable([
      mk({ name: '舊班', is_active: false, head_teacher_name: null, current_count: 0 }),
    ])

    const row = wrapper.find('[data-test="classroom-row"]')
    expect(row.text()).toContain('已停用')
    expect(row.find('.col-head').text()).toBe('—')
  })
})

describe('ClassroomTableView 操作與 emit', () => {
  it('點班名與「名冊」都 emit open(classroom)，且各只觸發一次', async () => {
    const c = mk({ name: '甲' })
    const wrapper = mountTable([c])

    await wrapper.find('.class-name-btn').trigger('click')
    expect(wrapper.emitted('open')).toEqual([[c]])

    await wrapper.find('[data-test="row-open"]').trigger('click')
    expect(wrapper.emitted('open')).toEqual([[c], [c]])
  })

  it('整列點擊也 emit open；操作欄的點擊不會冒泡成開啟名冊', async () => {
    const c = mk({ name: '甲' })
    const wrapper = mountTable([c])

    await wrapper.find('[data-test="classroom-row"]').trigger('click')
    expect(wrapper.emitted('open')).toEqual([[c]])

    await wrapper.find('[data-test="row-menu"]').trigger('click')
    expect(wrapper.emitted('open')).toEqual([[c]])
  })

  it('⋯ 按鈕帶班名 aria-label；選單項點擊 emit command(cmd, classroom)', async () => {
    const c = mk({ name: '甲', current_count: 0 })
    const wrapper = mountTable([c])

    expect(wrapper.find('[data-test="row-menu"]').attributes('aria-label')).toBe('更多操作：甲')

    await wrapper.find('[data-command="edit"]').trigger('click')
    await wrapper.find('[data-command="history"]').trigger('click')
    await wrapper.find('[data-command="disable"]').trigger('click')
    expect(wrapper.emitted('command')).toEqual([
      ['edit', c],
      ['history', c],
      ['disable', c],
    ])
  })

  it('選單文案：「異動紀錄」取代舊的「歷史紀錄」', () => {
    const wrapper = mountTable([mk({ current_count: 0 })])

    const menu = wrapper.find('[role="menu"]').text()
    expect(menu).toContain('編輯班級')
    expect(menu).toContain('異動紀錄')
    expect(menu).not.toContain('歷史紀錄')
  })

  it('仍有在學生：停用項 disabled 並顯示原因，點了不 emit', async () => {
    const c = mk({ name: '甲', current_count: 12 })
    const wrapper = mountTable([c])

    const item = wrapper.find('[data-command="disable"]')
    expect(item.attributes('aria-disabled')).toBe('true')
    expect(item.text()).toContain('停用班級')
    expect(item.text()).toContain('仍有 12 名在學，請先轉班')

    await item.trigger('click')
    expect(wrapper.emitted('command')).toBeUndefined()
  })

  it('沒有在學生：停用項可用且不帶原因文字', () => {
    const wrapper = mountTable([mk({ current_count: 0 })])

    const item = wrapper.find('[data-command="disable"]')
    expect(item.attributes('aria-disabled')).toBeUndefined()
    expect(item.text()).not.toContain('請先轉班')
  })

  it('已停用的班沒有「停用班級」項', () => {
    const wrapper = mountTable([mk({ is_active: false, current_count: 0 })])

    expect(wrapper.find('[data-command="disable"]').exists()).toBe(false)
  })

  it('權限：無 CLASSROOMS_WRITE 沒有編輯/停用；無 STUDENTS_READ 沒有名冊鈕與異動紀錄', () => {
    const readOnly = mountTable([mk({ current_count: 0 })], { canWrite: false, canReadStudents: true })
    expect(readOnly.find('[data-command="edit"]').exists()).toBe(false)
    expect(readOnly.find('[data-command="disable"]').exists()).toBe(false)
    expect(readOnly.find('[data-command="history"]').exists()).toBe(true)
    expect(readOnly.find('[data-test="row-open"]').exists()).toBe(true)

    const writeOnly = mountTable([mk({ current_count: 0 })], { canWrite: true, canReadStudents: false })
    expect(writeOnly.find('[data-test="row-open"]').exists()).toBe(false)
    expect(writeOnly.find('[data-command="history"]').exists()).toBe(false)
    expect(writeOnly.find('[data-command="edit"]').exists()).toBe(true)

    const none = mountTable([mk()], { canWrite: false, canReadStudents: false })
    expect(none.find('[data-test="row-menu"]').exists()).toBe(false)
    expect(none.find('[data-test="row-open"]').exists()).toBe(false)
  })
})

describe('ClassroomTableView 手機版', () => {
  beforeEach(() => { mobile.value = true })

  it('不渲染 table，改為依年級分組的清單；每班一個可點的 button，內含班名/代號/在籍/師資', async () => {
    const c = mk({
      name: '甲', class_code: '大1', capacity: 30, current_count: 27,
      head_teacher_name: '王老師', assistant_teacher_name: '林老師',
    })
    const wrapper = mountTable([c, mk({ name: '乙', grade_name: '小班', grade_id: 2, assistant_teacher_name: null })])

    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.find('[data-test="classroom-table"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-test="group-row"]').map((g) => g.find('.group-name').text())).toEqual(['小班', '大班'])

    const row = wrapper.findAll('[data-test="classroom-row"]').find((r) => r.text().includes('甲'))!
    const main = row.find('button.m-row__main')
    expect(main.exists()).toBe(true)
    expect(main.text()).toContain('大1')
    expect(main.text()).toContain('27 / 30')
    expect(main.text()).toContain('接近額滿')
    expect(main.text()).toContain('班導 王老師 · 副班 林老師')

    await main.trigger('click')
    expect(wrapper.emitted('open')).toEqual([[c]])
  })

  it('手機版 ⋯ 選單保留，點選單不會開名冊；沒有副班導時只寫班導', async () => {
    const c = mk({ name: '乙', assistant_teacher_name: null, current_count: 0 })
    const wrapper = mountTable([c])

    expect(wrapper.find('.m-row__teachers').text()).toBe('班導 王老師')
    await wrapper.find('[data-test="row-menu"]').trigger('click')
    await wrapper.find('[data-command="edit"]').trigger('click')
    expect(wrapper.emitted('open')).toBeUndefined()
    expect(wrapper.emitted('command')).toEqual([['edit', c]])
  })
})
